import { describe, it, expect } from 'vitest';
import { LocalGameController } from '../services/LocalGameController';
import { WordValidator } from '../game/WordValidator';
import type { GameSettings } from '../services/botBrain';

class FakeValidator extends WordValidator {
  async isValidWord(word: string): Promise<boolean> {
    return word.length >= 4 && word.length <= 12 && /^[A-Za-z]+$/.test(word);
  }
}

// Minimal localStorage stub so persistence paths run like in the browser
const storage = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => {
    storage.set(k, v);
  },
  removeItem: (k: string) => {
    storage.delete(k);
  },
  clear: () => storage.clear(),
  key: () => null,
  get length() {
    return storage.size;
  },
};

/**
 * Full end-to-end game simulation: 1 human (scripted by the test) + 3
 * heuristic bots. Verifies the controller drives the game to completion
 * without deadlock and produces sane results.
 */
describe('LocalGameController (full game)', () => {
  it('completes a 4-player game against heuristic bots', async () => {
    const settings: GameSettings = {
      humanName: 'Tester',
      turnTimerSeconds: 30,
      botDelayRange: [1, 5], // near-instant bot thinking for the test
      validatorOverride: new FakeValidator(),
      bots: [
        { id: 'bot-1', name: 'Bot Alpha', providerId: 'heuristic', model: null },
        { id: 'bot-2', name: 'Bot Beta', providerId: 'heuristic', model: null },
        { id: 'bot-3', name: 'Bot Gamma', providerId: 'heuristic', model: null },
      ],
    };

    const controller = LocalGameController.startNew(settings);

    // Scripted human: whenever it's the human's turn and nothing is pending,
    // guess a letter (first available vs first non-eliminated opponent).
    const driveHuman = () => {
      const ui = controller.getUI();
      if (!ui.game) return false;
      if (ui.pendingSelection) {
        controller.selectPosition(ui.pendingSelection.positions[0]);
        return true;
      }
      if (ui.wordGuessActive && !ui.wordGuessActive.isBot) {
        controller.cancelWordGuess();
        return true;
      }
      if (ui.game.status === 'WORD_SELECTION') {
        const me = ui.game.players.find(p => p.userId === 'human');
        if (me && !me.hasSelectedWord) {
          void controller.selectWord('PROBE', 0, 0);
          return true;
        }
        return false;
      }
      if (
        ui.game.status === 'ACTIVE' &&
        ui.game.currentTurnPlayerId === 'human' &&
        !ui.botThinkingId
      ) {
        const target = ui.game.players.find(p => p.userId !== 'human' && !p.isEliminated);
        if (!target) return false;
        controller.guessLetter(target.userId, 'E');
        return true;
      }
      return false;
    };

    const started = Date.now();
    let completed = false;
    while (Date.now() - started < 60_000) {
      driveHuman();
      const ui = controller.getUI();
      if (ui.game?.status === 'COMPLETED') {
        completed = true;
        break;
      }
      await new Promise(r => setTimeout(r, 10));
    }

    controller.dispose();
    expect(completed).toBe(true);

    const ui = controller.getUI();
    const game = ui.game!;
    expect(game.status).toBe('COMPLETED');
    expect(game.finalResults).toBeDefined();
    expect(game.finalResults!.length).toBe(4);
    expect(game.finalResults![0].placement).toBe(1);
    // every player should have a final placement
    const placements = game.finalResults!.map(r => r.placement).sort((a, b) => a - b);
    expect(placements).toEqual([1, 2, 3, 4]);
    // scores must be numeric
    game.players.forEach(p => {
      expect(typeof p.totalScore).toBe('number');
    });
  }, 90_000);
});
