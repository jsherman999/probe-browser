import { GameEngine } from '../game/GameEngine';
import { WordValidator } from '../game/WordValidator';
import type { SanitizedGame } from '../game/types';
import {
  decideGuess,
  decidePosition,
  decideWordPick,
  heuristicPickWord,
  type BotConfig,
  type GameSettings,
  HEURISTIC_PROVIDER,
} from './botBrain';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const ACTIVE_KEY = 'probe_active_game';
const HISTORY_KEY = 'probe_history';

export interface HistoryEntry {
  id: string;
  roomCode: string;
  createdAt: string;
  completedAt: string;
  players: { playerId: string; playerName: string; finalScore: number; placement: number; secretWord: string | null; isBot: boolean }[];
  turns: { turnNumber: number; playerName: string; targetName: string; guessedLetter: string; isCorrect: boolean; pointsScored: number }[];
}

export function loadActiveGame(): { settings: GameSettings; snapshot: ReturnType<GameEngine['toJSON']> } | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.settings || !parsed?.snapshot) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveActiveGame(settings: GameSettings, snapshot: ReturnType<GameEngine['toJSON']>): void {
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify({ settings, snapshot }));
  } catch (err) {
    console.warn('Could not persist game:', err);
  }
}

export function clearActiveGame(): void {
  localStorage.removeItem(ACTIVE_KEY);
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 50)));
  } catch {
    // ignore quota errors
  }
}

// ---------------------------------------------------------------------------
// UI state
// ---------------------------------------------------------------------------

export interface PendingSelection {
  positions: number[];
  deadline: number;
  letter?: string; // set for duplicate selection
  kind: 'blank' | 'duplicate';
}

export interface WordGuessActive {
  guessingPlayerId: string;
  guessingPlayerName: string;
  targetPlayerId: string;
  targetPlayerName: string;
  deadline: number;
  isBot: boolean;
}

export interface ControllerUI {
  game: SanitizedGame | null;
  humanPlayerId: string | null;
  pendingSelection: PendingSelection | null;
  wordGuessActive: WordGuessActive | null;
  botThinkingId: string | null;
  botThinkingText: string | null;
  warnings: Record<string, string>; // botId -> warning
  toast: { message: string; kind: ToastKind } | null;
  turnEndsAt: number | null; // epoch ms when the human's current turn times out
}

export type ToastKind = 'info' | 'error' | 'success';

type Listener = (ui: ControllerUI) => void;

