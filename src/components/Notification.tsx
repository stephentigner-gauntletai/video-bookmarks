import React, { useEffect } from 'react';

export type NotificationType = 'error' | 'warning' | 'success' | 'info';

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export interface NotificationProps {
  type: NotificationType;
  message: string;
  duration?: number;  // Duration in ms, undefined for persistent
  actions?: NotificationAction[];
  onClose?: () => void;
}

export const Notification: React.FC<NotificationProps> = ({
  type,
  message,
  duration,
  actions = [],
  onClose
}) => {
  useEffect(() => {
    if (duration && onClose) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  return (
    <div className={`notification notification-${type}`}>
      <div className="notification-content">
        <div className="notification-icon">
          {type === 'error' && '⚠️'}
          {type === 'warning' && '⚡'}
          {type === 'success' && '✓'}
          {type === 'info' && 'ℹ️'}
        </div>
        <div className="notification-message">{message}</div>
        {actions.length > 0 && (
          <div className="notification-actions">
            {actions.map((action, index) => (
              <button
                key={index}
                className="notification-action"
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        {onClose && (
          <button className="notification-close" onClick={onClose}>
            ×
          </button>
        )}
      </div>
    </div>
  );
}; 