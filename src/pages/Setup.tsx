import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiKey, getEffectiveProvider, getLLMConfig, getProvider, type LLMConfig } from '../services/providers';
import { HEURISTIC_PROVIDER, saveSettings, type BotConfig, type GameSettings } from '../services/botBrain';
import { LocalGameController } from '../services/LocalGameController';
import { setController } from '../services/gameSession';

const NAME_KEY = 'probe_human_name';
/** Pseudo-provider for "use the LLM configured on the Home screen". */
const LLM_BRAIN = 'llm';
const TIMER_PRESETS = [
  { label: '30 sec', value: 30 },
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
  { label: '5 min', value: 300 },
];

const BOT_NAMES = ['Bot Alpha', 'Bot Beta', 'Bot Gamma'];
const BOT_ID_PREFIX = 'bot-';

interface BotDraft extends BotConfig {
  key: number;
}

function llmSummary(cfg: LLMConfig | null): { label: string; detail: string; hasKey: boolean } | null {
  if (!cfg) return null;
  const provider = getEffectiveProvider(cfg.providerId);
  if (!provider) return null;
  const model = cfg.model || provider.defaultFreeModel;
  const hasKey =
    cfg.providerId === 'custom' || getApiKey(cfg.providerId).trim().length > 0;
  return {
    label: `${provider.name}${model ? ` · ${model}` : ''}`,
    detail: `Will use ${provider.name}${model ? ` with model ${model}` : ''}.`,
    hasKey,
  };
}

function freshBot(index: number): BotDraft {
  const llm = llmSummary(getLLMConfig());
  const useLlm = index === 0 && !!llm && llm.hasKey;
  return {
    key: Date.now() + index,
    id: `${BOT_ID_PREFIX}${Date.now().toString(36)}-${index}`,
    name: BOT_NAMES[index] || `Bot ${index + 1}`,
    providerId: useLlm ? LLM_BRAIN : HEURISTIC_PROVIDER,
    model: null,
  };
}

export default function Setup() {
  const navigate = useNavigate();
  const [humanName, setHumanName] = useState(localStorage.getItem(NAME_KEY) || '');
  const [bots, setBots] = useState<BotDraft[]>([freshBot(0)]);
  const [timerSeconds, setTimerSeconds] = useState(120);
  const [error, setError] = useState('');
  const llm = llmSummary(getLLMConfig());

  const updateBot = (key: number, patch: Partial<BotDraft>) => {
    setBots(prev => prev.map(b => (b.key === key ? { ...b, ...patch } : b)));
  };

  const addBot = () => {
    if (bots.length >= 3) return;
    setBots(prev => [...prev, freshBot(prev.length)]);
  };

  const removeBot = (key: number) => {
    setBots(prev => prev.filter(b => b.key !== key));
  };

  const handleStart = () => {
    if (!humanName.trim()) {
      setError('Enter your name first.');
      return;
    }
    if (bots.length === 0) {
      setError('Add at least one bot (or more humans on other devices later — for now this build plays you vs bots).');
      return;
    }
    const llmCfg = getLLMConfig();
    const settings: GameSettings = {
      humanName: humanName.trim(),
      turnTimerSeconds: timerSeconds,
      bots: bots.map(({ key: _key, ...bot }) => {
        if (bot.providerId !== LLM_BRAIN) {
          // null model => provider default free model
          return { ...bot, model: bot.model === '' ? null : bot.model };
        }
        // LLM brain: use the single provider + model configured on the Home screen.
        const providerId =
          llmCfg && getProvider(llmCfg.providerId) ? llmCfg.providerId : HEURISTIC_PROVIDER;
        return { ...bot, providerId, model: llmCfg ? llmCfg.model : null };
      }),
    };
    localStorage.setItem(NAME_KEY, humanName.trim());
    saveSettings(settings);
    const controller = LocalGameController.startNew(settings);
    setController(controller);
    navigate('/game');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Game Setup</h1>
          <button onClick={() => navigate('/')} className="btn-secondary text-sm">
            ← Back
          </button>
        </div>

        <div className="card space-y-4">
          <h2 className="text-xl font-bold">You</h2>
          <input
            type="text"
            value={humanName}
            onChange={e => setHumanName(e.target.value)}
            placeholder="Your name"
            className="input-field"
            maxLength={20}
          />
        </div>

        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">🤖 Bots ({bots.length}/3)</h2>
            <button
              onClick={addBot}
              disabled={bots.length >= 3}
              className="btn-secondary text-sm disabled:opacity-40"
            >
              + Add Bot
            </button>
          </div>

          {bots.map(bot => {
            const isLlm = bot.providerId === LLM_BRAIN;

            return (
              <div key={bot.key} className="bg-primary-bg rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={bot.name}
                    onChange={e => updateBot(bot.key, { name: e.target.value })}
                    className="input-field max-w-[200px]"
                    maxLength={20}
                  />
                  <button
                    onClick={() => removeBot(bot.key)}
                    className="text-red-400 hover:text-red-300 text-sm"
                    title="Remove bot"
                  >
                    ✕ Remove
                  </button>
                </div>

                <div>
                  <label className="block text-xs text-text-muted mb-1">Brain</label>
                  <select
                    value={bot.providerId}
                    onChange={e => updateBot(bot.key, { providerId: e.target.value, model: null })}
                    className="input-field"
                  >
                    <option value={HEURISTIC_PROVIDER}>Built-in heuristic (no key)</option>
                    <option value={LLM_BRAIN}>
                      LLM — {llm ? llm.label : 'not configured on the Home screen'}
                    </option>
                  </select>
                </div>

                {isLlm && (
                  <p className={`text-xs ${llm?.hasKey ? 'text-green-400' : 'text-warning'}`}>
                    {llm
                      ? llm.hasKey
                        ? `✓ ${llm.detail}`
                        : `⚠ ${llm.detail} But no API key is saved — this bot will fall back to the
                           heuristic brain. Add a key on the Home screen.`
                      : `⚠ No LLM configured yet — add a key on the Home screen (the provider is
                        auto-detected from the key). This bot will fall back to the heuristic brain.`}
                  </p>
                )}
              </div>
            );
          })}

          {bots.length === 0 && (
            <p className="text-text-muted text-center py-4">No bots yet — add one to play against.</p>
          )}
        </div>

        <div className="card space-y-3">
          <h2 className="text-xl font-bold">⏱️ Turn Timer</h2>
          <div className="flex flex-wrap gap-2">
            {TIMER_PRESETS.map(preset => (
              <button
                key={preset.value}
                onClick={() => setTimerSeconds(preset.value)}
                className={`px-4 py-2 rounded transition-colors ${
                  timerSeconds === preset.value ? 'bg-accent text-white' : 'bg-primary-bg hover:bg-accent/50'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted">
            Your turns auto-skip after the timer runs out. Bots think as long as they need.
          </p>
        </div>

        {error && (
          <div className="bg-error/20 border border-error text-error px-4 py-3 rounded text-sm">{error}</div>
        )}

        <button onClick={handleStart} className="btn-primary w-full">
          🚀 Start Game
        </button>
      </div>
    </div>
  );
}
