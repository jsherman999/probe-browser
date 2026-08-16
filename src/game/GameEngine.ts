import { ScoringEngine } from './ScoringEngine';
import { WordValidator } from './WordValidator';
import type {
  GameStatus,
  GuessOutcome,
  LocalPlayer,
  SanitizedGame,
  SanitizedPlayer,
  TurnRecord,
  WordGuessOutcome,
} from './types';

export interface NewPlayerInput {
  id: string;
  displayName: string;
  isBot: boolean;
  botProviderId?: string | null;
  botModel?: string | null;
}

export interface EngineSnapshot {
  id: string;
  roomCode: string;
  status: GameStatus;
  hostId: string;
  currentTurnPlayerId: string | null;
  roundNumber: number;
  turnTimerSeconds: number;
  currentTurnStartedAt: string | null;
  players: LocalPlayer[];
  turns: TurnRecord[];
  finalResults: { playerId: string; playerName: string; finalScore: number; placement: number }[] | null;
}

/**
 * Browser-only port of the Probe backend GameManager.
 * All state is in-memory; the class is fully serializable via toJSON()/fromJSON()
 * so a game can be paused and resumed from localStorage.
 */
export class GameEngine {
  private readonly BLANK_CHAR = '\u2022';

  private id: string;
  private roomCode: string;
  private status: GameStatus = 'WAITING';
  private hostId: string;
  private players: LocalPlayer[];
  private currentTurnPlayerId: string | null = null;
  private roundNumber = 1;
  private turnTimerSeconds: number;
  private currentTurnStartedAt: string | null = null;
  private turns: TurnRecord[] = [];
  private finalResults: { playerId: string; playerName: string; finalScore: number; placement: number }[] | null = null;
  private turnCounter = 0;

  private wordValidator: WordValidator;
  private scoringEngine = new ScoringEngine();

