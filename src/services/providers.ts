// LLM provider registry for the browser-only build.
// Every provider here exposes an endpoint that is callable directly from the
// browser (CORS-enabled), so no backend/proxy is required. Each provider
// declares a "default free model" — the model used when the user picks
// "Default (free)" for a bot.

export type ApiFormat = 'openai' | 'anthropic';
export type AuthStyle = 'bearer' | 'x-api-key' | 'query';

export interface ProviderModel {
  id: string;
  label: string;
  free?: boolean; // free tier / free to use
  reasoning?: boolean; // o1/o3 style models with restricted params
}

export interface LLMProvider {
  id: string;
  name: string;
  format: ApiFormat;
  baseUrl: string; // base used to build the chat completions URL
  auth: AuthStyle;
  defaultFreeModel: string;
  models: ProviderModel[];
  keyUrl: string; // where to obtain an API key
  notes?: string;
}

export const PROVIDERS: LLMProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    format: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    auth: 'bearer',
    defaultFreeModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', free: true },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'o3-mini', label: 'o3-mini', reasoning: true },
    ],
    keyUrl: 'https://platform.openai.com/api-keys',
    notes: 'Paid API (no free tier); gpt-4o-mini is the cheapest default.',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    format: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    auth: 'query',
    defaultFreeModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', free: true },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', free: true },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', free: true },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    ],
    keyUrl: 'https://aistudio.google.com/apikey',
    notes: 'Free tier available (rate-limited).',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    format: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    auth: 'x-api-key',
    defaultFreeModel: 'claude-3-5-haiku-latest',
    models: [
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku', free: true },
      { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { id: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1' },
    ],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    notes: 'No free tier; Haiku is the cheapest default.',
  },
  {
    id: 'groq',
    name: 'Groq',
    format: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    auth: 'bearer',
    defaultFreeModel: 'llama-3.3-70b-versatile',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', free: true },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', free: true },
      { id: 'llama-3.2-3b-preview', label: 'Llama 3.2 3B', free: true },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', free: true },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B', free: true },
    ],
    keyUrl: 'https://console.groq.com/keys',
    notes: 'Free tier with generous rate limits — great default choice.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    format: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    auth: 'bearer',
    defaultFreeModel: 'meta-llama/llama-3.3-70b-instruct:free',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)', free: true },
      { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3 (free)', free: true },
      { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
    ],
    keyUrl: 'https://openrouter.ai/settings/keys',
    notes: 'One key for many models; :free models cost nothing.',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    format: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    auth: 'bearer',
    defaultFreeModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)', free: true },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)', reasoning: true },
    ],
    keyUrl: 'https://platform.deepseek.com/api_keys',
    notes: 'Very cheap; Chat model is the default.',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    format: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    auth: 'bearer',
    defaultFreeModel: 'open-mistral-nemo',
    models: [
      { id: 'open-mistral-nemo', label: 'Open Mistral Nemo', free: true },
      { id: 'mistral-small-latest', label: 'Mistral Small' },
      { id: 'mistral-large-latest', label: 'Mistral Large' },
      { id: 'codestral-latest', label: 'Codestral' },
    ],
    keyUrl: 'https://console.mistral.ai/api-keys',
    notes: 'Free tier includes Open Mistral models.',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    format: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    auth: 'bearer',
    defaultFreeModel: 'llama-3.3-70b',
    models: [
      { id: 'llama-3.3-70b', label: 'Llama 3.3 70B', free: true },
      { id: 'llama-3.1-8b', label: 'Llama 3.1 8B', free: true },
    ],
    keyUrl: 'https://cloud.cerebras.ai/platform/org-settings/api-keys',
    notes: 'Free tier available.',
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    format: 'openai',
    baseUrl: 'https://your-api.example.com/v1',
    auth: 'bearer',
    defaultFreeModel: '',
    models: [{ id: 'custom-model', label: 'Custom model' }],
    keyUrl: '',
    notes: 'Point at any OpenAI-compatible /chat/completions endpoint (e.g. Ollama, llama.cpp, vLLM, LM Studio).',
  },
];

export function getProvider(id: string): LLMProvider | undefined {
  return PROVIDERS.find(p => p.id === id);
}

// --- API key storage ---------------------------------------------------------

const KEYS_STORAGE = 'probe_llm_keys';

export function getApiKeys(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEYS_STORAGE) || '{}');
  } catch {
    return {};
  }
}

export function setApiKey(providerId: string, key: string): void {
  const keys = getApiKeys();
  if (key.trim()) {
    keys[providerId] = key.trim();
  } else {
    delete keys[providerId];
  }
  localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
}

export function getApiKey(providerId: string): string {
  return getApiKeys()[providerId] || '';
}

/**
 * Detect which provider an API key belongs to from its shape/prefix.
 * Returns a provider id, or null when the key format is not recognizable
 * (the user then picks the provider manually).
 */
export function detectProviderFromKey(key: string): string | null {
  const k = key.trim();
  if (!k) return null;
  if (k.startsWith('sk-ant-')) return 'anthropic'; // sk-ant-... / sk-ant-api03-...
  if (k.startsWith('sk-or-')) return 'openrouter'; // sk-or-...
  if (k.startsWith('gsk_')) return 'groq'; // gsk_...
  if (k.startsWith('AIza')) return 'gemini'; // AIza... (AI Studio / Google)
  if (k.startsWith('csk-')) return 'cerebras'; // csk-...
  if (k.startsWith('sk-')) return 'openai'; // sk-... / sk-proj-... (DeepSeek also starts with sk-)
  return null;
}

// --- Active LLM configuration (single unified window) ------------------------

/**
 * The one LLM setup the game uses: which provider + which model.
 * null model => the provider's default free model.
 */
export interface LLMConfig {
  providerId: string;
  model: string | null;
}

const LLM_CONFIG_KEY = 'probe_llm_config';

export function getLLMConfig(): LLMConfig | null {
  try {
    const raw = localStorage.getItem(LLM_CONFIG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as LLMConfig;
    if (!cfg || typeof cfg.providerId !== 'string' || !getProvider(cfg.providerId)) return null;
    return { providerId: cfg.providerId, model: typeof cfg.model === 'string' ? cfg.model : null };
  } catch {
    return null;
  }
}

export function saveLLMConfig(cfg: LLMConfig): void {
  localStorage.setItem(LLM_CONFIG_KEY, JSON.stringify(cfg));
}

// --- Custom provider overrides (base URL + default free model) --------------

const CUSTOM_BASE_KEY = 'probe_custom_base';
const CUSTOM_MODEL_KEY = 'probe_custom_model';

export function getCustomBaseUrl(): string {
  return localStorage.getItem(CUSTOM_BASE_KEY) || '';
}

export function setCustomBaseUrl(url: string): void {
  localStorage.setItem(CUSTOM_BASE_KEY, url.trim());
}

export function getCustomDefaultModel(): string {
  return localStorage.getItem(CUSTOM_MODEL_KEY) || '';
}

export function setCustomDefaultModel(model: string): void {
  localStorage.setItem(CUSTOM_MODEL_KEY, model.trim());
}

/** Effective provider config for a provider id (applies custom overrides). */
export function getEffectiveProvider(id: string): LLMProvider | undefined {
  const provider = getProvider(id);
  if (!provider) return undefined;
  if (id === 'custom') {
    const base = getCustomBaseUrl();
    const model = getCustomDefaultModel();
    if (base) {
      return { ...provider, baseUrl: base.replace(/\/$/, ''), defaultFreeModel: model };
    }
  }
  return provider;
}
