interface AlphabetSelectorProps {
  onLetterSelect: (letter: string) => void;
  disabled: boolean;
  usedLetters?: Set<string>;
}

export default function AlphabetSelector({
  onLetterSelect,
  disabled,
  usedLetters = new Set(),
}: AlphabetSelectorProps) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  // Letter values for display
  const letterValues: { [key: string]: number } = {
    E: 1, A: 1, I: 1, O: 1, N: 1, R: 1, T: 1, L: 1, S: 1, U: 1,
    D: 2, G: 2,
    B: 3, C: 3, M: 3, P: 3,
    F: 4, H: 4, V: 4, W: 4, Y: 4,
    K: 5,
    J: 8, X: 8,
    Q: 10, Z: 10,
  };

  return (
    <div className="space-y-3">
      <p className="text-center font-semibold text-lg">
        {disabled ? 'Wait for your turn...' : 'Select a letter to guess'}
      </p>
      
      <div className="grid grid-cols-7 md:grid-cols-13 gap-2">
        {alphabet.map((letter) => {
          const isUsed = usedLetters.has(letter);
          const value = letterValues[letter] || 1;
          
          return (
            <button
              key={letter}
              onClick={() => onLetterSelect(letter)}
              disabled={disabled || isUsed}
              className={`
                aspect-square relative
                flex flex-col items-center justify-center
                font-bold rounded-lg transition-all
                ${isUsed 
                  ? 'bg-tile-concealed text-text-muted cursor-not-allowed' 
                  : 'bg-secondary-bg hover:bg-accent text-white hover:scale-110'
                }
                disabled:opacity-30 disabled:cursor-not-allowed
                ${!disabled && !isUsed ? 'hover:shadow-lg' : ''}
              `}
            >
              <span className="text-lg md:text-2xl">{letter}</span>
              <span className="text-xs absolute bottom-1 right-1 text-warning">
                {value}
              </span>
            </button>
          );
        })}
      </div>

      <div className="text-sm text-text-muted text-center">
        Numbers show point values for each letter
      </div>
    </div>
  );
}
