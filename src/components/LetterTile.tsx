interface LetterTileProps {
  letter: string | null;
  revealed: boolean;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
}

export default function LetterTile({
  letter,
  revealed,
  size = 'md',
  animate = false,
}: LetterTileProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-lg',
    md: 'w-10 h-10 md:w-14 md:h-14 text-xl md:text-2xl',
    lg: 'w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20 text-2xl md:text-3xl lg:text-4xl',
  };

  return (
    <div
      className={`
        ${sizeClasses[size]}
        flex items-center justify-center
        font-bold border-2 rounded transition-all duration-200
        ${revealed 
          ? 'bg-tile-revealed border-tile-border text-primary-bg' 
          : 'bg-tile-concealed border-tile-border text-transparent'
        }
        ${animate ? 'animate-flip' : ''}
      `}
    >
      {revealed && letter ? letter : ''}
    </div>
  );
}
