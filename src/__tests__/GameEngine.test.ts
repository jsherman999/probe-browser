import { describe, it, expect } from 'vitest';
import { GameEngine } from '../game/GameEngine';
import { WordValidator } from '../game/WordValidator';
import type { NewPlayerInput } from '../game/GameEngine';

// Deterministic validator — no network calls in tests
class FakeValidator extends WordValidator {
  async isValidWord(word: string): Promise<boolean> {
    return word.length >= 4 && word.length <= 12 && /^[A-Za-z]+$/.test(word);
  }
}

const players: NewPlayerInput[] = [
  { id: 'human', displayName: 'You', isBot: false },
  { id: 'bot-1', displayName: 'Bot Alpha', isBot: true },
];

// Valid English words used as secrets
const WORDS = ['PROBE', 'QUIZ', 'JAZZ'];

function makeActiveGame(): GameEngine {
  const engine = new GameEngine(players, 60, new FakeValidator());
  engine.startGame();
  return engine;
}

async function selectAllWords(engine: GameEngine, words: string[]): Promise<void> {
  for (let i = 0; i < engine.sanitizeGame().players.length; i++) {
    const p = engine.sanitizeGame().players[i];
    if (!p.hasSelectedWord) {
      await engine.selectWord(p.userId, words[i] || WORDS[i % WORDS.length]);
    }
  }
}