  constructor(players: NewPlayerInput[], turnTimerSeconds = 300, validator?: WordValidator) {
    if (players.length < 2 || players.length > 4) {
      throw new Error('A game needs 2-4 players');
    }
    this.wordValidator = validator ?? new WordValidator();
    this.id = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.roomCode = this.generateRoomCode();
    this.hostId = players[0].id;
    this.turnTimerSeconds = Math.max(10, Math.min(1800, turnTimerSeconds));
    this.players = players.map((p, i) => ({
      id: p.id,
      displayName: p.displayName,
      turnOrder: i,
      secretWord: null,
      paddedWord: null,
      frontPadding: 0,
      backPadding: 0,
      revealedPositions: [],
      totalScore: 0,
      isEliminated: false,
      missedLetters: [],
      isBot: p.isBot,
      botProviderId: p.botProviderId ?? null,
      botModel: p.botModel ?? null,
    }));
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  // ---------------------------------------------------------------- lifecycle

  getStatus(): GameStatus {
    return this.status;
  }

  getTurnTimerSeconds(): number {
    return this.turnTimerSeconds;
  }

  startGame(): void {
    if (this.status !== 'WAITING') {
      throw new Error('Game already started');
    }
    if (this.players.length < 2) {
      throw new Error('Need at least 2 players');
    }
    this.status = 'WORD_SELECTION';
  }

  async selectWord(playerId: string, word: string, frontPadding = 0, backPadding = 0): Promise<void> {
    word = word.toUpperCase().trim();

    if (frontPadding < 0 || backPadding < 0) {
      throw new Error('Padding cannot be negative');
    }
    const totalLength = word.length + frontPadding + backPadding;
    if (totalLength > 12) {
      throw new Error('Total word length with padding cannot exceed 12');
    }
    if (!this.wordValidator.isValidLength(word)) {
      throw new Error('Word must be 4-12 letters');
    }
    if (!this.wordValidator.hasValidCharacters(word)) {
      throw new Error('Word contains invalid characters');
    }
    if (!(await this.wordValidator.isValidWord(word))) {
      throw new Error('Not a valid English word');
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error('Not in this game');
    }
    if (this.status !== 'WORD_SELECTION') {
      throw new Error('Not in word selection phase');
    }

    const paddedWord = this.BLANK_CHAR.repeat(frontPadding) + word + this.BLANK_CHAR.repeat(backPadding);
    player.secretWord = word;
    player.paddedWord = paddedWord;
    player.frontPadding = frontPadding;
    player.backPadding = backPadding;
    player.revealedPositions = new Array(paddedWord.length).fill(false);

    const allReady = this.players.every(p => p.secretWord !== null);
    if (allReady) {
      this.status = 'ACTIVE';
      this.currentTurnPlayerId = this.players[0].id;
      this.currentTurnStartedAt = new Date().toISOString();
    }
  }

  /**
   * Advance the turn to the next non-eliminated player after `fromPlayerId`.
   * Completes the game if one or fewer active players remain.
   */
  private advanceTurn(fromPlayerId: string): void {
    const active = this.players.filter(p => !p.isEliminated);
    if (active.length <= 1) {
      this.completeGame();
      return;
    }
    const currentIndex = this.players.findIndex(p => p.id === fromPlayerId);
    let nextIndex = (currentIndex + 1) % this.players.length;
    let guard = 0;
    while (this.players[nextIndex].isEliminated && guard < this.players.length) {
      nextIndex = (nextIndex + 1) % this.players.length;
      guard++;
    }
    this.currentTurnPlayerId = this.players[nextIndex].id;
    this.currentTurnStartedAt = new Date().toISOString();
  }

  handleTurnTimeout(): { timedOutPlayerId: string; timedOutPlayerName: string; nextPlayerId: string | null; nextPlayerName: string } {
    if (this.status !== 'ACTIVE') {
      throw new Error('Game not active');
    }
    const timedOut = this.players.find(p => p.id === this.currentTurnPlayerId);
    if (!timedOut) {
      throw new Error('Current player not found');
    }
    const nextId = this.nextActivePlayerId(timedOut.id);
    if (!nextId) {
      this.completeGame();
    } else {
      this.currentTurnPlayerId = nextId;
      this.currentTurnStartedAt = new Date().toISOString();
    }
    const next = this.players.find(p => p.id === nextId);
    return {
      timedOutPlayerId: timedOut.id,
      timedOutPlayerName: timedOut.displayName,
      nextPlayerId: nextId,
      nextPlayerName: next?.displayName || '—',
    };
  }

  private nextActivePlayerId(fromPlayerId: string): string | null {
    const active = this.players.filter(p => !p.isEliminated);
    if (active.length <= 1) return null;
    const currentIndex = this.players.findIndex(p => p.id === fromPlayerId);
    let nextIndex = (currentIndex + 1) % this.players.length;
    let guard = 0;
    while (this.players[nextIndex].isEliminated && guard < this.players.length) {
      nextIndex = (nextIndex + 1) % this.players.length;
      guard++;
    }
    return this.players[nextIndex].id;
  }

  // ---------------------------------------------------------------- guessing

  processGuess(playerId: string, targetPlayerId: string, letter: string): GuessOutcome {
    letter = letter.toUpperCase();

    if (this.status !== 'ACTIVE') {
      throw new Error('Game not active');
    }
    if (this.currentTurnPlayerId !== playerId) {
      throw new Error('Not your turn');
    }

    const targetPlayer = this.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer || targetPlayer.isEliminated) {
      throw new Error('Invalid target player');
    }

    const word = targetPlayer.paddedWord || targetPlayer.secretWord!;
    const revealedPositions = targetPlayer.revealedPositions;

    const isBlankGuess = letter === 'BLANK';
    const charToFind = isBlankGuess ? this.BLANK_CHAR : letter;

    const positions: number[] = [];
    for (let i = 0; i < word.length; i++) {
      if (word[i] === charToFind && !revealedPositions[i]) {
        positions.push(i);
      }
    }

    const isCorrect = positions.length > 0;
    let pointsScored = 0;
    let blankMissPenalty = false;

    // Multiple unrevealed blanks -> target player must choose
    if (isBlankGuess && positions.length > 1) {
      return {
        blankSelectionRequired: true,
        positions,
        targetPlayerId,
        isCorrect: true,
        letter,
        pointsScored: 0,
        revealedWord: [],
        wordCompleted: false,
        gameOver: false,
        finalResults: null,
        currentTurnPlayerId: playerId,
        game: this.sanitizeGame(playerId),
      };
    }

    // Multiple unrevealed duplicates -> target player must choose
    if (!isBlankGuess && positions.length > 1) {
      return {
        duplicateSelectionRequired: true,
        positions,
        targetPlayerId,
        isCorrect: true,
        letter,
        pointsScored: 0,
        revealedWord: [],
        wordCompleted: false,
        gameOver: false,
        finalResults: null,
        currentTurnPlayerId: playerId,
        game: this.sanitizeGame(playerId),
      };
    }

    // Penalty for guessing BLANK when no blanks are available
    if (isBlankGuess && positions.length === 0) {
      blankMissPenalty = true;
      pointsScored = -50;
      const guessingPlayer = this.players.find(p => p.id === playerId);
      if (guessingPlayer) {
        guessingPlayer.totalScore -= 50;
      }
    }

    if (isCorrect) {
      positions.forEach(pos => {
        revealedPositions[pos] = true;
      });

      const isBlankPosition = (pos: number) => word[pos] === this.BLANK_CHAR;
      pointsScored = this.scoringEngine.calculateScore(positions, isBlankPosition);

      targetPlayer.isEliminated = revealedPositions.every(p => p);

      if (pointsScored > 0) {
        const guessingPlayer = this.players.find(p => p.id === playerId);
        if (guessingPlayer) {
          guessingPlayer.totalScore += pointsScored;
        }
      }
    }

    this.recordTurn(playerId, targetPlayerId, letter, isCorrect, positions, pointsScored);

    if (!isCorrect) {
      if (!targetPlayer.missedLetters.includes(letter)) {
        targetPlayer.missedLetters.push(letter);
      }
      this.advanceTurn(playerId);
    }

    const gameOver = this.checkGameOver();

    return {
      isCorrect,
      positions,
      pointsScored,
      blankMissPenalty,
      letter,
      targetPlayerId,
      revealedWord: revealedPositions.map((revealed, i) => (revealed ? word[i] : null)),
      wordCompleted: revealedPositions.every(p => p),
      gameOver,
      finalResults: this.finalResults,
      currentTurnPlayerId: this.currentTurnPlayerId,
      game: this.sanitizeGame(playerId),
    };
  }

