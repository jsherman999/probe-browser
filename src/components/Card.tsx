import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export default function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-secondary-bg rounded-xl p-6 shadow-lg ${className}`}
    >
      {children}
    </div>
  );
}