describe('GameEngine', () => {
  it('creates a waiting game with players', () => {
    const engine = new GameEngine(players, 120);
    expect(engine.getStatus()).toBe('WAITING');
    expect(engine.sanitizeGame().players).toHaveLength(2);
    expect(engine.sanitizeGame().turnTimerSeconds).toBe(120);
  });

  it('clamps the turn timer to 10-1800 seconds', () => {
    expect(new GameEngine(players, 5).getTurnTimerSeconds()).toBe(10);
    expect(new GameEngine(players, 9999).getTurnTimerSeconds()).toBe(1800);
  });

  it('rejects invalid player counts', () => {
    expect(() => new GameEngine([players[0]], 60)).toThrow();
    expect(() => new GameEngine([players[0], players[1], players[1], players[1], players[1]], 60)).toThrow();
  });

  it('startGame enters word selection', () => {
    const engine = makeActiveGame();
    expect(engine.getStatus()).toBe('WORD_SELECTION');
  });

  it('rejects invalid words', async () => {
    const engine = makeActiveGame();
    await expect(engine.selectWord('human', 'CAT', 0, 0)).rejects.toThrow();
    await expect(engine.selectWord('human', 'EXTRAORDINARY', 0, 0)).rejects.toThrow();
    await expect(engine.selectWord('human', 'ABC123', 0, 0)).rejects.toThrow();
    await expect(engine.selectWord('human', 'ZZZZZZ', 5, 5)).rejects.toThrow();
  });

  it('starts the game when all players select words', async () => {
    const engine = makeActiveGame();
    await engine.selectWord('human', 'PROBE', 0, 0);
    expect(engine.getStatus()).toBe('WORD_SELECTION');
    await engine.selectWord('bot-1', 'QUIZ', 0, 0);
    expect(engine.getStatus()).toBe('ACTIVE');
    expect(engine.sanitizeGame().currentTurnPlayerId).toBe('human');
  });

  it('guessing a correct letter scores points and keeps the turn', async () => {
    const engine = makeActiveGame();
    await selectAllWords(engine, ['PROBE', 'QUIZ']);
    // human guesses "Q" in bot's QUIZ — position 0 = 5 points
    const outcome = engine.processGuess('human', 'bot-1', 'Q');
    expect(outcome.isCorrect).toBe(true);
    expect(outcome.pointsScored).toBe(5);
    expect(engine.sanitizeGame().players.find(p => p.userId === 'human')?.totalScore).toBe(5);
    expect(engine.sanitizeGame().currentTurnPlayerId).toBe('human');
  });

  it('guessing a wrong letter advances the turn', async () => {
    const engine = makeActiveGame();
    await selectAllWords(engine, ['PROBE', 'QUIZ']);
    const outcome = engine.processGuess('human', 'bot-1', 'X');
    expect(outcome.isCorrect).toBe(false);
    expect(engine.sanitizeGame().currentTurnPlayerId).toBe('bot-1');
    // missed letter tracked on target
    const bot = engine.sanitizeGame().players.find(p => p.userId === 'bot-1');
    expect(bot?.missedLetters).toContain('X');
  });

  it('guessing BLANK when no blanks exist costs -50', async () => {
    const engine = makeActiveGame();
    await selectAllWords(engine, ['PROBE', 'QUIZ']);
    const outcome = engine.processGuess('human', 'bot-1', 'BLANK');
    expect(outcome.isCorrect).toBe(false);
    expect(outcome.pointsScored).toBe(-50);
    expect(outcome.blankMissPenalty).toBe(true);
    expect(engine.sanitizeGame().players.find(p => p.userId === 'human')?.totalScore).toBe(-50);
  });

  it('requests blank position selection when multiple blanks exist', async () => {
    const engine = makeActiveGame();
    await engine.selectWord('bot-1', 'QUIZ', 1, 1);
    await engine.selectWord('human', 'PROBE', 0, 0);
    const outcome = engine.processGuess('human', 'bot-1', 'BLANK');
    expect(outcome.blankSelectionRequired).toBe(true);
    expect(outcome.positions.length).toBe(2);
    // game state unchanged until resolved
    expect(engine.sanitizeGame().players.find(p => p.userId === 'bot-1')?.totalScore).toBe(0);
  });

  it('resolves blank selection with zero points', async () => {
    const engine = makeActiveGame();
    await engine.selectWord('bot-1', 'QUIZ', 1, 1);
    await engine.selectWord('human', 'PROBE', 0, 0);
    const outcome = engine.processGuess('human', 'bot-1', 'BLANK');
    const resolved = engine.resolveBlankSelection('human', 'bot-1', outcome.positions[0]);
    expect(resolved.isCorrect).toBe(true);
    expect(resolved.pointsScored).toBe(0);
    expect(engine.sanitizeGame().currentTurnPlayerId).toBe('human');
  });

  it('handles duplicate letter selection', async () => {
    const engine = makeActiveGame();
    await engine.selectWord('human', 'PROBE', 0, 0);
    await engine.selectWord('bot-1', 'JAZZ', 0, 0);
    const outcome = engine.processGuess('human', 'bot-1', 'Z');
    expect(outcome.duplicateSelectionRequired).toBe(true);
    const resolved = engine.resolveDuplicateSelection('human', 'bot-1', outcome.positions[0], 'Z');
    expect(resolved.isCorrect).toBe(true);
    expect(resolved.pointsScored).toBeGreaterThan(0);
  });

  it('processWordGuess: correct guess awards 50 and eliminates target', async () => {
    const engine = makeActiveGame();
    await selectAllWords(engine, ['PROBE', 'QUIZ']);
    const outcome = engine.processWordGuess('human', 'bot-1', 'QUIZ');
    expect(outcome.isCorrect).toBe(true);
    // QUIZ has 4 letters (4 unrevealed < 5) => 50 pts
    expect(outcome.pointsChange).toBe(50);
    const bot = engine.sanitizeGame().players.find(p => p.userId === 'bot-1');
    expect(bot?.isEliminated).toBe(true);
    expect(engine.sanitizeGame().players.find(p => p.userId === 'human')?.totalScore).toBe(50);
  });

  it('processWordGuess: wrong guess costs -50 and advances turn', async () => {
    const engine = makeActiveGame();
    await selectAllWords(engine, ['PROBE', 'QUIZ']);
    const outcome = engine.processWordGuess('human', 'bot-1', 'WRONG');
    expect(outcome.isCorrect).toBe(false);
    expect(outcome.pointsChange).toBe(-50);
    expect(engine.sanitizeGame().currentTurnPlayerId).toBe('bot-1');
  });

  it('ends the game when only one player remains', async () => {
    const engine = makeActiveGame();
    await selectAllWords(engine, ['PROBE', 'QUIZ']);
    engine.processWordGuess('human', 'bot-1', 'QUIZ');
    expect(engine.getStatus()).toBe('COMPLETED');
    const game = engine.sanitizeGame();
    expect(game.finalResults?.[0].playerId).toBe('human');
  });

  it('serializes and restores state', async () => {
    const engine = makeActiveGame();
    await selectAllWords(engine, ['PROBE', 'QUIZ']);
    engine.processGuess('human', 'bot-1', 'Q');
    const snapshot = engine.toJSON();
    const restored = GameEngine.fromJSON(snapshot);
    expect(restored.getStatus()).toBe('ACTIVE');
    expect(restored.sanitizeGame().players.find(p => p.userId === 'human')?.totalScore).toBe(5);
    expect(restored.sanitizeGame().currentTurnPlayerId).toBe('human');
  });

  it('handleTurnTimeout advances to the next player', async () => {
    const engine = makeActiveGame();
    await selectAllWords(engine, ['PROBE', 'QUIZ']);
    const result = engine.handleTurnTimeout();
    expect(result.timedOutPlayerId).toBe('human');
    expect(engine.sanitizeGame().currentTurnPlayerId).toBe('bot-1');
  });

  it('never reveals opponents words in sanitized state', async () => {
    const engine = makeActiveGame();
    await selectAllWords(engine, ['PROBE', 'QUIZ']);
    const game = engine.sanitizeGame('human');
    const bot = game.players.find(p => p.userId === 'bot-1');
    expect(bot?.mySecretWord).toBeUndefined();
    const me = game.players.find(p => p.userId === 'human');
    expect(me?.mySecretWord).toBe('PROBE');
    expect(bot?.revealedPositions.every(r => r === null)).toBe(true);
  });
});
