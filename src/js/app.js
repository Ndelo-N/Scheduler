// Student Shift Scheduler PWA - Main Application
// Version 1.0.0

class ShiftSchedulerApp {
  constructor() {
    this.currentView = 'dashboard';
    this.isOnline = navigator.onLine;
    this.deferredPrompt = null;
    this.serviceWorker = null;
    
    this.init();
  }

  async init() {
    console.log('🚀 Initializing Student Shift Scheduler PWA...');
    
    try {
      this.showLoadingScreen();
      
      await this.initServiceWorker();
      await this.initComponents();

      const authRequired = await this.detectAuthRequired();
      if (authRequired) {
        this.hideLoadingScreen();
        await this.runAuthGate();
        return;
      }

      await this.bootApp();
      
    } catch (error) {
      console.error('❌ Failed to initialize app:', error);
      this.showError('Failed to initialize application');
    }
  }

  /** True when served from the Rev1 auth server (same-origin /api/health). */
  async detectAuthRequired() {
    const cfg = window.APP_CONFIG || {};
    if (cfg.requireAuth === true) return true;
    if (cfg.requireAuth === false) return false;
    try {
      const api = this.api || new APIClient();
      const health = await api.get('/health', { skipAuthHandler: true, timeout: 3000 });
      return health && health.status === 'ok';
    } catch {
      return false;
    }
  }

  async runAuthGate() {
    const mountEl = document.getElementById('auth-gate');
    const appEl = document.getElementById('app');
    if (!mountEl) {
      await this.bootApp();
      return;
    }
    this.authGate = new AuthGate({
      api: this.api,
      mountEl,
      appEl,
      onReady: (user) => {
        this.currentUser = user;
        this.bootApp(user);
      }
    });
    await this.authGate.boot();
  }

  async bootApp(user) {
    try {
      if (user) this.currentUser = user;
      this.access = new AccessControl(this);
      await this.access.load();
      if (this.currentUser?.role && typeof normalizeRole === 'function') {
        this.currentUser.role = normalizeRole(this.currentUser.role);
      }
      this.setupEventListeners();
      this.updateUserMenu();
      await this.initViews();
      await this.applyAccessControl();
      this.showAssessmentReminders();
      this.hideLoadingScreen();
      const appEl = document.getElementById('app');
      if (appEl) appEl.style.display = 'block';
      console.log('✅ App initialized successfully');
    } catch (error) {
      console.error('❌ Failed to boot app:', error);
      this.showError('Failed to initialize application');
    }
  }

  /** @param {string} featureId */
  can(featureId) {
    return this.access ? this.access.can(featureId) : true;
  }

  async applyAccessControl() {
    if (!this.access) return;
    this.access.applyNavigation();
    if (!this.access.canAccessView(this.currentView)) {
      this.currentView = this.access.getDefaultView();
      await this.navigateToView(this.currentView);
      return;
    }
    if (this.views[this.currentView]) {
      await this.views[this.currentView].init();
    }
    this.access.applyVisibility(document);
  }

  showLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    const app = document.getElementById('app');
    
