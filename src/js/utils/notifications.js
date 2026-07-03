// Student Shift Scheduler PWA - Notification Manager
// Handles push notifications, browser notifications, and in-app notifications

class NotificationManager {
  constructor() {
    this.permission = Notification.permission;
    this.registration = null;
    this.subscription = null;
    
    this.init();
  }

  async init() {
    try {
      // Check if service worker is supported
      if ('serviceWorker' in navigator) {
        this.registration = await navigator.serviceWorker.ready;
      }
      
      // Request notification permission
      await this.requestPermission();
      
      // Setup push subscription if permission granted
      if (this.permission === 'granted') {
        await this.setupPushSubscription();
      }
      
      console.log('✅ Notification Manager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize notifications:', error);
    }
  }

  async requestPermission() {
    if (!('Notification' in window)) {
      console.log('❌ This browser does not support notifications');
      return false;
    }

    if (this.permission === 'granted') {
      return true;
    }

    if (this.permission === 'denied') {
      console.log('❌ Notification permission denied');
      return false;
    }

    try {
      this.permission = await Notification.requestPermission();
      return this.permission === 'granted';
    } catch (error) {
      console.error('❌ Failed to request notification permission:', error);
      return false;
    }
  }

  async setupPushSubscription() {
    try {
      if (!this.registration) {
        console.log('❌ Service worker not available for push notifications');
        return false;
      }

      // Check if push messaging is supported
      if (!('PushManager' in window)) {
        console.log('❌ Push messaging is not supported');
        return false;
      }

      // Get existing subscription
      this.subscription = await this.registration.pushManager.getSubscription();
      
      if (!this.subscription) {
        // Create new subscription
        this.subscription = await this.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(this.getVapidPublicKey())
        });
      }

      // Send subscription to server
      await this.sendSubscriptionToServer(this.subscription);
      
