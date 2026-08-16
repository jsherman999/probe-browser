import { useEffect } from 'react';

interface NotificationProps {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  onClose: () => void;
}

export default function Notification({
  message,
  type,
  duration = 3000,
  onClose,
}: NotificationProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const typeClasses = {
    success: 'bg-success/20 border-success text-success',
    error: 'bg-error/20 border-error text-error',
    info: 'bg-accent/20 border-accent text-accent',
    warning: 'bg-warning/20 border-warning text-warning',
  };

  const icons = {
    success: '✓',
    error: '✗',
    info: 'ℹ',
    warning: '⚠',
  };

  return (
    <div
      className={`
        fixed top-4 right-4 z-50
        px-6 py-4 rounded-lg border-2 shadow-lg
        flex items-center gap-3
        animate-[slideInRight_0.3s_ease-out]
        ${typeClasses[type]}
      `}
    >
      <span className="text-2xl">{icons[type]}</span>
      <p className="font-medium">{message}</p>
      <button
        onClick={onClose}
        className="ml-4 text-xl hover:opacity-70 transition-opacity"
      >
        ×
      </button>
    </div>
  );
}

interface NotificationContainerProps {
  notifications: Array<{
    id: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  }>;
  onRemove: (id: string) => void;
}

export function NotificationContainer({
  notifications,
  onRemove,
}: NotificationContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map((notification) => (
        <Notification
          key={notification.id}
          message={notification.message}
          type={notification.type}
          onClose={() => onRemove(notification.id)}
        />
      ))}
    </div>
  );
}