    if (loadingScreen) loadingScreen.style.display = 'flex';
    if (app) app.style.display = 'none';
  }

  hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    const app = document.getElementById('app');
    
    if (loadingScreen) loadingScreen.style.display = 'none';
    if (app) app.style.display = 'block';
  }

  async initServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('./sw.js');
        this.serviceWorker = registration;
        
        console.log('✅ Service Worker registered:', registration);
        
        // Handle updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              this.showUpdateNotification();
            }
          });
        });
        
      } catch (error) {
        console.error('❌ Service Worker registration failed:', error);
      }
    }
  }

  async initComponents() {
    // Initialize storage (wait for IndexedDB)
    this.storage = new StorageManager();
    await this.storage.initPromise;

    // Central application state
    this.state = new AppStateManager(this.storage);
    await this.state.load();

    // Initialize API client
    this.api = new APIClient();
    
    // Initialize notifications
    this.notifications = new NotificationManager();
    
    // Check for PWA install prompt
    this.setupInstallPrompt();
  }

  setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        this.navigateToView(view).catch(err => {
          console.error('Failed to navigate:', err);
        });
      });
    });

    // Install button
    const installBtn = document.getElementById('install-btn');
    if (installBtn) {
      installBtn.addEventListener('click', () => {
        this.installPWA();
      });
    }

    this.setupUserMenuListeners();

    // Online/offline status
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.hideOfflineIndicator();
      this.syncOfflineData();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.showOfflineIndicator();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      this.handleKeyboardShortcuts(e);
    });

    // Window events
    window.addEventListener('beforeunload', () => {
      this.saveAppState();
    });
  }

  setupUserMenuListeners() {
    if (this._userMenuBound) return;
    this._userMenuBound = true;

    const menuBtn = document.getElementById('user-menu-btn');
    const panel = document.getElementById('user-menu-panel');
    const logoutBtn = document.getElementById('user-logout-btn');

    panel?.addEventListener('click', (e) => e.stopPropagation());

    menuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleUserMenu();
    });

    logoutBtn?.addEventListener('click', () => {
      this.closeUserMenu();
      this.handleLogout();
    });

    document.addEventListener('click', () => this.closeUserMenu());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeUserMenu();
    });
  }

  updateUserMenu() {
    const menuBtn = document.getElementById('user-menu-btn');
    const panel = document.getElementById('user-menu-panel');
    const nameEl = document.getElementById('user-menu-name');
    const logoutBtn = document.getElementById('user-logout-btn');
    const avatarEl = document.getElementById('user-avatar-label');
    const signedIn = Boolean(this.currentUser && this.authGate);

    if (menuBtn) {
      menuBtn.style.display = signedIn ? '' : 'none';
      menuBtn.setAttribute('aria-expanded', 'false');
    }
    if (panel) panel.hidden = true;

    if (!signedIn) return;

    const user = this.currentUser;
    const displayName = user.name || user.uNumber || 'Signed in';
    const roleLabel = typeof normalizeRole === 'function'
      ? { student: 'Student', 'team-lead': 'Team-Lead', admin: 'Admin' }[normalizeRole(user.role)] || user.role
      : user.role;
    if (nameEl) nameEl.textContent = `${displayName} (${roleLabel})`;
    if (logoutBtn) logoutBtn.hidden = false;
    if (avatarEl) {
      const initials = this.userInitials(displayName);
      avatarEl.textContent = initials || '👤';
    }
  }

  userInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  toggleUserMenu() {
    const panel = document.getElementById('user-menu-panel');
    const menuBtn = document.getElementById('user-menu-btn');
    if (!panel || panel.hidden === false) {
      this.closeUserMenu();
      return;
    }
    panel.hidden = false;
    menuBtn?.setAttribute('aria-expanded', 'true');
  }

  closeUserMenu() {
    const panel = document.getElementById('user-menu-panel');
    const menuBtn = document.getElementById('user-menu-btn');
    if (panel) panel.hidden = true;
    menuBtn?.setAttribute('aria-expanded', 'false');
  }

  async handleLogout() {
    if (!this.authGate) return;
    try {
      await this.authGate.logout();
      this.currentUser = null;
      this.showToast('Signed out', 'info');
    } catch (err) {
      console.error('Logout failed:', err);
      this.showToast('Could not sign out', 'error');
    }
  }

  async initViews() {
    // Initialize view managers
    this.views = {
      dashboard: new DashboardView(this),
      schedule: new ScheduleView(this),
      swaps: new SwapsView(this),
      students: new StudentsView(this),
      analytics: new AnalyticsView(this),
      settings: new SettingsView(this)
    };

    this.dashboard = this.views.dashboard;
    this.schedule = this.views.schedule;
    this.swaps = this.views.swaps;
    this.students = this.views.students;
    this.analytics = this.views.analytics;
    this.settings = this.views.settings;

    // Load initial view
    await this.navigateToView(this.currentView);
  }

  async navigateToView(viewName) {
    if (this.access && !this.access.canAccessView(viewName)) {
      this.showToast('You do not have access to that section', 'error');
      viewName = this.access.getDefaultView();
    }

    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    
    const activeNavItem = document.querySelector(`[data-view="${viewName}"]`);
    if (activeNavItem) {
      activeNavItem.classList.add('active');
    }

    // Update views
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });

    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
      targetView.classList.add('active');
    }

    // Initialize view if needed
    if (this.views[viewName]) {
      await this.views[viewName].init();
    }

    this.currentView = viewName;
    if (this.access) this.access.applyVisibility(document);
    await this.saveAppState();
  }

  setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      
      const installBtn = document.getElementById('install-btn');
      if (installBtn) {
        installBtn.style.display = 'block';
      }
    });

    window.addEventListener('appinstalled', () => {
      console.log('✅ PWA installed successfully');
      this.showToast('App installed successfully!', 'success');
      
      const installBtn = document.getElementById('install-btn');
      if (installBtn) {
        installBtn.style.display = 'none';
      }
    });
  }

  async installPWA() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('✅ User accepted PWA install');
      } else {
        console.log('❌ User dismissed PWA install');
      }
      
      this.deferredPrompt = null;
    }
  }

  showOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
      indicator.style.display = 'flex';
    }
  }

  hideOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  async syncOfflineData() {
    try {
      // Sync any pending changes
      await this.storage.syncPendingChanges();
      this.showToast('Data synced successfully', 'success');
    } catch (error) {
      console.error('❌ Failed to sync offline data:', error);
      this.showToast('Failed to sync some data', 'warning');
    }
  }

  handleKeyboardShortcuts(e) {
    const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        this.loadSampleData();
        return;
      }

      if (!inInput) {
        const key = e.key.toLowerCase();
        if (key === 'r' && this.currentView === 'schedule') {
          e.preventDefault();
          this.schedule?.generateSchedule();
          return;
        }
        if (key === 'b' && this.currentView === 'schedule') {
          e.preventDefault();
          this.schedule?.rebalanceSchedule();
          return;
        }
        if (key === 't') {
          e.preventDefault();
          if (this.currentView === 'schedule') {
            this.schedule?.toggleThreeMonthView();
          } else {
            this.state.setThreeMonthView(!this.state.threeMonthView).then(() => {
              this.showToast(this.state.threeMonthView ? '3-month view enabled' : '3-month view disabled', 'info');
            });
          }
          return;
        }
        if (key === 'v' && this.currentView === 'schedule') {
          e.preventDefault();
          this.schedule?.validateSchedule();
          return;
        }
        if (key === 'p') {
          e.preventDefault();
          window.print();
          return;
        }
        if (key === 'e' && this.currentView === 'schedule') {
          e.preventDefault();
          this.schedule?.exportCSV();
          return;
        }
        if (key === 'i' && this.currentView === 'schedule') {
          e.preventDefault();
          this.schedule?.exportICS();
          return;
        }
        if (key === 's') {
          e.preventDefault();
          this.saveStateDownload();
          return;
        }
        if (key === 'o') {
          e.preventDefault();
          this.loadStateFromFile();
          return;
        }
      }
    }

    // Ctrl/Cmd + number keys for navigation
    if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '6') {
      e.preventDefault();
      const views = ['dashboard', 'schedule', 'swaps', 'students', 'analytics', 'settings'];
      const viewIndex = parseInt(e.key) - 1;
      if (views[viewIndex]) {
        this.navigateToView(views[viewIndex]);
      }
    }

    if (e.key === 'Escape') {
      this.closeAllModals();
    }
  }

  closeAllModals() {
    ['student-selection-modal', 'swap-modal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    document.querySelectorAll('.modal-overlay.dynamic-modal').forEach(modal => {
      modal.remove();
    });
    document.getElementById('shift-context-menu')?.style && (document.getElementById('shift-context-menu').style.display = 'none');
  }

  confirmDialog(message, { title = 'Confirm', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false } = {}) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay dynamic-modal confirm-dialog-overlay';
      const esc = window.SchedulerUtils.escapeHtml; // F-17: escape at the sink
      overlay.innerHTML = `
        <div class="modal-content confirm-dialog">
          <div class="modal-header"><h2>${esc(title)}</h2></div>
          <div class="modal-body"><p>${esc(message)}</p></div>
          <div class="modal-footer confirm-dialog-actions">
            <button type="button" class="btn btn-secondary" data-action="cancel">${esc(cancelLabel)}</button>
            <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${esc(confirmLabel)}</button>
          </div>
        </div>`;

      const close = (result) => {
        overlay.remove();
        resolve(result);
      };

      overlay.querySelector('[data-action="cancel"]').onclick = () => close(false);
      overlay.querySelector('[data-action="confirm"]').onclick = () => close(true);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
      });

      document.body.appendChild(overlay);
    });
  }

  async saveStateDownload() {
    try {
      const payload = await this.state.buildFullStatePayload();
      const label = payload.threeMonthView
        ? `${payload.year}-${String(payload.month + 1).padStart(2, '0')}-3mo`
        : `${payload.year}-${String(payload.month + 1).padStart(2, '0')}`;
      SchedulerExport.downloadFile(
        JSON.stringify(payload, null, 2),
        `schedule-state-${label}.json`,
        'application/json'
      );
      this.showToast('Full schedule state downloaded', 'success');
    } catch (err) {
      console.error(err);
      this.showToast('Save failed', 'error');
    }
  }

  loadStateFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        let raw;
        try {
          raw = JSON.parse(await file.text());
        } catch {
          throw new Error('File is not valid JSON');
        }

        const preview = SchedulerExport.normalizeStatePayload(raw);
        const validationErrors = SchedulerExport.validateStatePayload(preview);
        if (validationErrors.length) {
          throw new Error(validationErrors.join('; '));
        }

        const info = SchedulerExport.describeState(preview);
        const ok = await this.confirmDialog(
          `Load schedule for ${info.monthLabel}? ${info.studentCount} students, ${info.shiftCount} shifts${info.savedAt ? ` (saved ${new Date(info.savedAt).toLocaleString()})` : ''}. This replaces current data.`,
          { title: 'Load saved state', confirmLabel: 'Load', danger: true }
        );
        if (!ok) return;

        await this.state.importFullState(raw);
        await this.refreshCurrentView();
        this.showToast('State loaded successfully', 'success');
      } catch (err) {
        console.error(err);
        this.showToast(err.message || 'Failed to load state file', 'error');
      }
    };
    input.click();
  }

  showUpdateNotification() {
    this.showToast('App update available! Refresh to update.', 'info', {
      action: 'Refresh',
      actionHandler: () => {
        window.location.reload();
      }
    });
  }

  showAssessmentReminders() {
    if (!this.state?.getAssessmentReminders) return;
    const reminders = this.state.getAssessmentReminders();
    for (const reminder of reminders) {
      this.showToast(reminder.message, reminder.type === 'deadline_warning' ? 'warning' : 'info');
    }
  }

  showToast(message, type = 'info', options = {}) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = this.getToastIcon(type);
    const esc = window.SchedulerUtils.escapeHtml; // F-17: escape at the sink
    const content = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-message">${esc(message)}</span>
      ${options.action ? `<button class="btn btn-sm btn-primary toast-action">${esc(options.action)}</button>` : ''}
      <button class="toast-close">×</button>
    `;
    
    toast.innerHTML = content;
    
    // Add event listeners
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      this.removeToast(toast);
    });
    
    if (options.action && options.actionHandler) {
      const actionBtn = toast.querySelector('.toast-action');
      actionBtn.addEventListener('click', options.actionHandler);
    }
    
    // Add to container
    const container = document.getElementById('toast-container');
    if (container) {
      container.appendChild(toast);
      
      // Auto remove after 5 seconds
      setTimeout(() => {
        this.removeToast(toast);
      }, 5000);
    }
  }

  removeToast(toast) {
    toast.style.animation = 'slideOut 0.3s ease-in forwards';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  getToastIcon(type) {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type] || icons.info;
  }

  showError(message) {
    this.showToast(message, 'error');
  }

  async loadSampleData() {
    try {
      await this.state.loadSample();
      this.showToast(`Loaded ${this.state.students.length} sample students`, 'success');
      await this.refreshCurrentView();
    } catch (error) {
      console.error('Failed to load sample:', error);
      this.showToast('Failed to load sample data', 'error');
    }
  }

  async refreshCurrentView() {
    if (this.views[this.currentView]) {
      await this.views[this.currentView].init();
    }
  }

  async saveAppState() {
    if (!this.storage) return;
    await this.storage.setSetting('appState', {
      currentView: this.currentView,
      timestamp: Date.now()
    });
  }

  async loadAppState() {
    if (!this.storage) return;
    const state = await this.storage.getSetting('appState');
    if (state && state.currentView) {
      this.currentView = state.currentView;
    }
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ShiftSchedulerApp();
});

// Add CSS for toast animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
  
  .toast {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }
  
  .toast-close {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1.25rem;
    padding: 0;
    margin-left: auto;
  }
  
  .toast-action {
    margin-left: auto;
    margin-right: var(--spacing-sm);
  }
`;
document.head.appendChild(style);
