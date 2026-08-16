interface PlayerBoardProps {
  playerName: string;
  score: number;
  word: (string | null)[];
  isActive: boolean;
  isTarget: boolean;
  isEliminated: boolean;
  isCurrentUser: boolean;
  onClick?: () => void;
}

export default function PlayerBoard({
  playerName,
  score,
  word,
  isActive,
  isTarget,
  isEliminated,
  isCurrentUser,
  onClick,
}: PlayerBoardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        card transition-all cursor-pointer
        ${isTarget ? 'ring-4 ring-warning shadow-xl' : ''}
        ${isActive ? 'ring-2 ring-player-active' : ''}
        ${isEliminated ? 'opacity-50' : ''}
        ${onClick && !isEliminated ? 'hover:ring-2 hover:ring-accent' : ''}
      `}
    >
      <div className="flex justify-between items-center mb-3">
        <div>
          <p className="font-bold text-lg">
            {playerName} {isCurrentUser && '(You)'}
          </p>
          {isEliminated && (
            <span className="text-xs text-player-eliminated">Eliminated</span>
          )}
          {isActive && !isEliminated && (
            <span className="text-xs text-player-active">• Active Turn</span>
          )}
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-accent">{score}</p>
          <p className="text-xs text-text-muted">points</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {word.map((letter, i) => (
          <div
            key={i}
            className={`
              w-10 h-10 md:w-12 md:h-12
              flex items-center justify-center
              text-xl md:text-2xl font-bold
              border-2 rounded transition-all
              ${letter 
                ? 'bg-tile-revealed border-tile-border text-primary-bg' 
                : 'bg-tile-concealed border-tile-border'
              }
            `}
          >
            {letter || ''}
          </div>
        ))}
      </div>
    </div>
  );
}
