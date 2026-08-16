import { getEffectiveProvider, type LLMProvider } from './providers';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  providerId: string;
  apiKey: string;
  model: string; // resolved model id ('' => provider default free model)
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export class LLMError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'LLMError';
    this.status = status;
  }
}

export function resolveModel(provider: LLMProvider, model: string | null | undefined): string {
  if (model && model.trim()) return model.trim();
  return provider.defaultFreeModel;
}

/**
 * Call a chat completion directly from the browser.
 * Supports OpenAI-compatible endpoints and Anthropic's Messages API.
 */
export async function chatCompletion(opts: ChatOptions): Promise<string> {
  const provider = getEffectiveProvider(opts.providerId);
  if (!provider) {
    throw new LLMError(`Unknown provider: ${opts.providerId}`);
  }
  const model = resolveModel(provider, opts.model);
  if (!model) {
    throw new LLMError('No model configured for this provider');
  }
  // Custom/self-hosted endpoints (Ollama, LM Studio, vLLM) may not need a key.
  if (!opts.apiKey.trim() && opts.providerId !== 'custom') {
    throw new LLMError(`No API key saved for ${provider.name}. Add one on the Home screen.`);
  }

  if (provider.format === 'anthropic') {
    return callAnthropic(provider, opts.apiKey, model, opts.messages, opts.maxTokens ?? 800);
  }
  return callOpenAICompat(provider, opts.apiKey, model, opts.messages, opts.maxTokens ?? 800, opts.temperature);
}

async function callOpenAICompat(
  provider: LLMProvider,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature = 0.7
): Promise<string> {
  const url = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const modelInfo = provider.models.find(m => m.id === model);
  const isReasoning = modelInfo?.reasoning;

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: isReasoning ? undefined : maxTokens,
    max_completion_tokens: isReasoning ? maxTokens : undefined,
    temperature: isReasoning ? undefined : temperature,
  };
  // strip undefined keys
  Object.keys(body).forEach(k => {
    if (body[k] === undefined) delete body[k];
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (provider.auth === 'bearer' && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const query = provider.auth === 'query' ? `?key=${encodeURIComponent(apiKey)}` : '';
  // OpenRouter likes an explicit app header (optional, harmless elsewhere)
  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'Probe Browser';
  }

  let response: Response;
  try {
    response = await fetch(url + query, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new LLMError(`Network error contacting ${provider.name}: ${(err as Error).message}`);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data?.error?.message || data?.message || JSON.stringify(data).slice(0, 300);
    } catch {
      detail = await response.text().catch(() => '');
    }
    throw new LLMError(
      `${provider.name} error (${response.status}): ${detail || response.statusText}`,
      response.status
    );
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new LLMError(`${provider.name} returned an empty response`);
  }
  return content;
}

async function callAnthropic(
  provider: LLMProvider,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number
): Promise<string> {
  const url = `${provider.baseUrl.replace(/\/$/, '')}/messages`;

  const system = messages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n');
  const rest = messages.filter(m => m.role !== 'system');

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: system || undefined,
        messages: rest,
      }),
    });
  } catch (err) {
    throw new LLMError(`Network error contacting ${provider.name}: ${(err as Error).message}`);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data?.error?.message || JSON.stringify(data).slice(0, 300);
    } catch {
      detail = await response.text().catch(() => '');
    }
    throw new LLMError(
      `${provider.name} error (${response.status}): ${detail || response.statusText}`,
      response.status
    );
  }

  const data = await response.json();
  const text = data?.content
    ?.filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('\n');
  if (typeof text !== 'string' || !text.trim()) {
    throw new LLMError(`${provider.name} returned an empty response`);
  }
  return text;
}

/** Quick connectivity check used by the "Test" button on the keys screen. */
export async function testConnection(providerId: string, apiKey: string, model?: string | null): Promise<string> {
  const provider = getEffectiveProvider(providerId);
  if (!provider) throw new LLMError('Unknown provider');
  const resolved = resolveModel(provider, model || provider.defaultFreeModel);
  const text = await chatCompletion({
    providerId,
    apiKey,
    model: resolved,
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    maxTokens: 16,
    temperature: 0,
  });
  return text.trim();
}

/** Try to extract a JSON object from a model reply (tolerates code fences/prose). */
export function extractJsonObject<T>(raw: string): T | null {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // find the first {...} block
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
