import { useParams, Link } from 'react-router-dom';
import { loadHistory } from '../services/LocalGameController';

export default function HistoryDetail() {
  const { id } = useParams<{ id: string }>();
  const entry = loadHistory().find(e => e.id === id);

  if (!entry) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card text-center">
          <h1 className="text-2xl font-bold mb-4">Game not found</h1>
          <Link to="/history" className="text-accent hover:underline">
            ← Back to History
          </Link>
        </div>
      </div>
    );
  }

  const sorted = [...entry.players].sort((a, b) => a.placement - b.placement);

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Game Details</h1>
          <Link to="/history" className="btn-secondary text-sm">
            ← Back
          </Link>
        </div>

        <div className="card">
          <p className="text-sm text-text-muted mb-4">
            Room {entry.roomCode} · Completed {new Date(entry.completedAt).toLocaleString()}
          </p>
          <div className="space-y-2">
            {sorted.map((p, i) => (
              <div
                key={p.playerId}
                className={`flex justify-between items-center p-3 rounded ${
                  i === 0 ? 'bg-accent/20 border border-accent' : 'bg-primary-bg'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${i === 0 ? 'bg-accent text-white' : 'bg-secondary-bg'}`}>
                    {i + 1}
                  </span>
                  <div>
                    <span className="font-semibold">
                      {p.playerName} {p.isBot && '🤖'}
                    </span>
                    {p.secretWord && (
                      <div className="text-xs text-text-muted">
                        word: <span className="font-mono text-accent">{p.secretWord}</span>
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-xl font-bold">{p.finalScore} pts</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold mb-4">Turn Log ({entry.turns.length})</h2>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {entry.turns.map(turn => (
              <div
                key={turn.turnNumber}
                className={`flex items-center justify-between px-3 py-1.5 rounded text-sm ${
                  turn.isCorrect ? 'bg-green-600/10' : 'bg-red-600/10'
                }`}
              >
                <div>
                  <span className="text-text-muted">#{turn.turnNumber}</span>{' '}
                  <span className="font-semibold">{turn.playerName}</span>
                  <span className="text-text-muted"> → </span>
                  <span className="font-semibold">{turn.targetName}</span>
                  <span className="text-text-muted">: </span>
                  <span className="font-mono">
                    {turn.guessedLetter.startsWith('WORD:') ? `"${turn.guessedLetter.slice(5)}"` : turn.guessedLetter}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={turn.isCorrect ? 'text-green-400' : 'text-red-400'}>
                    {turn.isCorrect ? '✓' : '✗'}
                  </span>
                  <span className="font-bold w-12 text-right">
                    {turn.pointsScored > 0 ? `+${turn.pointsScored}` : turn.pointsScored}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
