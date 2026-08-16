import { useEffect, useState } from 'react';

interface CountdownTimerProps {
  seconds: number;
  onComplete: () => void;
  label?: string;
}

const CountdownTimer = ({ seconds, onComplete, label = 'Time remaining' }: CountdownTimerProps) => {
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
    if (timeLeft <= 0) {
      onComplete();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, onComplete]);

  const percentage = (timeLeft / seconds) * 100;
  const isUrgent = timeLeft <= 10;

  return (
    <div className="space-y-2" role="timer" aria-live="polite" aria-atomic="true">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-400">{label}</span>
        <span 
          className={`text-lg font-bold ${isUrgent ? 'text-red-500 animate-pulse' : 'text-accent'}`}
          aria-label={`${timeLeft} seconds remaining`}
        >
          {timeLeft}s
        </span>
      </div>
      
      <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 rounded-full ${
            isUrgent ? 'bg-red-500' : 'bg-accent'
          }`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={timeLeft}
          aria-valuemin={0}
          aria-valuemax={seconds}
        />
      </div>
    </div>
  );
};

export default CountdownTimer;