      console.log('✅ Push subscription setup complete');
      return true;
    } catch (error) {
      console.error('❌ Failed to setup push subscription:', error);
      return false;
    }
  }

  async sendSubscriptionToServer(subscription) {
    try {
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription)
      });

      if (!response.ok) {
        throw new Error('Failed to send subscription to server');
      }

      console.log('✅ Subscription sent to server');
    } catch (error) {
      console.error('❌ Failed to send subscription to server:', error);
    }
  }

  getVapidPublicKey() {
    // This would typically come from environment variables
    return 'BEl62iUYgUivxIkv69yViEuiBIa40HI8vW8uWZt1I2LtQSWU9XuyQ3SAdlkicgSu0HdwQzYhb45Rpqp8ycHMuM';
  }

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Browser notifications
  async showNotification(title, options = {}) {
    if (this.permission !== 'granted') {
      console.log('❌ Notification permission not granted');
      return false;
    }

    try {
      const notification = new Notification(title, {
        icon: '/assets/icons/icon-192x192.png',
        badge: '/assets/icons/icon-72x72.png',
        tag: options.tag || 'default',
        requireInteraction: options.requireInteraction || false,
        silent: options.silent || false,
        ...options
      });

      // Handle notification click
      notification.onclick = () => {
        window.focus();
        notification.close();
        
        if (options.onClick) {
          options.onClick();
        }
      };

      // Auto close after 5 seconds unless requireInteraction is true
      if (!options.requireInteraction) {
        setTimeout(() => {
          notification.close();
        }, 5000);
      }

      return notification;
    } catch (error) {
      console.error('❌ Failed to show notification:', error);
      return false;
    }
  }

  // In-app notifications
  showInAppNotification(type, title, message, options = {}) {
    const notification = {
      id: Date.now(),
      type,
      title,
      message,
      timestamp: new Date(),
      read: false,
      ...options
    };

    // Store in local storage
    this.storeNotification(notification);

    // Emit custom event
    window.dispatchEvent(new CustomEvent('notificationReceived', { 
      detail: notification 
    }));

    // Show toast notification
    if (window.app) {
      window.app.showToast(message, type);
    }

    return notification;
  }

  storeNotification(notification) {
    try {
      const notifications = this.getStoredNotifications();
      notifications.unshift(notification);
      
      // Keep only last 100 notifications
      if (notifications.length > 100) {
        notifications.splice(100);
      }
      
      localStorage.setItem('notifications', JSON.stringify(notifications));
    } catch (error) {
      console.error('❌ Failed to store notification:', error);
    }
  }

  getStoredNotifications() {
    try {
      const stored = localStorage.getItem('notifications');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('❌ Failed to get stored notifications:', error);
      return [];
    }
  }

  markNotificationAsRead(notificationId) {
    try {
      const notifications = this.getStoredNotifications();
      const notification = notifications.find(n => n.id === notificationId);
      
      if (notification) {
        notification.read = true;
        localStorage.setItem('notifications', JSON.stringify(notifications));
      }
    } catch (error) {
      console.error('❌ Failed to mark notification as read:', error);
    }
  }

  markAllNotificationsAsRead() {
    try {
      const notifications = this.getStoredNotifications();
      notifications.forEach(notification => {
        notification.read = true;
      });
      localStorage.setItem('notifications', JSON.stringify(notifications));
    } catch (error) {
      console.error('❌ Failed to mark all notifications as read:', error);
    }
  }

  clearAllNotifications() {
    try {
      localStorage.removeItem('notifications');
    } catch (error) {
      console.error('❌ Failed to clear notifications:', error);
    }
  }

  // Specific notification types
  async notifyScheduleUpdate(scheduleData) {
    const title = 'Schedule Updated';
    const message = `Schedule for ${scheduleData.month}/${scheduleData.year} has been updated`;
    
    await this.showNotification(title, {
      body: message,
      tag: 'schedule-update',
      onClick: () => {
        if (window.app) {
          window.app.navigateToView('schedule');
        }
      }
    });

    this.showInAppNotification('info', title, message, {
      category: 'schedule',
      data: scheduleData
    });
  }

  async notifySwapRequest(swapData) {
    const title = 'New Swap Request';
    const message = `${swapData.requesterName} wants to swap shifts`;
    
    await this.showNotification(title, {
      body: message,
      tag: 'swap-request',
      requireInteraction: true,
      onClick: () => {
        if (window.app) {
          window.app.navigateToView('swaps');
        }
      }
    });

    this.showInAppNotification('info', title, message, {
      category: 'swap',
      data: swapData
    });
  }

  async notifySwapApproved(swapData) {
    const title = 'Swap Approved';
    const message = `Your swap request has been approved`;
    
    await this.showNotification(title, {
      body: message,
      tag: 'swap-approved',
      onClick: () => {
        if (window.app) {
          window.app.navigateToView('swaps');
        }
      }
    });

    this.showInAppNotification('success', title, message, {
      category: 'swap',
      data: swapData
    });
  }

  async notifySwapRejected(swapData) {
    const title = 'Swap Rejected';
    const message = `Your swap request has been rejected`;
    
    await this.showNotification(title, {
      body: message,
      tag: 'swap-rejected',
      onClick: () => {
        if (window.app) {
          window.app.navigateToView('swaps');
        }
      }
    });

    this.showInAppNotification('error', title, message, {
      category: 'swap',
      data: swapData
    });
  }

  async notifyShiftReminder(shiftData) {
    const title = 'Shift Reminder';
    const message = `Your shift starts in 30 minutes: ${shiftData.start} - ${shiftData.end}`;
    
    await this.showNotification(title, {
      body: message,
      tag: 'shift-reminder',
      requireInteraction: true,
      onClick: () => {
        if (window.app) {
          window.app.navigateToView('schedule');
        }
      }
    });

    this.showInAppNotification('warning', title, message, {
      category: 'shift',
      data: shiftData
    });
  }

  async notifySystemMessage(title, message, type = 'info') {
    await this.showNotification(title, {
      body: message,
      tag: 'system-message'
    });

    this.showInAppNotification(type, title, message, {
      category: 'system'
    });
  }

  // Notification preferences
  async updateNotificationPreferences(preferences) {
    try {
      localStorage.setItem('notificationPreferences', JSON.stringify(preferences));
      
      // Update server preferences
      if (window.app && window.app.api) {
        await window.app.api.post('/notifications/preferences', preferences);
      }
    } catch (error) {
      console.error('❌ Failed to update notification preferences:', error);
    }
  }

  getNotificationPreferences() {
    try {
      const stored = localStorage.getItem('notificationPreferences');
      return stored ? JSON.parse(stored) : {
        scheduleUpdates: true,
        swapRequests: true,
        swapApprovals: true,
        shiftReminders: true,
        systemMessages: true,
        emailNotifications: false,
        smsNotifications: false
      };
    } catch (error) {
      console.error('❌ Failed to get notification preferences:', error);
      return {};
    }
  }

  // Schedule reminder
  scheduleReminder(shiftData, minutesBefore = 30) {
    const reminderTime = new Date(shiftData.startTime);
    reminderTime.setMinutes(reminderTime.getMinutes() - minutesBefore);
    
    const now = new Date();
    const delay = reminderTime.getTime() - now.getTime();
    
    if (delay > 0) {
      setTimeout(() => {
        this.notifyShiftReminder(shiftData);
      }, delay);
      
      console.log(`⏰ Reminder scheduled for ${reminderTime.toLocaleString()}`);
    }
  }

  // Cancel all scheduled reminders
  cancelAllReminders() {
    // This would typically use a more sophisticated scheduling system
    // For now, we'll just log the action
    console.log('⏰ All reminders cancelled');
  }
}

// Make NotificationManager available globally
window.NotificationManager = NotificationManager;
