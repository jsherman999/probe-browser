interface GameResult {
  playerId: string;
  playerName: string;
  finalScore: number;
  placement: number;
}

interface GameOverModalProps {
  isOpen: boolean;
  results: GameResult[];
  onClose: () => void;
  onPlayAgain: () => void;
}

export default function GameOverModal({
  isOpen,
  results,
  onClose,
  onPlayAgain,
}: GameOverModalProps) {
  if (!isOpen) return null;

  const sortedResults = [...results].sort((a, b) => a.placement - b.placement);
  const winner = sortedResults[0];

  const medals = ['🥇', '🥈', '🥉', '4️⃣'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="card w-full max-w-2xl animate-[scaleIn_0.3s_ease-out]">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold mb-2">Game Over!</h1>
          <p className="text-2xl text-accent">
            {winner.playerName} wins!
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {sortedResults.map((result, index) => (
            <div
              key={result.playerId}
              className={`
                flex items-center justify-between p-4 rounded-lg
                ${index === 0 ? 'bg-accent/20 border-2 border-accent' : 'bg-primary-bg'}
              `}
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl">{medals[index]}</span>
                <div>
                  <p className="font-bold text-lg">{result.playerName}</p>
                  <p className="text-sm text-text-muted">
                    {index === 0 ? 'Winner' : `${result.placement}${
                      result.placement === 2 ? 'nd' :
                      result.placement === 3 ? 'rd' : 'th'
                    } Place`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-accent">{result.finalScore}</p>
                <p className="text-sm text-text-muted">points</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={onPlayAgain} className="btn-primary flex-1">
            Play Again
          </button>
          <button onClick={onClose} className="btn-secondary flex-1">
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