  resolveBlankSelection(guessingPlayerId: string, targetPlayerId: string, selectedPosition: number): GuessOutcome {
    if (this.status !== 'ACTIVE') {
      throw new Error('Game not active');
    }
    const targetPlayer = this.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer) {
      throw new Error('Invalid target player');
    }

    const word = targetPlayer.paddedWord || targetPlayer.secretWord!;
    const revealedPositions = targetPlayer.revealedPositions;

    if (selectedPosition < 0 || selectedPosition >= word.length) {
      throw new Error('Invalid position');
    }
    if (word[selectedPosition] !== this.BLANK_CHAR) {
      throw new Error('Selected position is not a blank');
    }
    if (revealedPositions[selectedPosition]) {
      throw new Error('Position already revealed');
    }

    revealedPositions[selectedPosition] = true;
    const pointsScored = 0;
    targetPlayer.isEliminated = revealedPositions.every(p => p);

    this.recordTurn(guessingPlayerId, targetPlayerId, 'BLANK', true, [selectedPosition], pointsScored);

    const gameOver = this.checkGameOver();

    return {
      isCorrect: true,
      positions: [selectedPosition],
      pointsScored,
      letter: 'BLANK',
      targetPlayerId,
      revealedWord: revealedPositions.map((revealed, i) => (revealed ? word[i] : null)),
      wordCompleted: revealedPositions.every(p => p),
      gameOver,
      finalResults: this.finalResults,
      currentTurnPlayerId: guessingPlayerId,
      game: this.sanitizeGame(guessingPlayerId),
    };
  }

  resolveDuplicateSelection(guessingPlayerId: string, targetPlayerId: string, selectedPosition: number, letter: string): GuessOutcome {
    if (this.status !== 'ACTIVE') {
      throw new Error('Game not active');
    }
    const targetPlayer = this.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer) {
      throw new Error('Invalid target player');
    }

    const word = targetPlayer.paddedWord || targetPlayer.secretWord!;
    const revealedPositions = targetPlayer.revealedPositions;

    if (selectedPosition < 0 || selectedPosition >= word.length) {
      throw new Error('Invalid position');
    }
    if (word[selectedPosition].toUpperCase() !== letter.toUpperCase()) {
      throw new Error('Selected position does not contain the letter');
    }
    if (revealedPositions[selectedPosition]) {
      throw new Error('Position already revealed');
    }

    revealedPositions[selectedPosition] = true;

    const isBlankPosition = (pos: number) => word[pos] === this.BLANK_CHAR;
    const pointsScored = this.scoringEngine.calculateScore([selectedPosition], isBlankPosition);

    targetPlayer.isEliminated = revealedPositions.every(p => p);

    if (pointsScored > 0) {
      const guessingPlayer = this.players.find(p => p.id === guessingPlayerId);
      if (guessingPlayer) {
        guessingPlayer.totalScore += pointsScored;
      }
    }

    this.recordTurn(guessingPlayerId, targetPlayerId, letter, true, [selectedPosition], pointsScored);

    const gameOver = this.checkGameOver();

    return {
      isCorrect: true,
      positions: [selectedPosition],
      pointsScored,
      letter,
      targetPlayerId,
      revealedWord: revealedPositions.map((revealed, i) => (revealed ? word[i] : null)),
      wordCompleted: revealedPositions.every(p => p),
      gameOver,
      finalResults: this.finalResults,
      currentTurnPlayerId: guessingPlayerId,
      game: this.sanitizeGame(guessingPlayerId),
    };
  }

  processWordGuess(guessingPlayerId: string, targetPlayerId: string, guessedWord: string): WordGuessOutcome {
    guessedWord = guessedWord.toUpperCase().trim();

    if (this.status !== 'ACTIVE') {
      throw new Error('Game not active');
    }
    const targetPlayer = this.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer || targetPlayer.isEliminated) {
      throw new Error('Invalid target player');
    }
    const guessingPlayer = this.players.find(p => p.id === guessingPlayerId);
    if (!guessingPlayer) {
      throw new Error('Guessing player not found');
    }

    const actualWord = targetPlayer.secretWord!.toUpperCase();
    const paddedWord = targetPlayer.paddedWord || actualWord;
    const revealedPositions = targetPlayer.revealedPositions;
    const unrevealedCount = revealedPositions.filter(r => !r).length;

    const isCorrect = guessedWord === actualWord;

    let pointsChange = 0;
    if (isCorrect) {
      pointsChange = unrevealedCount >= 5 ? 100 : 50;
      targetPlayer.revealedPositions = new Array(paddedWord.length).fill(true);
      targetPlayer.isEliminated = true;
    } else {
      pointsChange = -50;
    }

    guessingPlayer.totalScore += pointsChange;

    if (!isCorrect) {
      this.advanceTurn(guessingPlayerId);
    }

    this.recordTurn(
      guessingPlayerId,
      targetPlayerId,
      `WORD:${guessedWord}`,
      isCorrect,
      isCorrect ? Array.from({ length: paddedWord.length }, (_, i) => i) : [],
      pointsChange
    );

    const gameOver = this.checkGameOver();

    return {
      isCorrect,
      guessedWord,
      actualWord: isCorrect ? actualWord : null,
      targetPlayerId,
      guessingPlayerId,
      pointsChange,
      unrevealedCount,
      gameOver,
      finalResults: this.finalResults,
      game: this.sanitizeGame(guessingPlayerId),
    };
  }

  private recordTurn(
    playerId: string,
    targetPlayerId: string,
    guessedLetter: string,
    isCorrect: boolean,
    positionsRevealed: number[],
    pointsScored: number
  ): void {
    this.turnCounter++;
    this.turns.push({
      turnNumber: this.turnCounter,
      playerId,
      targetPlayerId,
      guessedLetter,
      isCorrect,
      positionsRevealed,
      pointsScored,
      createdAt: new Date().toISOString(),
    });
  }

  // ---------------------------------------------------------------- game over

  private checkGameOver(): boolean {
    const active = this.players.filter(p => !p.isEliminated);
    if (active.length <= 1 && this.status === 'ACTIVE') {
      this.completeGame();
      return true;
    }
    return false;
  }

  private completeGame(): void {
    if (this.status === 'COMPLETED') return;
    this.status = 'COMPLETED';
    const sorted = [...this.players].sort((a, b) => b.totalScore - a.totalScore);
    this.finalResults = sorted.map((p, index) => ({
      playerId: p.id,
      playerName: p.displayName,
      finalScore: p.totalScore,
      placement: index + 1,
    }));
  }

  endGame(): void {
    if (this.status === 'COMPLETED') {
      throw new Error('Game already completed');
    }
    this.completeGame();
  }

  // ---------------------------------------------------------------- serialization

  toJSON(): EngineSnapshot {
    return {
      id: this.id,
      roomCode: this.roomCode,
      status: this.status,
      hostId: this.hostId,
      currentTurnPlayerId: this.currentTurnPlayerId,
      roundNumber: this.roundNumber,
      turnTimerSeconds: this.turnTimerSeconds,
      currentTurnStartedAt: this.currentTurnStartedAt,
      players: this.players,
      turns: this.turns,
      finalResults: this.finalResults,
    };
  }

  static fromJSON(snapshot: EngineSnapshot): GameEngine {
    const engine = new GameEngine(
      snapshot.players.map(p => ({
        id: p.id,
        displayName: p.displayName,
        isBot: p.isBot,
        botProviderId: p.botProviderId,
        botModel: p.botModel,
      })),
      snapshot.turnTimerSeconds
    );
    engine.id = snapshot.id;
    engine.roomCode = snapshot.roomCode;
    engine.status = snapshot.status;
    engine.hostId = snapshot.hostId;
    engine.currentTurnPlayerId = snapshot.currentTurnPlayerId;
    engine.roundNumber = snapshot.roundNumber;
    engine.currentTurnStartedAt = snapshot.currentTurnStartedAt;
    engine.players = snapshot.players.map(p => ({ ...p, revealedPositions: [...p.revealedPositions] }));
    engine.turns = snapshot.turns;
    engine.finalResults = snapshot.finalResults;
    return engine;
  }

  getTurns(): TurnRecord[] {
    return this.turns;
  }

  getRoomCode(): string {
    return this.roomCode;
  }

  // ---------------------------------------------------------------- sanitize

  sanitizeGame(forUserId?: string): SanitizedGame {
    return {
      id: this.id,
      roomCode: this.roomCode,
      status: this.status,
      hostId: this.hostId,
      currentTurnPlayerId: this.currentTurnPlayerId,
      roundNumber: this.roundNumber,
      turnTimerSeconds: this.turnTimerSeconds,
      currentTurnStartedAt: this.currentTurnStartedAt,
      players: this.players.map((p): SanitizedPlayer => {
        const word = p.paddedWord || p.secretWord;
        const wordLength = word?.length || 0;
        const isOwnPlayer = forUserId && p.id === forUserId;

        return {
          id: p.id,
          userId: p.id,
          displayName: p.displayName,
          turnOrder: p.turnOrder,
          wordLength,
          hasSelectedWord: p.secretWord !== null,
          frontPadding: p.frontPadding,
          backPadding: p.backPadding,
          mySecretWord: isOwnPlayer && p.secretWord ? p.secretWord : undefined,
          revealedPositions: word
            ? p.revealedPositions.map((revealed, i) => {
                if (!revealed) return null;
                return word[i] === this.BLANK_CHAR ? 'BLANK' : word[i];
              })
            : [],
          missedLetters: p.missedLetters,
          totalScore: p.totalScore,
          isEliminated: p.isEliminated,
          isBot: p.isBot,
          botProviderId: p.botProviderId,
          botModel: p.botModel,
        };
      }),
      finalResults: this.finalResults ?? undefined,
    };
  }
}
