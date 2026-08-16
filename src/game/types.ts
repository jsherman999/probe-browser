// Shared game types (ported from backend GameManager/prisma shapes)

export type GameStatus = 'WAITING' | 'WORD_SELECTION' | 'ACTIVE' | 'COMPLETED';

export interface LocalPlayer {
  id: string; // stable local id (also used as userId)
  displayName: string;
  turnOrder: number;
  secretWord: string | null;
  paddedWord: string | null;
  frontPadding: number;
  backPadding: number;
  revealedPositions: boolean[];
  totalScore: number;
  isEliminated: boolean;
  missedLetters: string[];
  isBot: boolean;
  // bot config
  botProviderId?: string | null;
  botModel?: string | null; // null => provider default free model
}

export interface SanitizedPlayer {
  id: string;
  userId: string;
  displayName: string;
  turnOrder: number;
  wordLength: number;
  hasSelectedWord: boolean;
  frontPadding: number;
  backPadding: number;
  mySecretWord?: string;
  revealedPositions: (string | null)[];
  missedLetters: string[];
  totalScore: number;
  isEliminated: boolean;
  isBot: boolean;
  botProviderId?: string | null;
  botModel?: string | null;
}

export interface SanitizedGame {
  id: string;
  roomCode: string;
  status: GameStatus;
  hostId: string;
  currentTurnPlayerId: string | null;
  roundNumber: number;
  turnTimerSeconds: number;
  currentTurnStartedAt: string | null;
  players: SanitizedPlayer[];
  finalResults?: FinalResult[] | null;
}

export interface FinalResult {
  playerId: string;
  playerName: string;
  finalScore: number;
  placement: number;
}

export interface TurnRecord {
  turnNumber: number;
  playerId: string;
  targetPlayerId: string;
  guessedLetter: string; // letter or `WORD:${word}` or 'BLANK'
  isCorrect: boolean;
  positionsRevealed: number[];
  pointsScored: number;
  createdAt: string;
}

export interface GuessOutcome {
  isCorrect: boolean;
  positions: number[];
  pointsScored: number;
  blankMissPenalty?: boolean;
  letter: string;
  targetPlayerId: string;
  revealedWord: (string | null)[];
  wordCompleted: boolean;
  gameOver: boolean;
  finalResults: FinalResult[] | null;
  currentTurnPlayerId: string | null;
  blankSelectionRequired?: boolean;
  duplicateSelectionRequired?: boolean;
  game: SanitizedGame;
}

export interface WordGuessOutcome {
  isCorrect: boolean;
  guessedWord: string;
  actualWord: string | null;
  targetPlayerId: string;
  guessingPlayerId: string;
  pointsChange: number;
  unrevealedCount: number;
  gameOver: boolean;
  finalResults: FinalResult[] | null;
  game: SanitizedGame;
}
