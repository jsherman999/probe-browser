import { useState } from 'react';
import { Link } from 'react-router-dom';
import { loadHistory } from '../services/LocalGameController';

export default function History() {
  const [entries, setEntries] = useState(loadHistory());

  const clearAll = () => {
    if (!confirm('Delete all game history stored in this browser?')) return;
    localStorage.removeItem('probe_history');
    setEntries([]);
  };

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold">📜 Game History</h1>
          <Link to="/" className="btn-secondary text-sm">
            ← Back
          </Link>
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Completed Games ({entries.length})</h2>
            {entries.length > 0 && (
              <button onClick={clearAll} className="text-xs px-2 py-1 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition-colors">
                🧹 Clear All
              </button>
            )}
          </div>

          {entries.length === 0 ? (
            <p className="text-text-muted text-center py-8">No completed games yet. Go play one! 🎮</p>
          ) : (
            <div className="space-y-2">
              {entries.map(entry => {
                const winner = [...entry.players].sort((a, b) => a.placement - b.placement)[0];
                return (
                  <Link
                    key={entry.id}
                    to={`/history/${entry.id}`}
                    className="flex items-center justify-between p-3 bg-primary-bg rounded-lg hover:bg-tile-bg transition-colors"
                  >
                    <div>
                      <div className="font-semibold">
                        {entry.players.map(p => `${p.playerName}${p.isBot ? ' 🤖' : ''}`).join(' vs ')}
                      </div>
                      <div className="text-sm text-text-muted">
                        {new Date(entry.completedAt).toLocaleString()} · Room {entry.roomCode} ·{' '}
                        {entry.turns.length} turns
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-accent font-semibold">🏆 {winner?.playerName}</div>
                      <div className="text-xs text-text-muted">{winner?.finalScore} pts</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