const BOT_MIN_DELAY_MS = 900;
const BOT_MAX_DELAY_MS = 1800;
const SELECTION_TIMEOUT_MS = 30000;
const WORD_GUESS_TIMEOUT_MS = 30000;

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class LocalGameController {
  private engine: GameEngine | null = null;
  private settings: GameSettings | null = null;
  private listeners: Set<Listener> = new Set();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private disposed = false;
  private busy = false;
  private tickScheduled = false;
  private wordValidator: WordValidator = new WordValidator();
  private pendingSelection: PendingSelection | null = null;
  private wordGuessActive: WordGuessActive | null = null;
  private botThinkingId: string | null = null;
  private botThinkingText: string | null = null;
  private warnings: Record<string, string> = {};
  private toastState: ControllerUI['toast'] = null;
  private humanPlayerId: string | null = null;
  private turnTimerInterval: ReturnType<typeof setInterval> | null = null;
  private archived = false;

  // ------------------------------------------------------------ lifecycle

  static startNew(settings: GameSettings): LocalGameController {
    const controller = new LocalGameController();
    controller.settings = settings;
    const players = [
      { id: 'human', displayName: settings.humanName || 'You', isBot: false },
      ...settings.bots.map(b => ({
        id: b.id,
        displayName: b.name,
        isBot: true,
        botProviderId: b.providerId === HEURISTIC_PROVIDER ? null : b.providerId,
        botModel: b.model,
      })),
    ];
    controller.wordValidator = settings.validatorOverride ?? new WordValidator();
    controller.engine = new GameEngine(players, settings.turnTimerSeconds, controller.wordValidator);
    controller.humanPlayerId = 'human';
    controller.engine.startGame();
    controller.persist();
    controller.scheduleTick();
    return controller;
  }

  static resume(saved: { settings: GameSettings; snapshot: ReturnType<GameEngine['toJSON']> }): LocalGameController {
    const controller = new LocalGameController();
    controller.settings = saved.settings;
    controller.wordValidator = new WordValidator();
    controller.engine = GameEngine.fromJSON(saved.snapshot);
    controller.humanPlayerId = 'human';
    controller.persist();
    controller.scheduleTick();
    return controller;
  }

  getSettings(): GameSettings | null {
    return this.settings;
  }

  getHumanPlayerId(): string | null {
    return this.humanPlayerId;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.disposed = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.turnTimerInterval) {
      clearInterval(this.turnTimerInterval);
      this.turnTimerInterval = null;
    }
    this.listeners.clear();
  }

  private persist(): void {
    if (!this.engine || !this.settings) return;
    if (this.engine.getStatus() === 'COMPLETED') {
      clearActiveGame();
    } else {
      saveActiveGame(this.settings, this.engine.toJSON());
    }
  }

  private emit(): void {
    const ui = this.buildUI();
    this.listeners.forEach(fn => {
      try {
        fn(ui);
      } catch (err) {
        console.error('listener error:', err);
      }
    });
  }

  private buildUI(): ControllerUI {
    return this.getUI();
  }

  getUI(): ControllerUI {
    const game = this.engine ? this.engine.sanitizeGame(this.humanPlayerId ?? undefined) : null;
    let turnEndsAt: number | null = null;
    if (
      game &&
      game.status === 'ACTIVE' &&
      game.currentTurnPlayerId === this.humanPlayerId &&
      !this.pendingSelection &&
      !this.wordGuessActive &&
      game.currentTurnStartedAt
    ) {
      turnEndsAt = new Date(game.currentTurnStartedAt).getTime() + game.turnTimerSeconds * 1000;
    }
    return {
      game,
      humanPlayerId: this.humanPlayerId,
      pendingSelection: this.pendingSelection,
      wordGuessActive: this.wordGuessActive,
      botThinkingId: this.botThinkingId,
      botThinkingText: this.botThinkingText,
      warnings: { ...this.warnings },
      toast: this.toastState,
      turnEndsAt,
    };
  }

  private toast(message: string, kind: ToastKind = 'info'): void {
    this.toastState = { message, kind };
    this.emit();
    this.after(4000, () => {
      if (this.toastState?.message === message) {
        this.toastState = null;
        this.emit();
      }
    });
  }

  private after(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers = this.timers.filter(x => x !== t);
      if (!this.disposed) fn();
    }, ms);
    this.timers.push(t);
  }

  // ------------------------------------------------------------ scheduler

  /**
   * Event-driven pump: whenever state changes we schedule a tick that decides
   * whether a bot should act next (word selection, turn, position selection).
   */
  scheduleTick(): void {
    if (this.tickScheduled || this.disposed) return;
    this.tickScheduled = true;
    this.after(0, () => {
      this.tickScheduled = false;
      this.tick();
    });
  }

  private tick(): void {
    if (this.disposed || this.busy || !this.engine) return;
    const engine = this.engine;
    const status = engine.getStatus();

    if (status === 'COMPLETED') {
      this.handleArchival();
      return;
    }

    // Human input blocks the pump
    if (this.pendingSelection || this.wordGuessActive) return;

    if (status === 'WORD_SELECTION') {
      const pendingBot = engine.sanitizeGame().players.find(p => p.isBot && !p.hasSelectedWord);
      if (pendingBot) {
        this.busy = true;
        this.setBotThinking(pendingBot.userId, 'choosing a secret word...');
        const config = this.settings?.bots.find(b => b.id === pendingBot.userId);
        this.after(this.botDelay(), () => {
          if (!config) {
            this.busy = false;
            this.setBotThinking(null, null);
            this.scheduleTick();
            return;
          }
          void this.runBotWordPick(config, pendingBot.userId);
        });
      }
      return;
    }

    if (status === 'ACTIVE') {
      const current = engine.sanitizeGame().players.find(p => p.userId === engine.sanitizeGame().currentTurnPlayerId);
      if (current?.isBot && engine.sanitizeGame().currentTurnPlayerId) {
        this.busy = true;
        const botId = current.userId;
        this.setBotThinking(current.userId, 'thinking...');
        const config = this.settings?.bots.find(b => b.id === botId);
        this.after(this.botDelay(), () => {
          if (!config) {
            this.busy = false;
            this.setBotThinking(null, null);
            this.scheduleTick();
            return;
          }
          void this.runBotTurn(config, botId);
        });
      }
    }
  }

  private botDelay(): number {
    const range = this.settings?.botDelayRange ?? [BOT_MIN_DELAY_MS, BOT_MAX_DELAY_MS];
    return range[0] + Math.random() * (range[1] - range[0]);
  }

  private setBotThinking(playerId: string | null, text: string | null): void {
    this.botThinkingId = playerId;
    this.botThinkingText = text;
    this.emit();
  }

  // ------------------------------------------------------------ bot actions

  private async runBotWordPick(config: BotConfig, botId: string): Promise<void> {
    try {
      if (this.disposed || !this.engine) return;
      const sanitized = this.engine.sanitizeGame();
      const decision = await decideWordPick(config, sanitized);
      if (decision.action === 'pickWord') {
        await this.engine.selectWord(botId, decision.word, decision.frontPadding, decision.backPadding);
        if (decision.source === 'llm' && decision.error) {
          this.warnings[botId] = `LLM failed (${decision.error}) — heuristic used`;
        }
        this.persist();
        this.emit();
      } else {
        // decision fell back to 'none' — use the heuristic word list directly
        const fd = heuristicPickWord();
        await this.engine.selectWord(botId, fd.word, fd.frontPadding, fd.backPadding);
        this.persist();
        this.emit();
      }
    } catch (err) {
      console.error('bot word pick failed:', err);
      this.warnings[botId] = 'Failed to pick a word — game may stall';
    } finally {
      this.busy = false;
      this.setBotThinking(null, null);
      this.scheduleTick();
    }
  }

  private async runBotTurn(config: BotConfig, botId: string): Promise<void> {
    try {
      if (this.disposed || !this.engine) return;
      const engine = this.engine;
      const sanitized = engine.sanitizeGame();

      const decision = await decideGuess(config, sanitized, this.wordValidator);
      if (decision.error) {
        this.warnings[botId] = `LLM failed (${decision.error}) — heuristic used`;
        this.emit();
      }

      if (decision.action !== 'guess') {
        // nothing decided — skip turn via timeout semantics
        engine.handleTurnTimeout();
        this.persist();
        this.emit();
        return;
      }

      // Full-word guess attempt
      if (decision.wordGuess) {
        const outcome = engine.processWordGuess(botId, decision.targetId, decision.wordGuess);
        this.wordGuessActive = {
          guessingPlayerId: botId,
          guessingPlayerName: config.name,
          targetPlayerId: decision.targetId,
          targetPlayerName: sanitized.players.find(p => p.userId === decision.targetId)?.displayName || '?',
          deadline: Date.now() + 2000,
          isBot: true,
        };
        this.emit();
        this.after(1500, () => {
          this.wordGuessActive = null;
          this.emit();
        });
        this.toast(
          outcome.isCorrect
            ? `${config.name} guessed the word "${outcome.guessedWord}"! +${outcome.pointsChange} pts`
            : `${config.name}'s word guess was wrong! ${outcome.pointsChange} pts`,
          outcome.isCorrect ? 'success' : 'info'
        );
        this.persist();
        this.emit();
        return;
      }

      const outcome = engine.processGuess(botId, decision.targetId, decision.letter);
      if (outcome.blankSelectionRequired || outcome.duplicateSelectionRequired) {
        const kind = outcome.blankSelectionRequired ? 'blank' : 'duplicate';
        const targetIsBot = sanitized.players.find(p => p.userId === outcome.targetPlayerId)?.isBot;
        if (targetIsBot) {
          // bot target picks which position to reveal
          const targetConfig = this.settings?.bots.find(b => b.id === outcome.targetPlayerId);
          this.setBotThinking(outcome.targetPlayerId, 'choosing which position to reveal...');
          await this.afterAsync(this.botDelay());
          if (!targetConfig || this.disposed || !this.engine) return;
          const posDecision = await decidePosition(
            targetConfig,
            this.engine.sanitizeGame(),
            kind,
            kind === 'duplicate' ? outcome.letter : null,
            outcome.positions
          );
          const position =
            posDecision.action === 'pickPosition' ? posDecision.position : Math.max(...outcome.positions);
          if (kind === 'duplicate') {
            this.engine.resolveDuplicateSelection(botId, outcome.targetPlayerId, position, outcome.letter);
          } else {
            this.engine.resolveBlankSelection(botId, outcome.targetPlayerId, position);
          }
          this.persist();
          this.emit();
        } else {
          // human target must choose
          this.pendingSelection = {
            positions: outcome.positions,
            deadline: Date.now() + SELECTION_TIMEOUT_MS,
            kind,
            letter: kind === 'duplicate' ? outcome.letter : undefined,
          };
          this.emit();
          this.after(SELECTION_TIMEOUT_MS, () => this.autoSelectPosition());
        }
      } else {
        this.persist();
        this.emit();
        if (outcome.isCorrect) {
          // bot keeps its turn; pump continues automatically
          this.scheduleTick();
        }
      }
    } catch (err) {      console.error('bot turn failed:', err);
      this.warnings[botId] = `Turn failed (${(err as Error).message})`;
      try {
        this.engine?.handleTurnTimeout();
      } catch {
        /* ignore */
      }
      this.persist();
      this.emit();
    } finally {
      if (this.busy) {
        this.busy = false;
      }
      this.setBotThinking(null, null);
      this.scheduleTick();
    }
  }

  private afterAsync(ms: number): Promise<void> {
    return new Promise(resolve => {
      this.after(ms, resolve);
    });
  }

  // ------------------------------------------------------------ human actions

  async selectWord(word: string, frontPadding: number, backPadding: number): Promise<void> {
    if (!this.engine) return;
    try {
      await this.engine.selectWord(this.humanPlayerId!, word, frontPadding, backPadding);
      this.persist();
      this.emit();
      this.scheduleTick();
    } catch (err) {
      this.toast((err as Error).message, 'error');
      this.emit();
    }
  }

  guessLetter(targetPlayerId: string, letter: string): void {
    if (!this.engine) return;
    if (this.engine.getStatus() !== 'ACTIVE') return;
    try {
      const outcome = this.engine.processGuess(this.humanPlayerId!, targetPlayerId, letter);

      if (outcome.blankSelectionRequired || outcome.duplicateSelectionRequired) {
        const kind = outcome.blankSelectionRequired ? 'blank' : 'duplicate';
        const targetIsBot = this.engine
          .sanitizeGame()
          .players.find(p => p.userId === outcome.targetPlayerId)?.isBot;
        if (targetIsBot) {
          this.busy = true;
          const targetConfig = this.settings?.bots.find(b => b.id === outcome.targetPlayerId);
          this.setBotThinking(outcome.targetPlayerId, 'choosing which position to reveal...');
          void (async () => {
            await this.afterAsync(this.botDelay());
            if (!targetConfig || this.disposed || !this.engine) return;
            const posDecision = await decidePosition(
              targetConfig,
              this.engine.sanitizeGame(),
              kind,
              kind === 'duplicate' ? outcome.letter : null,
              outcome.positions
            );
            const position =
              posDecision.action === 'pickPosition' ? posDecision.position : Math.max(...outcome.positions);
            if (kind === 'duplicate') {
              this.engine.resolveDuplicateSelection(this.humanPlayerId!, outcome.targetPlayerId, position, outcome.letter);
            } else {
              this.engine.resolveBlankSelection(this.humanPlayerId!, outcome.targetPlayerId, position);
            }
            this.busy = false;
            this.setBotThinking(null, null);
            this.persist();
            this.emit();
            this.scheduleTick();
          })();
          return;
        }
        // human target (shouldn't happen — human can't target self) — just resolve rightmost
        this.engine.resolveBlankSelection(this.humanPlayerId!, outcome.targetPlayerId, Math.max(...outcome.positions));
      }

      this.persist();
      this.emit();
      this.scheduleTick();
    } catch (err) {
      this.toast((err as Error).message, 'error');
      this.emit();
    }
  }

  selectPosition(position: number): void {
    if (!this.engine || !this.pendingSelection) return;
    try {
      const pending = this.pendingSelection;
      if (!pending.positions.includes(position)) {
        this.toast('Invalid position', 'error');
        return;
      }
      this.pendingSelection = null;
      if (pending.kind === 'duplicate' && pending.letter) {
        this.engine.resolveDuplicateSelection(
          this.engine.sanitizeGame().currentTurnPlayerId || 'human',
          this.humanPlayerId!,
          position,
          pending.letter
        );
      } else {
        this.engine.resolveBlankSelection(
          this.engine.sanitizeGame().currentTurnPlayerId || 'human',
          this.humanPlayerId!,
          position
        );
      }
      this.persist();
      this.emit();
      this.scheduleTick();
    } catch (err) {
      this.toast((err as Error).message, 'error');
      this.emit();
    }
  }

  private autoSelectPosition(): void {
    if (!this.engine || !this.pendingSelection) return;
    const pending = this.pendingSelection;
    const rightmost = Math.max(...pending.positions);
    this.pendingSelection = null;
    try {
      if (pending.kind === 'duplicate' && pending.letter) {
        this.engine.resolveDuplicateSelection(
          this.engine.sanitizeGame().currentTurnPlayerId || 'human',
          this.humanPlayerId!,
          rightmost,
          pending.letter
        );
      } else {
        this.engine.resolveBlankSelection(
          this.engine.sanitizeGame().currentTurnPlayerId || 'human',
          this.humanPlayerId!,
          rightmost
        );
      }
      this.toast('Position auto-selected (timeout)', 'info');
      this.persist();
      this.emit();
      this.scheduleTick();
    } catch (err) {
      console.error('auto-select failed:', err);
    }
  }

  initiateWordGuess(targetPlayerId: string): void {
    if (!this.engine || this.wordGuessActive) return;
    if (this.engine.getStatus() !== 'ACTIVE') return;
    const game = this.engine.sanitizeGame();
    const target = game.players.find(p => p.userId === targetPlayerId);
    if (!target) return;
    this.wordGuessActive = {
      guessingPlayerId: this.humanPlayerId!,
      guessingPlayerName: game.players.find(p => p.userId === this.humanPlayerId)?.displayName || 'You',
      targetPlayerId,
      targetPlayerName: target.displayName,
      deadline: Date.now() + WORD_GUESS_TIMEOUT_MS,
      isBot: false,
    };
    this.emit();
    this.after(WORD_GUESS_TIMEOUT_MS, () => this.submitWordGuess('', true));
  }

  submitWordGuess(word: string, timedOut = false): void {
    if (!this.engine || !this.wordGuessActive) return;
    const pending = this.wordGuessActive;
    this.wordGuessActive = null;
    try {
      const outcome = this.engine.processWordGuess(pending.guessingPlayerId, pending.targetPlayerId, word);
      if (timedOut) {
        this.toast(`${pending.guessingPlayerName}'s word guess timed out! ${outcome.pointsChange} pts`, 'info');
      } else if (outcome.isCorrect) {
        this.toast(`${pending.guessingPlayerName} guessed the word correctly! +${outcome.pointsChange} pts`, 'success');
      } else {
        this.toast(`${pending.guessingPlayerName}'s word guess was wrong! ${outcome.pointsChange} pts`, 'info');
      }
      this.persist();
      this.emit();
      this.scheduleTick();
    } catch (err) {
      this.toast((err as Error).message, 'error');
      this.emit();
    }
  }

  cancelWordGuess(): void {
    if (!this.wordGuessActive || this.wordGuessActive.isBot) return;
    this.wordGuessActive = null;
    this.emit();
    this.scheduleTick();
  }

  handleTurnTimeout(): void {
    if (!this.engine) return;
    try {
      const result = this.engine.handleTurnTimeout();
      this.toast(`${result.timedOutPlayerName}'s turn timed out!`, 'info');
      this.persist();
      this.emit();
      this.scheduleTick();
    } catch (err) {
      console.error('turn timeout failed:', err);
    }
  }

  endGame(): void {
    if (!this.engine) return;
    try {
      this.engine.endGame();
      this.persist();
      this.emit();
      this.handleArchival();
    } catch (err) {
      this.toast((err as Error).message, 'error');
    }
  }

  abandon(): void {
    clearActiveGame();
    this.dispose();
  }

  // ------------------------------------------------------------ archival

  private handleArchival(): void {
    if (!this.engine || this.archived) return;
    if (this.engine.getStatus() !== 'COMPLETED') return;
    this.archived = true;
    try {
      const snapshot = this.engine.toJSON();
      const entry: HistoryEntry = {
        id: snapshot.id,
        roomCode: snapshot.roomCode,
        createdAt: snapshot.currentTurnStartedAt || new Date().toISOString(),
        completedAt: new Date().toISOString(),
        players: snapshot.players.map(p => ({
          playerId: p.id,
          playerName: p.displayName,
          finalScore: p.totalScore,
          placement: snapshot.finalResults?.find(r => r.playerId === p.id)?.placement ?? 0,
          secretWord: p.secretWord,
          isBot: p.isBot,
        })),
        turns: snapshot.turns.map(t => ({
          turnNumber: t.turnNumber,
          playerName: snapshot.players.find(p => p.id === t.playerId)?.displayName || '?',
          targetName: snapshot.players.find(p => p.id === t.targetPlayerId)?.displayName || '?',
          guessedLetter: t.guessedLetter,
          isCorrect: t.isCorrect,
          pointsScored: t.pointsScored,
        })),
      };
      const history = loadHistory();
      history.unshift(entry);
      saveHistory(history);
      clearActiveGame();
    } catch (err) {
      console.error('Failed to archive game:', err);
    }
  }

  /** Debug accessor (tests). */
  debugInfo(): { turnCount: number; status: string; players: { id: string; score: number; elim: boolean; word: string | null }[] } {
    const snap = this.engine?.toJSON();
    return {
      turnCount: snap?.turns.length ?? 0,
      status: snap?.status ?? 'none',
      players: (snap?.players ?? []).map(p => ({ id: p.id, score: p.totalScore, elim: p.isEliminated, word: p.secretWord })),
    };
  }

  /** Keep a reference so the pump never re-archives. */
  isCompleted(): boolean {
    return this.engine?.getStatus() === 'COMPLETED';
  }
}
