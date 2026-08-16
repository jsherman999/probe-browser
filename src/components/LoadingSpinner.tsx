interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

export default function LoadingSpinner({ size = 'md', message }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className={`${sizeClasses[size]} relative`}>
        <div className="absolute inset-0 border-4 border-tile-border rounded-full"></div>
        <div className="absolute inset-0 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
      {message && (
        <p className="mt-4 text-text-secondary text-center">{message}</p>
      )}
    </div>
  );
}
