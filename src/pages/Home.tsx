import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PROVIDERS, getApiKey, setApiKey, getCustomBaseUrl, setCustomBaseUrl, getCustomDefaultModel, setCustomDefaultModel, getEffectiveProvider } from '../services/providers';
import { testConnection, LLMError } from '../services/llm';
import { loadSettings } from '../services/botBrain';
import { loadActiveGame } from '../services/LocalGameController';

const NAME_KEY = 'probe_human_name';

function KeyManager() {
  const [keys, setKeys] = useState<Record<string, string>>(() =>
    Object.fromEntries(PROVIDERS.map(p => [p.id, getApiKey(p.id)]))
  );
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [customBase, setCustomBase] = useState(getCustomBaseUrl());
  const [customModel, setCustomModel] = useState(getCustomDefaultModel());

  const save = (id: string, value: string) => {
    setKeys(prev => ({ ...prev, [id]: value }));
    setApiKey(id, value);
    setResults(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const runTest = async (id: string) => {
    setTesting(prev => ({ ...prev, [id]: true }));
    setResults(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const provider = getEffectiveProvider(id)!;
      const text = await testConnection(id, keys[id] || '', provider.defaultFreeModel || null);
      setResults(prev => ({ ...prev, [id]: { ok: true, text } }));
    } catch (err) {
      const msg = err instanceof LLMError ? err.message : (err as Error).message;
      setResults(prev => ({ ...prev, [id]: { ok: false, text: msg } }));
    } finally {
      setTesting(prev => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold">🔑 LLM API Keys</h2>
        <span className="text-xs text-text-muted">stored only in this browser</span>
      </div>
      <p className="text-sm text-text-secondary mb-4">
        Add a key for any provider, then assign that provider to a bot on the setup screen.
        Each provider has a <strong>default free model</strong> used when a bot picks &ldquo;Default (free)&rdquo;.
      </p>

      <div className="space-y-3">
        {PROVIDERS.map(provider => {
          const isCustom = provider.id === 'custom';
          return (
            <div key={provider.id} className="bg-primary-bg rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-semibold">{provider.name}</span>
                  <span className="ml-2 text-xs text-accent">
                    free default: <span className="font-mono">{provider.defaultFreeModel || '— set below —'}</span>
                  </span>
                </div>
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

              {provider.notes && <p className="text-xs text-text-muted mb-2">{provider.notes}</p>}

              {isCustom && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
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
                  <input
                    type="text"
                    value={customModel}
                    onChange={e => {
                      setCustomModel(e.target.value);
                      setCustomDefaultModel(e.target.value);
                    }}
                    placeholder="Default free model id"
                    className="input-field text-sm"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type={visible[provider.id] ? 'text' : 'password'}
                  value={keys[provider.id] || ''}
                  onChange={e => save(provider.id, e.target.value)}
                  placeholder={isCustom ? 'API key (if required)' : 'sk-...'}
                  className="input-field text-sm flex-1"
                  autoComplete="off"
                />
                <button
                  onClick={() => setVisible(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                  className="px-3 py-2 bg-secondary-bg rounded text-sm hover:bg-slate-600 transition-colors"
                  title={visible[provider.id] ? 'Hide key' : 'Show key'}
                >
                  {visible[provider.id] ? '🙈' : '👁️'}
                </button>
                <button
                  onClick={() => runTest(provider.id)}
                  disabled={testing[provider.id] || (!keys[provider.id]?.trim() && provider.id !== 'custom')}
                  className="px-3 py-2 bg-accent hover:bg-blue-600 disabled:opacity-40 text-white rounded text-sm font-semibold transition-colors"
                >
                  {testing[provider.id] ? 'Testing...' : 'Test'}
                </button>
              </div>

              {results[provider.id] && (
                <p
                  className={`mt-2 text-xs px-2 py-1 rounded ${
                    results[provider.id].ok
                      ? 'bg-green-600/20 text-green-400'
                      : 'bg-red-600/20 text-red-400'
                  }`}
                >
                  {results[provider.id].ok
                    ? `✓ Connected — model replied: ${results[provider.id].text}`
                    : `✗ ${results[provider.id].text}`}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-text-muted mt-3">
        ⚠️ Keys never leave this device — they are only sent directly to the provider you chose. Clear them by
        emptying the fields.
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

        <KeyManager />

        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">🕹️ Play</h2>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">
              Play 2-4 players on this device: you against up to 3 bots. Each bot can use a different
              provider &amp; model — or the provider&rsquo;s default free model — or a built-in heuristic
              brain that needs no key.
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
