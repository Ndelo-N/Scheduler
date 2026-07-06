'use strict';
/**
 * accessControl.js — role-based feature visibility for PWA views.
 *
 * Roles: student | team-lead | admin
 * Admin can override defaults for student / team-lead via Settings → Feature access.
 * Hidden features are removed from the DOM (hidden + access-hidden class).
 */

const ROLES = Object.freeze(['student', 'team-lead', 'admin']);

/** @type {Record<string, { label: string, group: string, roles: string[] }>} */
const FEATURE_CATALOG = Object.freeze({
  'view.dashboard': { label: 'Dashboard tab', group: 'Navigation', roles: ['student', 'team-lead', 'admin'] },
  'view.schedule': { label: 'Schedule tab', group: 'Navigation', roles: ['team-lead', 'admin'] },
  'view.swaps': { label: 'Swaps tab', group: 'Navigation', roles: ['student', 'team-lead', 'admin'] },
  'view.students': { label: 'Students tab', group: 'Navigation', roles: ['team-lead', 'admin'] },
  'view.analytics': { label: 'Analytics tab', group: 'Navigation', roles: ['team-lead', 'admin'] },
  'view.settings': { label: 'Settings tab', group: 'Navigation', roles: ['team-lead', 'admin'] },

  'dashboard.todaysShifts': { label: "Today's Shifts", group: 'Dashboard', roles: ['student', 'team-lead', 'admin'] },
  'dashboard.pendingSwaps': { label: 'Pending Swaps', group: 'Dashboard', roles: ['admin'] },
  'dashboard.quickStats': { label: 'Quick Stats', group: 'Dashboard', roles: ['admin'] },
  'dashboard.recentActivity': { label: 'Recent Activity', group: 'Dashboard', roles: ['admin'] },
  'dashboard.quickSchedule': { label: 'Quick Schedule', group: 'Dashboard', roles: ['team-lead', 'admin'] },
  'dashboard.viewAllSwaps': { label: 'View All Swaps', group: 'Dashboard', roles: ['student', 'team-lead', 'admin'] },
  'dashboard.exportSchedule': { label: 'Export Schedule', group: 'Dashboard', roles: ['student', 'team-lead', 'admin'] },

  'settings.featureAccess': { label: 'Feature access admin', group: 'Settings', roles: ['admin'] },
});

const VIEW_ORDER = ['dashboard', 'schedule', 'swaps', 'students', 'analytics', 'settings'];

function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'supervisor') return 'team-lead';
  return r;
}

class AccessControl {
  /** @param {{ currentUser?: object, storage?: object }} app */
  constructor(app) {
    this.app = app;
    /** @type {Record<string, Record<string, boolean>>} role → featureId → allowed */
    this.overrides = {};
  }

  async load() {
    if (await this._useServerSync()) {
      try {
        const data = await this.app.api.getFeatureAccess();
        if (data && data.overrides && typeof data.overrides === 'object') {
          this.overrides = data.overrides;
          this.updatedAt = data.updatedAt || null;
          await this._cacheLocal(this.overrides);
          return;
        }
      } catch (e) {
        console.warn('Feature access: server load failed, using local cache —', e.message);
      }
    }
    if (!this.app.storage) return;
    const stored = await this.app.storage.getSetting('featureAccessOverrides');
    if (stored && typeof stored === 'object') this.overrides = stored;
  }

  async save() {
    if (this.isAdmin() && (await this._useServerSync())) {
      const data = await this.app.api.putFeatureAccess(this.overrides);
      if (data && data.overrides) {
        this.overrides = data.overrides;
        this.updatedAt = data.updatedAt || null;
      }
      await this._cacheLocal(this.overrides);
      return;
    }
    await this._cacheLocal(this.overrides);
  }

  async _useServerSync() {
    if (!this.app.api) return false;
    if (this.app.currentUser || this.app.authGate) return true;
    try {
      const health = await this.app.api.get('/health', { skipAuthHandler: true, timeout: 2000 });
      return health && health.status === 'ok';
    } catch {
      return false;
    }
  }

  async _cacheLocal(overrides) {
    if (!this.app.storage) return;
    await this.app.storage.setSetting('featureAccessOverrides', overrides);
  }

  getRole() {
    const user = this.app.currentUser;
    if (!user || !user.role) return 'admin';
    return normalizeRole(user.role);
  }

  isAdmin() {
    return this.getRole() === 'admin';
  }

  /** Default grant from catalog (ignores overrides). */
  defaultCan(role, featureId) {
    const def = FEATURE_CATALOG[featureId];
    if (!def) return false;
    const r = normalizeRole(role);
    if (r === 'admin') return true;
    return def.roles.includes(r);
  }

  /** Effective access for the current or given role. */
  can(featureId, role = this.getRole()) {
    const r = normalizeRole(role);
    if (r === 'admin') return true;
    const def = FEATURE_CATALOG[featureId];
    if (!def) return false;
    if (this.overrides[r] && Object.prototype.hasOwnProperty.call(this.overrides[r], featureId)) {
      return Boolean(this.overrides[r][featureId]);
    }
    return def.roles.includes(r);
  }

  setOverride(role, featureId, allowed) {
    const r = normalizeRole(role);
    if (r === 'admin') return;
    if (!this.overrides[r]) this.overrides[r] = {};
    if (this.defaultCan(r, featureId) === allowed) {
      delete this.overrides[r][featureId];
      if (!Object.keys(this.overrides[r]).length) delete this.overrides[r];
    } else {
      this.overrides[r][featureId] = Boolean(allowed);
    }
  }

  resetOverrides() {
    this.overrides = {};
  }

  getDefaultView() {
    for (const view of VIEW_ORDER) {
      if (this.can(`view.${view}`)) return view;
    }
    return 'dashboard';
  }

  canAccessView(viewName) {
    return this.can(`view.${viewName}`);
  }

  applyNavigation() {
    document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
      const view = btn.dataset.view;
      const allowed = this.can(`view.${view}`);
      btn.hidden = !allowed;
      btn.classList.toggle('access-hidden', !allowed);
    });
  }

  applyVisibility(root = document) {
    const scope = root instanceof Document ? root : root;
    const nodes = scope === document
      ? document.querySelectorAll('[data-feature]')
      : scope.querySelectorAll?.('[data-feature]') || [];
    nodes.forEach((el) => {
      const id = el.dataset.feature;
      const allowed = this.can(id);
      el.hidden = !allowed;
      el.classList.toggle('access-hidden', !allowed);
    });
  }

  /** Features admins may configure for student / team-lead (excludes admin-only nav). */
  configurableFeatures() {
    return Object.entries(FEATURE_CATALOG)
      .filter(([, meta]) => meta.roles.some((r) => r === 'student' || r === 'team-lead'))
      .map(([id, meta]) => ({ id, ...meta }));
  }

  groupedConfigurableFeatures() {
    const groups = {};
    for (const f of this.configurableFeatures()) {
      if (!groups[f.group]) groups[f.group] = [];
      groups[f.group].push(f);
    }
    return groups;
  }
}

if (typeof window !== 'undefined') {
  window.AccessControl = AccessControl;
  window.FEATURE_CATALOG = FEATURE_CATALOG;
  window.normalizeRole = normalizeRole;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AccessControl, FEATURE_CATALOG, ROLES, normalizeRole, VIEW_ORDER };
}
