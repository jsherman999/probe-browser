import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LocalGameController, type ControllerUI } from '../services/LocalGameController';
import { getController, setController, clearController } from '../services/gameSession';
import { loadActiveGame } from '../services/LocalGameController';

function useLocalGame(): {
  ui: ControllerUI | null;
  controller: LocalGameController | null;
  now: number;
} {
  const navigate = useNavigate();
  const [ui, setUi] = useState<ControllerUI | null>(null);
  const [now, setNow] = useState(Date.now());
  const controllerRef = useRef<LocalGameController | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let controller = getController();
    if (!controller) {
      const saved = loadActiveGame();
      if (saved) {
        controller = LocalGameController.resume(saved);
        setController(controller);
      }
    }
    if (!controller) {
      navigate('/');
      return;
    }
    controllerRef.current = controller;
    const unsub = controller.subscribe(setUi);
    setUi(controller.getUI());
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 500ms clock for countdowns
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  return { ui, controller: controllerRef.current, now };
}

// Small toast banner
function ToastBanner({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose, message]);
  return (
    <div className="fixed top-4 right-4 z-50 bg-warning text-black px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-pulse">
      <span className="font-semibold">{message}</span>
      <button onClick={onClose} className="ml-2 text-black/60 hover:text-black">
        &times;
      </button>
    </div>
  );
}

