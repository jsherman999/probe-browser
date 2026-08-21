import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PROVIDERS,
  getApiKey,
  setApiKey,
  getApiKeys,
  getProvider,
  getCustomBaseUrl,
  setCustomBaseUrl,
  setCustomDefaultModel,
  getEffectiveProvider,
  getLLMConfig,
  saveLLMConfig,
  detectProviderFromKey,
} from '../services/providers';
import { testConnection, LLMError } from '../services/llm';
import { loadSettings } from '../services/botBrain';
import { loadActiveGame } from '../services/LocalGameController';

const NAME_KEY = 'probe_human_name';

/** Provider to show initially: saved config > first provider with a saved key > groq. */
function initialProviderId(): string {
  const saved = getLLMConfig();
  if (saved && getProvider(saved.providerId)) return saved.providerId;
  const keys = getApiKeys();
  return PROVIDERS.find(p => (keys[p.id] || '').trim())?.id || 'groq';
}

/** One window for all LLM setup: paste a key → provider auto-detected → pick a model. */
function LLMSetup() {
  const initialProvider = initialProviderId();
  const [providerId, setProviderId] = useState(initialProvider);
  const [key, setKey] = useState(() => getApiKey(initialProvider));
  const [model, setModel] = useState<string>(() => {
    const saved = getLLMConfig();
    if (saved && saved.providerId === initialProvider && saved.model) {
      const p = getProvider(initialProvider)!;
      if (initialProvider === 'custom' || p.models.some(m => m.id === saved.model)) return saved.model;
    }
    return '';
  });
  const [visible, setVisible] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [customBase, setCustomBase] = useState(getCustomBaseUrl());

  const provider = getProvider(providerId)!;
  const isCustom = providerId === 'custom';
  const detected = detectProviderFromKey(key);
  const savedKeyProviders = Object.entries(getApiKeys())
    .filter(([, v]) => v.trim())
    .map(([id]) => getProvider(id)?.name || id);

  const onKeyChange = (value: string) => {
    const nextDetected = detectProviderFromKey(value);
    if (nextDetected && nextDetected !== providerId) {
      // Provider auto-detected: move the key to the detected provider and
      // drop any partial key we had been writing under the previous one.
      if (getApiKey(providerId) === key) setApiKey(providerId, '');
      setApiKey(nextDetected, value);
      saveLLMConfig({ providerId: nextDetected, model: model === '' ? null : model });
      setProviderId(nextDetected);
    } else {
      setApiKey(providerId, value);
    }
    setKey(value);
    setResult(null);
  };

  const onProviderChange = (id: string) => {
    const p = getProvider(id)!;
    const nextModel =
      model && (id === 'custom' || p.models.some(m => m.id === model)) ? model : '';
    setProviderId(id);
    setKey(getApiKey(id));
    setModel(nextModel);
    saveLLMConfig({ providerId: id, model: nextModel === '' ? null : nextModel });
    setResult(null);
  };

  const onModelChange = (value: string) => {
    setModel(value);
    if (isCustom) setCustomDefaultModel(value);
    saveLLMConfig({ providerId, model: value === '' ? null : value });
  };

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const p = getEffectiveProvider(providerId)!;
      const text = await testConnection(providerId, key, model || p.defaultFreeModel || null);
      setResult({ ok: true, text });
    } catch (err) {
      const msg = err instanceof LLMError ? err.message : (err as Error).message;
      setResult({ ok: false, text: msg });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold">🔑 LLM API</h2>
        <span className="text-xs text-text-muted">stored only in this browser</span>
      </div>
      <p className="text-sm text-text-secondary mb-4">
        Paste an API key — the provider is <strong>detected automatically</strong> — then pick a model
        from the dropdown. Bots on the setup screen use this setup.
      </p>

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs text-text-muted">Provider</label>
            {provider.keyUrl && (
              <a
                href={provider.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-accent hover:underline"
              >
                Get key ↗
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={providerId}
              onChange={e => onProviderChange(e.target.value)}
              className="input-field flex-1"
            >
              {PROVIDERS.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {detected && (
              <span className="text-xs text-green-400 whitespace-nowrap">✓ auto-detected</span>
            )}
          </div>
          {provider.notes && <p className="text-xs text-text-muted mt-1">{provider.notes}</p>}
        </div>

        {isCustom && (
          <div>
            <label className="block text-xs text-text-muted mb-1">Base URL</label>
            <input
              type="text"
              value={customBase}
              onChange={e => {
                setCustomBase(e.target.value);
                setCustomBaseUrl(e.target.value);
              }}
              placeholder="Base URL, e.g. http://localhost:11434/v1"
              className="input-field text-sm"
            />
          </div>
        )}

        <div>
          <label className="block text-xs text-text-muted mb-1">
            API key{isCustom ? ' (optional for local servers)' : ''}
          </label>
          <div className="flex gap-2">
            <input
              type={visible ? 'text' : 'password'}
              value={key}
              onChange={e => onKeyChange(e.target.value)}
              placeholder={isCustom ? 'API key (if required)' : 'Paste your API key — provider is detected'}
              className="input-field text-sm flex-1"
              autoComplete="off"
            />
            <button
              onClick={() => setVisible(v => !v)}
              className="px-3 py-2 bg-secondary-bg rounded text-sm hover:bg-slate-600 transition-colors"
              title={visible ? 'Hide key' : 'Show key'}
            >
              {visible ? '🙈' : '👁️'}
            </button>
            <button
              onClick={runTest}
              disabled={testing || (!key.trim() && !isCustom)}
              className="px-3 py-2 bg-accent hover:bg-blue-600 disabled:opacity-40 text-white rounded text-sm font-semibold transition-colors"
            >
              {testing ? 'Testing...' : 'Test'}
            </button>
          </div>
          {key.trim() && !detected && (
            <p className="text-xs text-warning mt-1">
              Couldn&rsquo;t auto-detect the provider from this key — pick it from the dropdown above.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1">Model</label>
          {isCustom ? (
            <input
              type="text"
              value={model}
              onChange={e => onModelChange(e.target.value)}
              placeholder="Model id, e.g. llama3.1"
              className="input-field text-sm"
            />
          ) : (
            <select
              value={model}
              onChange={e => onModelChange(e.target.value)}
              className="input-field text-sm"
            >
              <option value="">⭐ Default (free): {provider.defaultFreeModel}</option>
              {provider.models.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.free ? ' (free)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {result && (
          <p
            className={`text-xs px-2 py-1 rounded ${
              result.ok ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
            }`}
          >
            {result.ok ? `✓ Connected — model replied: ${result.text}` : `✗ ${result.text}`}
          </p>
        )}

        {savedKeyProviders.length > 0 && (
          <p className="text-xs text-text-muted">
            Saved keys: {savedKeyProviders.join(', ')} — switching the provider above loads its saved key.
          </p>
        )}
      </div>

      <p className="text-xs text-text-muted mt-3">
        ⚠️ Keys never leave this device — they are only sent directly to the provider above. Clear the key
        field to remove a saved key.
      </p>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const existingSettings = loadSettings();
  const activeGame = loadActiveGame();
  const [name, setName] = useState(localStorage.getItem(NAME_KEY) || existingSettings?.humanName || '');

  const handleNewGame = () => {
    if (!name.trim()) {
      alert('Enter your name first!');
      return;
    }
    localStorage.setItem(NAME_KEY, name.trim());
    navigate('/setup');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="card text-center">
          <h1 className="text-5xl font-bold mb-2">
            <span className="text-yellow-400">P</span>
            <span className="text-blue-400">R</span>
            <span className="text-green-400">O</span>
            <span className="text-red-400">B</span>
            <span className="text-purple-400">E</span>
          </h1>
          <p className="text-text-secondary mb-4">
            Browser-only word game — play against LLM-powered bots. No servers, no signup.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              className="input-field flex-1 text-center"
              maxLength={20}
            />
            <button onClick={handleNewGame} className="btn-primary whitespace-nowrap">
              New Game
            </button>
          </div>
        </div>

        {activeGame && (
          <div className="card border-2 border-accent/50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">▶️ Game in progress</h2>
                <p className="text-sm text-text-muted">
                  Room {activeGame.snapshot.roomCode} — {activeGame.snapshot.players.map(p => p.displayName).join(' vs ')}
                </p>
              </div>
              <button onClick={() => navigate('/game')} className="btn-primary">
                Resume
              </button>
            </div>
          </div>
        )}

        <LLMSetup />

        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">🕹️ Play</h2>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">
              Play 2-4 players on this device: you against up to 3 bots. LLM bots use the provider &amp;
              model configured above; or pick a built-in heuristic brain that needs no key.
            </p>
            <Link to="/history" className="block text-accent hover:underline text-sm">
              View Game History →
            </Link>
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold mb-4">Game Rules</h2>
          <div className="space-y-3 text-sm text-text-secondary">
            <div>
              <h3 className="font-semibold text-text-primary mb-1">Setup</h3>
              <p>Each player selects a secret word (4-12 letters). Add blanks at front/back to hide your word position!</p>
            </div>
            <div>
              <h3 className="font-semibold text-text-primary mb-1">Gameplay</h3>
              <p>Take turns guessing letters in opponents' words. Correct guesses reveal the letter and award points. Your turn continues until you guess incorrectly.</p>
            </div>
            <div>
              <h3 className="font-semibold text-text-primary mb-1">Scoring</h3>
              <p>Points are based on letter position: 5, 10, 15 (repeating). Position 1 = 5pts, Position 2 = 10pts, Position 3 = 15pts, etc. Guessing a blank that isn't there costs -50.</p>
            </div>
            <div>
              <h3 className="font-semibold text-text-primary mb-1">Winning</h3>
              <p>When a word is fully revealed that player is eliminated. Last player standing wins; otherwise highest score wins.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
