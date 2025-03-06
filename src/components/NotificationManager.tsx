import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { Notification, NotificationType, NotificationAction } from './Notification';
import './Notification.css';

interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
  actions?: NotificationAction[];
}

type NotificationState = NotificationItem[];

type NotificationDispatchAction = 
  | { type: 'ADD_NOTIFICATION'; payload: NotificationItem }
  | { type: 'REMOVE_NOTIFICATION'; payload: string };

const NotificationContext = createContext<{
  notifications: NotificationState;
  addNotification: (notification: Omit<NotificationItem, 'id'>) => void;
  removeNotification: (id: string) => void;
} | null>(null);

function notificationReducer(state: NotificationState, action: NotificationDispatchAction): NotificationState {
  switch (action.type) {
    case 'ADD_NOTIFICATION':
      return [...state, action.payload];
    case 'REMOVE_NOTIFICATION':
      return state.filter(notification => notification.id !== action.payload);
    default:
      return state;
  }
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, dispatch] = useReducer(notificationReducer, []);

  const addNotification = useCallback((notification: Omit<NotificationItem, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    dispatch({
      type: 'ADD_NOTIFICATION',
      payload: { ...notification, id }
    });
  }, []);

  const removeNotification = useCallback((id: string) => {
    dispatch({
      type: 'REMOVE_NOTIFICATION',
      payload: id
    });
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification }}>
      {children}
      <div className="notification-container">
        {notifications.map(notification => (
          <Notification
            key={notification.id}
            type={notification.type}
            message={notification.message}
            duration={notification.duration}
            actions={notification.actions}
            onClose={() => removeNotification(notification.id)}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}

// Helper functions for common notifications
export function useErrorNotification() {
  const { addNotification } = useNotification();

  return useCallback((error: Error | string, retryAction?: () => void) => {
    const message = typeof error === 'string' ? error : error.message;
    const actions: NotificationAction[] | undefined = retryAction 
      ? [{ label: 'Retry', onClick: retryAction }] 
      : undefined;

    addNotification({
      type: 'error',
      message,
      duration: actions ? undefined : 5000,  // Persist if there are actions
      actions
    });
  }, [addNotification]);
}

export function useSuccessNotification() {
  const { addNotification } = useNotification();

  return useCallback((message: string) => {
    addNotification({
      type: 'success',
      message,
      duration: 3000
    });
  }, [addNotification]);
}

export function useWarningNotification() {
  const { addNotification } = useNotification();

  return useCallback((message: string, actions?: NotificationAction[]) => {
    addNotification({
      type: 'warning',
      message,
      duration: actions ? undefined : 5000,  // Persist if there are actions
      actions
    });
  }, [addNotification]);
}

export function useInfoNotification() {
  const { addNotification } = useNotification();

  return useCallback((message: string) => {
    addNotification({
      type: 'info',
      message,
      duration: 3000
    });
  }, [addNotification]);
} 