export default function Game() {
  const navigate = useNavigate();
  const { ui, controller, now } = useLocalGame();
  const [selectedWord, setSelectedWord] = useState('');
  const [frontPadding, setFrontPadding] = useState(0);
  const [backPadding, setBackPadding] = useState(0);
  const [error, setError] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [wordGuessInput, setWordGuessInput] = useState('');
  const [showMyWord, setShowMyWord] = useState(false);

  const game = ui?.game ?? null;
  const humanId = ui?.humanPlayerId ?? 'human';

  // Auto-dismiss toast when it changes
  const [toast, setToast] = useState<{ message: string; kind: string } | null>(null);
  useEffect(() => {
    if (ui?.toast) {
      setToast(ui.toast);
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
    setToast(null);
  }, [ui?.toast?.message]);

  // Human turn auto-timeout
  const lastTurnEndsAt = useRef<number | null>(null);
  useEffect(() => {
    if (!controller || !ui) return;
    if (ui.turnEndsAt && ui.turnEndsAt !== lastTurnEndsAt.current && now >= ui.turnEndsAt) {
      lastTurnEndsAt.current = ui.turnEndsAt;
      controller.handleTurnTimeout();
    }
    if (!ui.turnEndsAt) lastTurnEndsAt.current = null;
  }, [now, ui, controller]);

  // Auto-select opponent in 2-player games
  useEffect(() => {
    if (game?.status === 'ACTIVE' && game.currentTurnPlayerId === humanId) {
      const others = game.players.filter(p => p.userId !== humanId && !p.isEliminated);
      if (others.length === 1) {
        setSelectedTarget(others[0].userId);
      }
    }
  }, [game?.status, game?.currentTurnPlayerId, game?.players, humanId]);

  if (!controller || !ui || !game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-text-muted">Loading game...</p>
      </div>
    );
  }

  const formatTime = (ms: number): string => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const timeRemaining =
    ui.turnEndsAt !== null ? Math.max(0, ui.turnEndsAt - now) : null;

  const selectionRemaining = ui.pendingSelection
    ? Math.max(0, ui.pendingSelection.deadline - now)
    : null;
  const wordGuessRemaining = ui.wordGuessActive
    ? Math.max(0, ui.wordGuessActive.deadline - now)
    : null;

  const myTurn = game.status === 'ACTIVE' && game.currentTurnPlayerId === humanId;

  const handleWordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const word = selectedWord.trim().toUpperCase();
    if (word.length < 4 || word.length > 12) {
      setError('Word must be 4-12 letters');
      return;
    }
    if (!/^[A-Z]+$/.test(word)) {
      setError('Word must contain only letters');
      return;
    }
    if (word.length + frontPadding + backPadding > 12) {
      setError('Total length with blanks cannot exceed 12');
      return;
    }
    setError('');
    await controller.selectWord(word, frontPadding, backPadding);
  };

  const handleLetterGuess = (letter: string) => {
    if (!selectedTarget) {
      setError('Select a player first');
      return;
    }
    controller.guessLetter(selectedTarget, letter);
  };

  const handleLeave = () => {
    if (!confirm('Leave this game? The game will be abandoned.')) return;
    controller.abandon();
    clearController();
    navigate('/');
  };

  const handleEndGame = () => {
    if (!confirm('End this game? The current leader will be declared the winner.')) return;
    controller.endGame();
  };

  // ------------------------------------------------------------------ phases

  // WORD SELECTION
  if (game.status === 'WORD_SELECTION') {
    const myPlayer = game.players.find(p => p.userId === humanId);

    if (myPlayer?.hasSelectedWord) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="card w-full max-w-md text-center">
            <h2 className="text-2xl font-bold mb-4">Word Selected!</h2>
            <p className="text-text-secondary mb-6">Waiting for the other players to choose their words...</p>
            <div className="space-y-2 mb-6">
              {[...game.players]
                .sort((a, b) => a.turnOrder - b.turnOrder)
                .map(p => (
                  <div key={p.userId} className="flex justify-between items-center p-3 bg-primary-bg rounded">
                    <span>
                      {p.displayName}
                      {p.isBot && <span className="text-xs text-accent ml-2">🤖</span>}
                    </span>
                    <span className={p.hasSelectedWord ? 'text-success' : 'text-text-muted'}>
                      {p.hasSelectedWord ? '✓' : '...'}
                    </span>
                  </div>
                ))}
            </div>
            <button onClick={handleLeave} className="px-4 py-2 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 text-sm font-semibold">
              🚪 Abandon Game
            </button>
          </div>
        </div>
      );
    }

    const totalLength = selectedWord.length + frontPadding + backPadding;
    const maxPadding = 12 - selectedWord.length;

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card w-full max-w-md">
          <h2 className="text-2xl font-bold mb-4">Choose Your Secret Word</h2>
          <p className="text-text-secondary mb-6">
            Select a word between 4-12 letters. Add blanks to hide word position!
          </p>

          <form onSubmit={handleWordSubmit} className="space-y-4">
            <input
              type="text"
              value={selectedWord}
              onChange={e => setSelectedWord(e.target.value.toUpperCase())}
              className="input-field text-center text-2xl tracking-wider"
              placeholder="ENTER WORD"
              maxLength={12}
              autoFocus
            />

            {selectedWord.length >= 4 && (
              <div className="bg-primary-bg p-3 rounded-lg">
                <p className="text-sm text-text-muted mb-2 text-center">Preview:</p>
                <div className="flex justify-center gap-1">
                  {Array.from({ length: frontPadding }).map((_, i) => (
                    <div key={`f-${i}`} className="w-8 h-8 bg-gray-600 rounded flex items-center justify-center text-gray-400 text-lg">
                      {'\u2022'}
                    </div>
                  ))}
                  {selectedWord.split('').map((letter, i) => (
                    <div key={`l-${i}`} className="w-8 h-8 bg-accent rounded flex items-center justify-center text-white font-bold">
                      {letter}
                    </div>
                  ))}
                  {Array.from({ length: backPadding }).map((_, i) => (
                    <div key={`b-${i}`} className="w-8 h-8 bg-gray-600 rounded flex items-center justify-center text-gray-400 text-lg">
                      {'\u2022'}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedWord.length >= 4 && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Front Blanks</label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setFrontPadding(Math.max(0, frontPadding - 1))} className="w-8 h-8 bg-secondary-bg rounded hover:bg-accent" disabled={frontPadding === 0}>
                      -
                    </button>
                    <span className="w-8 text-center">{frontPadding}</span>
                    <button
                      type="button"
                      onClick={() => setFrontPadding(Math.min(maxPadding - backPadding, frontPadding + 1))}
                      className="w-8 h-8 bg-secondary-bg rounded hover:bg-accent"
                      disabled={totalLength >= 12}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Back Blanks</label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setBackPadding(Math.max(0, backPadding - 1))} className="w-8 h-8 bg-secondary-bg rounded hover:bg-accent" disabled={backPadding === 0}>
                      -
                    </button>
                    <span className="w-8 text-center">{backPadding}</span>
                    <button
                      type="button"
                      onClick={() => setBackPadding(Math.min(maxPadding - frontPadding, backPadding + 1))}
                      className="w-8 h-8 bg-secondary-bg rounded hover:bg-accent"
                      disabled={totalLength >= 12}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="text-sm text-text-muted text-center">
              {selectedWord.length} letters + {frontPadding + backPadding} blanks = {totalLength} / 12 total
            </div>

            {error && (
              <div className="bg-error/20 border border-error text-error px-4 py-3 rounded text-sm">{error}</div>
            )}

            <button type="submit" disabled={selectedWord.length < 4} className="btn-primary w-full">
              Submit Word
            </button>
          </form>
        </div>
      </div>
    );
  }

  // COMPLETED
  if (game.status === 'COMPLETED') {
    const sortedPlayers = [...game.players].sort((a, b) => b.totalScore - a.totalScore);
    const winner = sortedPlayers[0];
    const entryId = game.id;

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card w-full max-w-md text-center">
          <h2 className="text-3xl font-bold mb-2">Game Over!</h2>
          <div className="text-6xl mb-4">🏆</div>
          <p className="text-2xl font-bold text-accent mb-2">{winner?.displayName}</p>
          <p className="text-text-secondary mb-6">wins with {winner?.totalScore} points!</p>

          <div className="space-y-2 mb-6">
            {sortedPlayers.map((player, index) => (
              <div
                key={player.userId}
                className={`flex justify-between items-center p-3 rounded ${
                  index === 0 ? 'bg-accent/20 border border-accent' : 'bg-primary-bg'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${index === 0 ? 'bg-accent text-white' : 'bg-secondary-bg'}`}>
                    {index + 1}
                  </span>
                  <span className="font-semibold">
                    {player.displayName}
                    {player.userId === humanId && ' (You)'}
                    {player.isBot && ' 🤖'}
                  </span>
                </div>
                <span className="text-xl font-bold">{player.totalScore} pts</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                controller.abandon();
                clearController();
                navigate('/');
              }}
              className="btn-primary flex-1"
            >
              Back to Home
            </button>
            <button
              onClick={() => {
                clearController();
                navigate(`/history/${entryId}`);
              }}
              className="btn-secondary flex-1"
            >
              View Details
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ACTIVE (or WAITING fallback)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const getTimerColor = () => {
    if (timeRemaining === null) return 'text-text-muted';
    if (timeRemaining <= 10000) return 'text-error animate-pulse';
    if (timeRemaining <= 30000) return 'text-warning';
    return 'text-text-secondary';
  };

  const myPlayer = game.players.find(p => p.userId === humanId);

  return (
    <div className="min-h-screen p-4">
      {toast && <ToastBanner message={toast.message} onClose={() => setToast(null)} />}

      {/* Blank / duplicate selection modal (human is the target) */}
      {ui.pendingSelection && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md text-center">
            <h2 className="text-2xl font-bold mb-2">
              {ui.pendingSelection.kind === 'blank'
                ? 'Choose a Blank to Reveal'
                : `Choose a "${ui.pendingSelection.letter}" to Reveal`}
            </h2>
            <p className="text-text-secondary mb-4">
              Someone guessed {ui.pendingSelection.kind === 'blank' ? 'BLANK' : `"${ui.pendingSelection.letter}"`}!
              Select which position to reveal.
            </p>

            <div
              className={`text-3xl font-mono font-bold mb-4 ${
                (selectionRemaining ?? 0) <= 10000 ? 'text-error animate-pulse' : 'text-accent'
              }`}
            >
              {Math.ceil((selectionRemaining ?? 0) / 1000)}s
            </div>
            <p className="text-sm text-text-muted mb-4">(Rightmost position auto-selected on timeout)</p>

            <div className="flex flex-wrap justify-center gap-1 mb-4">
              {myPlayer?.revealedPositions.map((letter, i) => {
                const clickable = ui.pendingSelection!.positions.includes(i);
                const isBlank = letter === 'BLANK';
                return (
                  <button
                    key={i}
                    onClick={() => clickable && controller.selectPosition(i)}
                    disabled={!clickable}
                    className={`w-10 h-10 rounded flex items-center justify-center font-bold text-lg transition-all ${
                      clickable
                        ? 'bg-warning text-black cursor-pointer hover:bg-yellow-400 hover:scale-110 ring-2 ring-warning animate-pulse'
                        : letter
                          ? isBlank
                            ? 'bg-gray-600 text-gray-400'
                            : 'bg-accent text-white'
                          : 'bg-secondary-bg text-text-muted'
                    }`}
                  >
                    {clickable
                      ? '?'
                      : letter
                        ? isBlank
                          ? '\u2022'
                          : letter
                        : '?'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Word guess modal (human guessing) */}
      {ui.wordGuessActive && !ui.wordGuessActive.isBot && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md text-center">
            <h2 className="text-2xl font-bold mb-2">🎯 Guess the Word!</h2>
            <p className="text-text-secondary mb-4">
              Type the word you think {ui.wordGuessActive.targetPlayerName} has chosen.
            </p>

            <div
              className={`text-4xl font-mono font-bold mb-4 ${
                (wordGuessRemaining ?? 0) <= 10000 ? 'text-error animate-pulse' : 'text-purple-400'
              }`}
            >
              {Math.ceil((wordGuessRemaining ?? 0) / 1000)}s
            </div>

            <div className="bg-primary-bg p-3 rounded-lg mb-4 text-sm">
              <p className="text-green-400">✓ Correct (5+ unrevealed): +100 pts</p>
              <p className="text-green-300">✓ Correct (&lt;5 unrevealed): +50 pts</p>
              <p className="text-red-400">✗ Wrong or timeout: -50 pts</p>
            </div>

            <input
              type="text"
              value={wordGuessInput}
              onChange={e => setWordGuessInput(e.target.value.toUpperCase())}
              className="input-field text-center text-2xl tracking-wider mb-4"
              placeholder="ENTER WORD"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && wordGuessInput.trim()) {
                  controller.submitWordGuess(wordGuessInput.trim().toUpperCase());
                  setWordGuessInput('');
                }
              }}
            />

            <div className="flex gap-3">
              <button onClick={() => controller.cancelWordGuess()} className="flex-1 py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  controller.submitWordGuess(wordGuessInput.trim().toUpperCase());
                  setWordGuessInput('');
                }}
                disabled={!wordGuessInput.trim()}
                className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded transition-colors"
              >
                Submit Guess
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bot word guess overlay */}
      {ui.wordGuessActive && ui.wordGuessActive.isBot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
          <div className="card w-full max-w-md text-center">
            <h2 className="text-xl font-bold mb-2">🎯 Word Guess in Progress</h2>
            <p className="text-text-secondary mb-4">
              {ui.wordGuessActive.guessingPlayerName} is guessing {ui.wordGuessActive.targetPlayerName}&rsquo;s word...
            </p>
            <div className="text-3xl font-mono font-bold text-purple-400">
              {(wordGuessRemaining ?? 0) > 0 ? `${Math.ceil((wordGuessRemaining ?? 0) / 1000)}s` : '...'}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-secondary-bg rounded-xl p-4 mb-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">
              <span className="text-yellow-400">P</span>
              <span className="text-blue-400">R</span>
              <span className="text-green-400">O</span>
              <span className="text-red-400">B</span>
              <span className="text-purple-400">E</span>
            </h1>
            <p className="text-sm text-text-muted">Game: {game.roomCode}</p>
          </div>

          {timeRemaining !== null && (
            <div className="text-center">
              <p className="text-sm text-text-muted">Time Left</p>
              <p className={`text-3xl font-mono font-bold ${getTimerColor()}`}>{formatTime(timeRemaining)}</p>
            </div>
          )}

          <div className="text-right">
            <p className="text-sm text-text-muted">Round {game.roundNumber}</p>
            <p className="text-lg font-semibold">{myTurn ? 'Your Turn' : 'Waiting...'}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-end gap-2 mb-4">
          <button onClick={handleLeave} className="px-4 py-2 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 text-sm font-semibold">
            🚪 Abandon
          </button>
          <button onClick={handleEndGame} className="px-4 py-2 bg-orange-600/20 text-orange-400 rounded hover:bg-orange-600/30 text-sm font-semibold">
            🛑 End Game
          </button>
        </div>

        {/* Warnings (LLM fallback notices) */}
        {Object.keys(ui.warnings).length > 0 && (
          <div className="mb-4 space-y-1">
            {Object.entries(ui.warnings).map(([botId, msg]) => (
              <p key={botId} className="text-xs text-warning bg-warning/10 border border-warning/30 rounded px-3 py-1">
                ⚠️ {game.players.find(p => p.userId === botId)?.displayName}: {msg}
              </p>
            ))}
          </div>
        )}

        {/* Player boards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {[...game.players]
            .sort((a, b) => a.turnOrder - b.turnOrder)
            .map(player => {
              const isMe = player.userId === humanId;
              const isTarget = selectedTarget === player.userId;
              const isActive = game.currentTurnPlayerId === player.userId;
              const isThinking = ui.botThinkingId === player.userId;
              const botConfig = ui.botThinkingId === player.userId ? ui.botThinkingText : null;

              return (
                <div
                  key={player.userId}
                  onClick={() => !isMe && !player.isEliminated && myTurn && setSelectedTarget(player.userId)}
                  className={`card cursor-pointer transition-all ${isTarget ? 'ring-4 ring-warning' : ''} ${
                    isActive && !isTarget ? 'ring-2 ring-green-500' : ''
                  } ${player.isEliminated ? 'opacity-50' : ''}`}
                >
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <p className="font-bold">
                        {player.displayName} {isMe && '(You)'} {player.isBot && '🤖'}
                      </p>
                      {player.isEliminated && <span className="text-xs text-player-eliminated">Eliminated</span>}
                      {isThinking && (
                        <span className="text-xs text-accent animate-pulse ml-2">💭 {botConfig}</span>
                      )}
                      {isMe && player.mySecretWord && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setShowMyWord(!showMyWord);
                          }}
                          className="text-xs text-accent hover:text-accent/80 underline ml-2"
                        >
                          {showMyWord ? 'Hide' : 'Show'} my word
                        </button>
                      )}
                    </div>
                    <p className="text-2xl font-bold text-accent">{player.totalScore}</p>
                  </div>

                  {isMe && showMyWord && player.mySecretWord && (
                    <div className="mb-3 p-2 bg-accent/20 rounded text-center">
                      <span className="text-sm text-text-muted">Your word: </span>
                      <span className="font-bold text-accent tracking-wider">{player.mySecretWord}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {player.revealedPositions.map((letter, i) => {
                      const isBlank = letter === 'BLANK';
                      const pointValues = [5, 10, 15];
                      const pointValue = pointValues[i % 3];
                      return (
                        <div key={i} className="flex flex-col items-center">
                          <div
                            className={
                              letter
                                ? isBlank
                                  ? 'letter-tile-revealed bg-gray-600 text-gray-400'
                                  : 'letter-tile-revealed'
                                : 'letter-tile-concealed'
                            }
                          >
                            {letter ? (isBlank ? '\u2022' : letter) : '?'}
                          </div>
                          {!letter && <span className="text-xs text-text-muted mt-0.5">{pointValue}</span>}
                        </div>
                      );
                    })}
                  </div>

                  {player.missedLetters.length > 0 && (
                    <div className="mt-2 text-sm">
                      <span className="text-red-400">Missed: </span>
                      <span className="text-red-300 font-mono">{[...player.missedLetters].sort().join(', ')}</span>
                    </div>
                  )}

                  {!isMe && !player.isEliminated && !ui.wordGuessActive && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        controller.initiateWordGuess(player.userId);
                      }}
                      className="mt-3 w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded transition-colors text-sm"
                    >
                      🎯 Guess Word!
                    </button>
                  )}
                </div>
              );
            })}
        </div>

        {/* Letter selector */}
        {myTurn && (
          <div className="card">
            <p className="text-center mb-3 font-semibold">
              {selectedTarget ? 'Select a letter to guess' : 'Select a player first'}
            </p>
            <div className="grid grid-cols-9 md:grid-cols-13 gap-2">
              {alphabet.map(letter => (
                <button
                  key={letter}
                  onClick={() => handleLetterGuess(letter)}
                  disabled={!selectedTarget}
                  className="aspect-square bg-secondary-bg hover:bg-accent text-white font-bold rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {letter}
                </button>
              ))}
              <button
                onClick={() => handleLetterGuess('BLANK')}
                disabled={!selectedTarget}
                className="col-span-2 aspect-[2/1] bg-gray-600 hover:bg-gray-500 text-gray-300 font-bold rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm"
              >
                BLANK
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 bg-error/20 border border-error text-error px-4 py-3 rounded">{error}</div>
        )}
      </div>
    </div>
  );
}
