import './notifications.css';

export type NotificationType = 'error' | 'warning' | 'success' | 'info';

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export interface NotificationOptions {
  type: NotificationType;
  message: string;
  duration?: number;  // Duration in ms, undefined for persistent
  actions?: NotificationAction[];
}

interface NotificationItem extends NotificationOptions {
  id: string;
  element: HTMLElement;
  timer?: number;
}

class NotificationManager {
  private static instance: NotificationManager;
  private container: HTMLElement;
  private notifications: Map<string, NotificationItem>;

  private constructor() {
    this.container = document.createElement('div');
    this.container.className = 'vb-notification-container';
    document.body.appendChild(this.container);
    this.notifications = new Map();
  }

  public static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  public show(options: NotificationOptions): string {
    const id = Math.random().toString(36).substr(2, 9);
    const element = this.createNotificationElement(id, options);
    
    this.container.appendChild(element);
    
    const notification: NotificationItem = {
      ...options,
      id,
      element
    };

    if (options.duration) {
      notification.timer = window.setTimeout(() => {
        this.remove(id);
      }, options.duration);
    }

    this.notifications.set(id, notification);
    return id;
  }

  public remove(id: string): void {
    const notification = this.notifications.get(id);
    if (!notification) return;

    // Clear any existing timer
    if (notification.timer) {
      clearTimeout(notification.timer);
    }

    // Add removal animation
    notification.element.classList.add('vb-notification-removing');

    // Remove after animation
    setTimeout(() => {
      notification.element.remove();
      this.notifications.delete(id);
    }, 200);
  }

  private createNotificationElement(id: string, options: NotificationOptions): HTMLElement {
    const notification = document.createElement('div');
    notification.className = `vb-notification vb-notification-${options.type}`;

    // Create icon
    const icon = document.createElement('div');
    icon.className = 'vb-notification-icon';
    icon.textContent = this.getIconForType(options.type);
    notification.appendChild(icon);

    // Create content container
    const content = document.createElement('div');
    content.className = 'vb-notification-content';

    // Add message
    const message = document.createElement('div');
    message.className = 'vb-notification-message';
    message.textContent = options.message;
    content.appendChild(message);

    // Add actions if any
    if (options.actions && options.actions.length > 0) {
      const actions = document.createElement('div');
      actions.className = 'vb-notification-actions';
      
      options.actions.forEach(action => {
        const button = document.createElement('button');
        button.className = 'vb-notification-action';
        button.textContent = action.label;
        button.onclick = action.onClick;
        actions.appendChild(button);
      });
      
      content.appendChild(actions);
    }

    notification.appendChild(content);

    // Add close button if no duration (persistent)
    if (!options.duration) {
      const close = document.createElement('button');
      close.className = 'vb-notification-close';
      close.textContent = '×';
      close.onclick = () => this.remove(id);
      notification.appendChild(close);
    }

    return notification;
  }

  private getIconForType(type: NotificationType): string {
    switch (type) {
      case 'error': return '⚠️';
      case 'warning': return '⚡';
      case 'success': return '✓';
      case 'info': return 'ℹ️';
    }
  }

  public destroy(): void {
    // Clear all notifications
    this.notifications.forEach((notification) => {
      if (notification.timer) {
        clearTimeout(notification.timer);
      }
    });
    this.notifications.clear();

    // Remove container
    this.container.remove();
  }
}

// Helper functions for common notifications
export function showError(message: string, retryAction?: () => void): string {
  const options: NotificationOptions = {
    type: 'error',
    message,
    duration: retryAction ? undefined : 5000,
    actions: retryAction ? [{ label: 'Retry', onClick: retryAction }] : undefined
  };
  return NotificationManager.getInstance().show(options);
}

export function showSuccess(message: string): string {
  return NotificationManager.getInstance().show({
    type: 'success',
    message,
    duration: 3000
  });
}

export function showWarning(message: string, actions?: NotificationAction[]): string {
  return NotificationManager.getInstance().show({
    type: 'warning',
    message,
    duration: actions ? undefined : 5000,
    actions
  });
}

export function showInfo(message: string): string {
  return NotificationManager.getInstance().show({
    type: 'info',
    message,
    duration: 3000
  });
}

export function removeNotification(id: string): void {
  NotificationManager.getInstance().remove(id);
}

export function destroyNotifications(): void {
  NotificationManager.getInstance().destroy();
} 