import { getEffectiveProvider, getApiKey } from './providers';
import { chatCompletion, extractJsonObject, resolveModel, LLMError } from './llm';
import type { SanitizedGame, SanitizedPlayer } from '../game/types';
import { WordValidator } from '../game/WordValidator';

// ---------------------------------------------------------------------------
// Bot configuration (persisted in localStorage)
// ---------------------------------------------------------------------------

export const HEURISTIC_PROVIDER = 'heuristic';

export interface BotConfig {
  id: string;
  name: string;
  // 'heuristic' => built-in strategy bot, no API key needed.
  // otherwise an LLMProvider id from providers.ts
  providerId: string;
  // null => "Default (free)" — the provider's default free model
  model: string | null;
}

export interface GameSettings {
  humanName: string;
  turnTimerSeconds: number;
  bots: BotConfig[];
  /** Optional bot "thinking" delay range in ms (used for tests). */
  botDelayRange?: [number, number];
  /** Optional word validator override (used for tests). */
  validatorOverride?: WordValidator;
}

const SETTINGS_KEY = 'probe_settings';

export function loadSettings(): GameSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.bots)) return null;
    return parsed as GameSettings;
  } catch {
    return null;
  }
}

export function saveSettings(settings: GameSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearSettings(): void {
  localStorage.removeItem(SETTINGS_KEY);
}

// ---------------------------------------------------------------------------
// Decision result types
// ---------------------------------------------------------------------------

export interface WordPickDecision {
  action: 'pickWord';
  word: string;
  frontPadding: number;
  backPadding: number;
  source: 'llm' | 'heuristic';
  error?: string;
}

export interface GuessDecision {
  action: 'guess';
  targetId: string;
  letter: string;
  wordGuess: string | null; // if set, attempt a full-word guess instead
  source: 'llm' | 'heuristic';
  error?: string;
}

export interface PositionDecision {
  action: 'pickPosition';
  position: number;
  source: 'llm' | 'heuristic';
  error?: string;
}

export type BotDecision = { action: 'none' } | WordPickDecision | GuessDecision | PositionDecision;

// ---------------------------------------------------------------------------
// English letter presence statistics (fraction of dictionary words containing
// each letter) — used by the heuristic strategy and prompts.
// ---------------------------------------------------------------------------

export const LETTER_PRESENCE: Record<string, number> = {
  E: 0.59, A: 0.51, R: 0.49, I: 0.44, O: 0.42, T: 0.41, N: 0.4, S: 0.39,
  L: 0.33, C: 0.27, U: 0.25, D: 0.24, P: 0.22, M: 0.21, H: 0.18, G: 0.16,
  B: 0.15, F: 0.11, Y: 0.08, W: 0.07, K: 0.05, V: 0.05, X: 0.03, Z: 0.02,
  J: 0.02, Q: 0.01,
};

export const LETTER_POINTS: Record<string, number> = {
  E: 1, A: 1, I: 1, O: 1, N: 1, R: 1, T: 1, L: 1, S: 1, U: 1,
  D: 2, G: 2, B: 3, C: 3, M: 3, P: 3, F: 4, H: 4, V: 4, W: 4, Y: 4,
  K: 5, J: 8, X: 8, Q: 10, Z: 10,
};

// Words that are hard to guess (rare letters) for heuristic word selection.
const HARD_WORDS = [
  'QUIZ', 'JAZZ', 'ZINC', 'JOKER', 'QUACK', 'JUKEBOX', 'ZEBRA', 'JAGUAR', 'QUILL',
  'ZIPPER', 'JUNGLE', 'QUOTA', 'JELLY', 'ZESTY', 'JACKAL', 'QUENCH', 'JOVIAL',
  'ZEPHYR', 'JIGSAW', 'QUIRK', 'JUMBLE', 'ZODIAC', 'JUICY', 'QUIVER', 'JINX',
  'ZENITH', 'KAYAK', 'JOVIAN', 'QUAIL', 'JERK', 'ZANY', 'JOUST', 'QUASI',
  'JEWEL', 'ZONED', 'JUDGE', 'KHAKI', 'JUMPY', 'QUICK', 'JERKY', 'ZILLION',
  'PYXIE', 'XYLOPHONE', 'WHIZ', 'KRAKEN', 'HYMN', 'GYPSY', 'FJORD', 'CLYDE',
  'BLAZE', 'CRYPT', 'DWARF', 'EXULT', 'FLAK', 'GLYPH', 'HATCH', 'IVORY',
  'JOUST', 'KUDOS', 'LUMPS', 'MUTINY', 'NINJA', 'OXYGEN', 'PLUMP', 'QUASH',
  'RHYME', 'SHRUB', 'TWIXT', 'UNZIP', 'VEXED', 'WALTZ', 'XYLEM', 'YACHT',
  'ZOMBIE', 'AMAZE', 'BRISK', 'CHALK', 'DIZZY', 'EMBRY', 'FLAKY', 'GIZMO',
  'HAZEL', 'ICONS', 'JOULE', 'KNACK', 'LURID', 'MACHO', 'NEXUS', 'OASIS',
  'PHONE', 'QUAKE', 'RIVET', 'SNAKE', 'TANGY', 'URBAN', 'VIVID', 'WACKY',
  'YIELD', 'ZONAL', 'ABYSS', 'BLIMP', 'CIVIC', 'DRUID', 'EXILE', 'FROST',
  'GLINT', 'HOVER', 'INDEX', 'KETTLE', 'LOGIC', 'MOTIF', 'NIMBLE', 'OCCUR',
  'PLAZA', 'QUEUE', 'RADAR', 'SLEEK', 'TOXIC', 'ULCER', 'VOICE', 'WHARF',
  'YOKEL', 'ZEST', 'ALPHA', 'BRIAR', 'CYNIC', 'DUPLE', 'ERUPT', 'FOYER',
  'GUSTO', 'HUMOR', 'IVIED', 'JULEP', 'KARMA', 'LILAC', 'MAGMA', 'NOVEL',
  'ONION', 'PIXIE', 'QUILT', 'REVEL', 'SCARF', 'TRAMP', 'UPSET', 'VEGAN',
  'WISPY', 'YACHT', 'ZEBU', 'ABOVE', 'BROOK', 'CANDY', 'DWELT', 'EAGLE',
  'FABLE', 'GNOME', 'HONEY', 'IRONY', 'JUNCO', 'KNOLL', 'LEMON', 'MOCHA',
  'NYMPH', 'OPIUM', 'PLANK', 'QUARRY', 'ROBOT', 'SHARK', 'TULIP', 'UVULA',
  'WALTZ', 'XENON', 'YUCCA', 'ZEPHYR', 'BAYOU', 'CRAWL', 'DODGE', 'EERIE',
  'FRILL', 'GAUZE', 'HAVOC', 'INLAY', 'JABOT', 'KUDZU', 'LUMEN', 'MURAL',
  'NICHE', 'ORBIT', 'PRISM', 'QUOTA', 'ROUGE', 'SEDAN', 'TAPIR', 'UTILE',
  'VAPID', 'WHISK', 'YACHT', 'ZONAL', 'BANJO', 'CRUMP', 'DUPES', 'EMBER',
  'FLOUT', 'GAUNT', 'HEDGE', 'INEPT', 'JUMBO', 'KNIFE', 'LOOSE', 'MEZZO',
  'NUTTY', 'OVERT', 'PIXEL', 'QUIET', 'REBUS', 'SCOFF', 'TWIRL', 'UNITY',
  'VOUCH', 'WEDGE', 'YODEL', 'ZILCH', 'APRON', 'BATCH', 'CHIME', 'DUSKY',
  'ETHOS', 'FLUME', 'GIDDY', 'HITCH', 'IONIC', 'JOUST', 'KNEEL', 'LODGE',
  'MOUND', 'NIFTY', 'ORGAN', 'PLUME', 'QUACK', 'RUDDY', 'SKULK', 'THUMB',
  'USHER', 'VOGUE', 'WHIRL', 'YARROW', 'ZESTY',
];

// ---------------------------------------------------------------------------
// Public game state description for the LLM
// ---------------------------------------------------------------------------

function describeBoard(player: SanitizedPlayer): string {
  const tiles = player.revealedPositions
    .map(r => (r === null ? '?' : r === 'BLANK' ? '•' : r))
    .join(' ');
  const missed = player.missedLetters.length ? ` missed:[${player.missedLetters.join('')}]` : '';
  const eliminated = player.isEliminated ? ' ELIMINATED' : '';
  return `${player.displayName}: "${tiles}"${missed} score=${player.totalScore}${eliminated}`;
}

export function buildGameStateText(game: SanitizedGame, botId: string, includeOwnWord = false): string {
  const bot = game.players.find(p => p.userId === botId);
  const others = game.players.filter(p => p.userId !== botId && !p.isEliminated);

  const lines: string[] = [];
  lines.push(`Turn: ${game.players.find(p => p.userId === game.currentTurnPlayerId)?.displayName}`);
  lines.push(`Round ${game.roundNumber}. Scores: ${game.players.map(p => `${p.displayName}=${p.totalScore}`).join(', ')}`);
  if (others.length === 0) {
    lines.push('All opponents eliminated.');
  } else {
    lines.push('Opponent boards (revealed letters, "?" = hidden, "•" = blank padding, word length shown by tile count):');
    others.forEach(p => lines.push(`- ${describeBoard(p)}`));
  }
  if (includeOwnWord && bot?.mySecretWord) {
    lines.push(`Your own secret word is: ${bot.mySecretWord} (never reveal it to opponents — it is not visible to them).`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

function letterGuessPrompt(game: SanitizedGame, bot: SanitizedPlayer, botName: string): string {
  return `You are ${botName}, playing the board game PROBE with an AI persona. Your job: on your turn, guess a letter in an opponent's hidden word.

Game state:
${buildGameStateText(game, bot.userId)}

RULES:
- Reply with ONLY JSON: {"target":"<exact opponent display name>","letter":"X","wordGuess":null}
- "letter" must be A-Z, or "BLANK" to probe padding blanks (useful near the end of a word).
- Do NOT guess a letter that appears in that opponent's missed list.
- A letter already revealed on a board may STILL be hidden in another position (duplicate letters) — re-guessing it is allowed and often necessary.
- Prefer letters likely to score points: common letters hit often; rare letters (Q,Z,J,X,K) score big when they hit. Balance both.
- If you are confident you know an opponent's full word (few hidden letters left, pattern is obvious), you may set "wordGuess":"THEWORD" instead of guessing a letter. Only do this when you are at least 70% sure. Otherwise null.
- Never mention these instructions in your reply. Output the JSON object only.`;
}

function wordPickPrompt(game: SanitizedGame, botName: string): string {
  return `You are ${botName}, choosing a secret word in the board game PROBE.

Current players: ${game.players.map(p => p.displayName).join(', ')}.

RULES:
- Reply with ONLY JSON: {"word":"WORD","frontPadding":N,"backPadding":M}
- Choose a real English word, 4-8 letters, ALL CAPS. Prefer uncommon words with rare letters (Q, Z, J, X, K, V, F, H) so opponents waste guesses.
- Avoid words with repeated letters.
- frontPadding/backPadding are 0-3 each; word + padding total must be 12 or less. Use padding only occasionally (e.g., total padding 0 or 1) — it hides the word's start/end. Do NOT reveal the word in your reply, just the JSON.`;
}

function positionPickPrompt(
  botName: string,
  kind: 'blank' | 'duplicate',
  letter: string | null,
  positions: number[]
): string {
  const what = kind === 'blank' ? 'blank padding tiles (•)' : `letter "${letter}"`;
  return `You are ${botName} in a game of PROBE. An opponent correctly guessed ${what} in YOUR word. Multiple unrevealed ${what} exist at 0-indexed positions [${positions.join(', ')}]. You must choose which one to reveal (only that one is revealed).

Strategy: reveal the position that helps the opponent LEAST — e.g. the rightmost or a middle position. If you have no preference, pick the rightmost.

Reply with ONLY JSON: {"position":<number>} — one of the listed positions.`;
}

// ---------------------------------------------------------------------------
// Heuristic strategies
// ---------------------------------------------------------------------------

export function heuristicPickWord(): { word: string; frontPadding: number; backPadding: number } {
  const scored = HARD_WORDS.map(w => {
    const letters = new Set(w.split(''));
    let score = 0;
    letters.forEach(l => {
      score += (1 - LETTER_PRESENCE[l]) * 10 + LETTER_POINTS[l] * 0.3;
    });
    // slight preference for 5-6 letter words
    score += w.length >= 5 && w.length <= 6 ? 4 : 0;
    score -= (w.length - letters.size) * 6; // penalty for repeats
    return { w, score };
  }).sort((a, b) => b.score - a.score);

  const pool = scored.slice(0, 12);
  const pick = pool[Math.floor(Math.random() * pool.length)].w;
  const total = pick.length;
  const maxPad = 12 - total;
  const pad = maxPad > 0 && Math.random() < 0.4 ? 1 : 0;
  let front = 0;
  let back = 0;
  if (pad === 1) {
    front = Math.random() < 0.5 ? 1 : 0;
    back = 1 - front;
  }
  return { word: pick, frontPadding: front, backPadding: back };
}

export function heuristicGuess(game: SanitizedGame, bot: SanitizedPlayer): { targetId: string; letter: string } {
  const targets = game.players.filter(p => p.userId !== bot.userId && !p.isEliminated);
  if (targets.length === 0) {
    throw new Error('No targets');
  }

  let best: { targetId: string; letter: string; score: number } | null = null;

  for (const target of targets) {
    const revealed = new Set(
      target.revealedPositions.filter((r): r is string => typeof r === 'string' && r !== 'BLANK')
    );
    const missed = new Set(target.missedLetters);
    const unrevealedCount = target.revealedPositions.filter(r => r === null).length;
    const blankRevealed = target.revealedPositions.includes('BLANK');
    if (unrevealedCount === 0) continue;

    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      if (missed.has(letter)) continue;
      const presence = LETTER_PRESENCE[letter];
      const value = LETTER_POINTS[letter];
      // Expected value: points * presence * remaining positions + jitter.
      // A letter already revealed on this board may still hide in another
      // position (duplicates) — allow re-guessing it at low priority so
      // words with repeated letters can always be completed.
      const mult = revealed.has(letter) ? 0.12 : 1;
      const score = value * presence * unrevealedCount * mult + Math.random() * 2;
      if (!best || score > best.score) {
        best = { targetId: target.userId, letter, score };
      }
    }

    // BLANK probing: padded words need a BLANK guess to complete. Only
    // consider it when few tiles remain hidden (or re-probe if a blank was
    // already revealed — more blanks may hide behind other tiles).
    if (!missed.has('BLANK')) {
      let score = -Infinity;
      if (blankRevealed) {
        score = 1.5 + Math.random() * 2;
      } else if (unrevealedCount <= 3) {
        score = 4 + Math.random() * 2;
      }
      if (score > -Infinity && (!best || score > best.score)) {
        best = { targetId: target.userId, letter: 'BLANK', score };
      }
    }
  }

  if (!best) {
    // Every letter is revealed or known-missed on every target, yet tiles
    // remain hidden: those tiles must be blank padding. Guessing BLANK is
    // then guaranteed to make progress.
    const target = targets[0];
    return { targetId: target.userId, letter: 'BLANK' };
  }
  return { targetId: best.targetId, letter: best.letter };
}

// ---------------------------------------------------------------------------
// Public bot API
// ---------------------------------------------------------------------------

export interface BotRuntime {
  providerId: string;
  model: string | null;
  apiKey: string;
}

function runtimeFor(config: BotConfig): BotRuntime {
  if (config.providerId === HEURISTIC_PROVIDER) {
    return { providerId: HEURISTIC_PROVIDER, model: null, apiKey: '' };
  }
  return {
    providerId: config.providerId,
    model: config.model,
    apiKey: getApiKey(config.providerId),
  };
}

export function botHasKey(config: BotConfig): boolean {
  // Custom/self-hosted endpoints may not require a key.
  if (config.providerId === HEURISTIC_PROVIDER || config.providerId === 'custom') return true;
  return getApiKey(config.providerId).trim().length > 0;
}

/** True if the bot is configured for an LLM AND has a key saved. */
export function botIsLLMReady(config: BotConfig): boolean {
  return config.providerId !== HEURISTIC_PROVIDER && botHasKey(config);
}

async function callWithFallback<T extends BotDecision>(
  config: BotConfig,
  makeLlmCall: () => Promise<BotDecision>,
  heuristic: () => T
): Promise<T> {
  const runtime = runtimeFor(config);
  if (runtime.providerId === HEURISTIC_PROVIDER || !runtime.apiKey) {
    return heuristic();
  }
  try {
    const result = await makeLlmCall();
    if (result.action === 'none') return heuristic();
    return result as T;
  } catch (err) {
    const message = err instanceof LLMError ? err.message : (err as Error).message;
    console.warn(`[bot:${config.name}] LLM call failed, using heuristic:`, message);
    const fallback = heuristic();
    return { ...fallback, error: message } as T;
  }
}

/**
 * Decide what to do on the bot's turn.
 * Returns a letter guess, or a full word guess when the model is confident.
 */
export async function decideGuess(
  config: BotConfig,
  game: SanitizedGame,
  validator: WordValidator
): Promise<GuessDecision> {
  const bot = game.players.find(p => p.userId === config.id);
  if (!bot) throw new Error('Bot not in game');
  const runtime = runtimeFor(config);

  const heuristic = (): GuessDecision => {
    const { targetId, letter } = heuristicGuess(game, bot);
    return { action: 'guess', targetId, letter, wordGuess: null, source: 'heuristic' };
  };

  if (runtime.providerId === HEURISTIC_PROVIDER || !botHasKey(config)) {
    return heuristic();
  }

  const provider = getEffectiveProvider(runtime.providerId);
  const model = resolveModel(provider!, runtime.model);

  const decision = await callWithFallback<GuessDecision>(config, async () => {
    const raw = await chatCompletion({
      providerId: runtime.providerId,
      apiKey: runtime.apiKey,
      model,
      messages: [
        { role: 'system', content: letterGuessPrompt(game, bot, config.name) },
        { role: 'user', content: 'Your turn. What do you do?' },
      ],
      maxTokens: 150,
      temperature: 0.7,
    });
    const json = extractJsonObject<{ target?: string; letter?: string; wordGuess?: string | null }>(raw);
    if (!json || !json.target || !json.letter) return { action: 'none' as const };

    const target = game.players.find(p => p.displayName === json.target && !p.isEliminated);
    if (!target) return { action: 'none' as const };

    let letter = String(json.letter).toUpperCase().trim();
    if (letter === 'BLANK') {
      // keep as-is
    } else if (!/^[A-Z]$/.test(letter)) {
      return { action: 'none' as const };
    }

    let wordGuess: string | null = null;
    if (json.wordGuess) {
      const wg = String(json.wordGuess).toUpperCase().replace(/[^A-Z]/g, '');
      if (wg.length >= 4 && wg.length <= 12 && (await validator.isValidWord(wg))) {
        wordGuess = wg;
      }
    }

    return { action: 'guess', targetId: target.userId, letter, wordGuess, source: 'llm' };
  }, heuristic);

  return decision;
}

/** Pick a secret word during WORD_SELECTION. */
export async function decideWordPick(config: BotConfig, game: SanitizedGame): Promise<WordPickDecision> {
  const bot = game.players.find(p => p.userId === config.id);
  if (!bot) throw new Error('Bot not in game');
  const runtime = runtimeFor(config);
  const validator = new WordValidator();

  const heuristic = (): WordPickDecision => {
    const pick = heuristicPickWord();
    return { action: 'pickWord', ...pick, source: 'heuristic' };
  };

  if (runtime.providerId === HEURISTIC_PROVIDER || !botHasKey(config)) {
    return heuristic();
  }

  const provider = getEffectiveProvider(runtime.providerId);
  const model = resolveModel(provider!, runtime.model);

  return callWithFallback<WordPickDecision>(config, async () => {
    const raw = await chatCompletion({
      providerId: runtime.providerId,
      apiKey: runtime.apiKey,
      model,
      messages: [
        { role: 'system', content: wordPickPrompt(game, config.name) },
        { role: 'user', content: 'Choose your secret word now.' },
      ],
      maxTokens: 120,
      temperature: 0.9,
    });
    const json = extractJsonObject<{ word?: string; frontPadding?: number; backPadding?: number }>(raw);
    if (!json?.word) return { action: 'none' as const };

    const word = String(json.word).toUpperCase().replace(/[^A-Z]/g, '');
    if (word.length < 4 || word.length > 12) return { action: 'none' as const };
    const frontPadding = Math.max(0, Math.min(3, Math.floor(json.frontPadding || 0)));
    const backPadding = Math.max(0, Math.min(3, Math.floor(json.backPadding || 0)));
    if (word.length + frontPadding + backPadding > 12) return { action: 'none' as const };
    if (!(await validator.isValidWord(word))) return { action: 'none' as const };

    return { action: 'pickWord', word, frontPadding, backPadding, source: 'llm' };
  }, heuristic);
}

/** Pick which blank/duplicate position to reveal when the bot is the target. */
export async function decidePosition(
  config: BotConfig,
  game: SanitizedGame,
  kind: 'blank' | 'duplicate',
  letter: string | null,
  positions: number[]
): Promise<PositionDecision> {
  const runtime = runtimeFor(config);
  const bot = game.players.find(p => p.userId === config.id);

  const heuristic = (): PositionDecision => {
    // Rightmost (matches the server's auto-select behavior)
    return { action: 'pickPosition', position: Math.max(...positions), source: 'heuristic' };
  };

  if (runtime.providerId === HEURISTIC_PROVIDER || !botHasKey(config) || !bot) {
    return heuristic();
  }

  const provider = getEffectiveProvider(runtime.providerId);
  const model = resolveModel(provider!, runtime.model);

  return callWithFallback<PositionDecision>(config, async () => {
    const raw = await chatCompletion({
      providerId: runtime.providerId,
      apiKey: runtime.apiKey,
      model,
      messages: [
        { role: 'system', content: positionPickPrompt(config.name, kind, letter, positions) },
        { role: 'user', content: 'Choose a position.' },
      ],
      maxTokens: 60,
      temperature: 0.4,
    });
    const json = extractJsonObject<{ position?: number }>(raw);
    const position = Math.floor(json?.position ?? -1);
    if (!positions.includes(position)) return { action: 'none' as const };
    return { action: 'pickPosition', position, source: 'llm' };
  }, heuristic);
}
