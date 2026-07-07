'use strict';
/**
 * accessControl.js — role-based feature visibility for PWA views.
 *
 * Roles: student | team-lead | admin
 * Admin can override defaults for student / team-lead via Settings → Feature access.
 */

const ROLES = Object.freeze(['student', 'team-lead', 'admin']);

const TL_ADMIN = ['team-lead', 'admin'];
const ALL_ROLES = ['student', 'team-lead', 'admin'];
const ADMIN_ONLY = ['admin'];

/** @type {Record<string, { label: string, group: string, roles: string[] }>} */
const FEATURE_CATALOG = Object.freeze({
  // ── Navigation tabs ──
  'view.dashboard': { label: 'Dashboard tab', group: 'Navigation', roles: ALL_ROLES },
  'view.schedule': { label: 'Schedule tab', group: 'Navigation', roles: TL_ADMIN },
  'view.swaps': { label: 'Swaps tab', group: 'Navigation', roles: ALL_ROLES },
  'view.students': { label: 'Students tab', group: 'Navigation', roles: TL_ADMIN },
  'view.analytics': { label: 'Analytics tab', group: 'Navigation', roles: TL_ADMIN },
  'view.settings': { label: 'Settings tab', group: 'Navigation', roles: TL_ADMIN },

  // ── Dashboard ──
  'dashboard.todaysShifts': { label: "Today's Shifts", group: 'Dashboard', roles: ALL_ROLES },
  'dashboard.pendingSwaps': { label: 'Pending Swaps card', group: 'Dashboard', roles: ADMIN_ONLY },
  'dashboard.quickStats': { label: 'Quick Stats card', group: 'Dashboard', roles: ADMIN_ONLY },
  'dashboard.recentActivity': { label: 'Recent Activity card', group: 'Dashboard', roles: ADMIN_ONLY },
  'dashboard.quickSchedule': { label: 'Quick Schedule button', group: 'Dashboard', roles: TL_ADMIN },
  'dashboard.viewAllSwaps': { label: 'View All Swaps button', group: 'Dashboard', roles: ALL_ROLES },
  'dashboard.exportSchedule': { label: 'Export Schedule button', group: 'Dashboard', roles: ALL_ROLES },

  // ── Schedule ──
  'schedule.navMonth': { label: 'Month navigation', group: 'Schedule', roles: TL_ADMIN },
  'schedule.addShift': { label: 'Add Shift', group: 'Schedule', roles: TL_ADMIN },
  'schedule.generate': { label: 'Generate Schedule', group: 'Schedule', roles: TL_ADMIN },
  'schedule.rebalance': { label: 'Rebalance', group: 'Schedule', roles: TL_ADMIN },
  'schedule.fillOpenClose': { label: 'Fill Open/Close', group: 'Schedule', roles: TL_ADMIN },
  'schedule.exportCsv': { label: 'Export CSV', group: 'Schedule', roles: TL_ADMIN },
  'schedule.exportIcs': { label: 'Export ICS', group: 'Schedule', roles: TL_ADMIN },
  'schedule.print': { label: 'Print', group: 'Schedule', roles: TL_ADMIN },
  'schedule.saveState': { label: 'Save state', group: 'Schedule', roles: TL_ADMIN },
  'schedule.loadState': { label: 'Load state', group: 'Schedule', roles: TL_ADMIN },
  'schedule.threeMonth': { label: '3-Month View toggle', group: 'Schedule', roles: TL_ADMIN },
  'schedule.adminMode': { label: 'Admin Mode toggle', group: 'Schedule', roles: TL_ADMIN },
  'schedule.sidebar.students': { label: 'Student sidebar list', group: 'Schedule', roles: TL_ADMIN },
  'schedule.sidebar.templates': { label: 'Shift templates sidebar', group: 'Schedule', roles: TL_ADMIN },
  'schedule.calendar': { label: 'Calendar grid', group: 'Schedule', roles: TL_ADMIN },
  'schedule.summary': { label: 'Schedule summary panel', group: 'Schedule', roles: TL_ADMIN },

  // ── Swaps ──
  'swaps.postMarketplace': { label: 'Post to marketplace', group: 'Swaps', roles: ALL_ROLES },
  'swaps.refresh': { label: 'Refresh', group: 'Swaps', roles: ALL_ROLES },
  'swaps.panel.requests': { label: 'Requests tab', group: 'Swaps', roles: ALL_ROLES },
  'swaps.panel.marketplace': { label: 'Marketplace tab', group: 'Swaps', roles: ALL_ROLES },
  'swaps.filters': { label: 'Request filters', group: 'Swaps', roles: ALL_ROLES },
  'swaps.sidebar.debts': { label: 'Swap debts panel', group: 'Swaps', roles: ALL_ROLES },
  'swaps.sidebar.stats': { label: 'Swap quick stats', group: 'Swaps', roles: ALL_ROLES },
  'swaps.list': { label: 'Swap requests list', group: 'Swaps', roles: ALL_ROLES },

  // ── Students ──
  'students.addStudent': { label: 'Add Student', group: 'Students', roles: TL_ADMIN },
  'students.loadSample': { label: 'Load Sample', group: 'Students', roles: TL_ADMIN },
  'students.importCsv': { label: 'Import CSV', group: 'Students', roles: TL_ADMIN },
  'students.exportCsv': { label: 'Export CSV', group: 'Students', roles: TL_ADMIN },
  'students.panel.students': { label: 'Students list panel', group: 'Students', roles: TL_ADMIN },
  'students.panel.contracts': { label: 'Contract compliance panel', group: 'Students', roles: TL_ADMIN },
  'students.panel.availability': { label: 'Availability panel', group: 'Students', roles: TL_ADMIN },
  'students.panel.tests': { label: 'Test dates panel', group: 'Students', roles: TL_ADMIN },
  'students.panel.ledger': { label: 'Hours ledger panel', group: 'Students', roles: TL_ADMIN },
  'students.sidebar.filters': { label: 'Student filters sidebar', group: 'Students', roles: TL_ADMIN },
  'students.sidebar.templates': { label: 'Contract templates sidebar', group: 'Students', roles: TL_ADMIN },
  'students.sidebar.stats': { label: 'Student quick stats sidebar', group: 'Students', roles: TL_ADMIN },
  'students.contracts.export': { label: 'Export compliance CSV', group: 'Students', roles: TL_ADMIN },
  'students.availability.grantAll': { label: 'Grant all availability edit', group: 'Students', roles: TL_ADMIN },
  'students.availability.export': { label: 'Export availability CSV', group: 'Students', roles: TL_ADMIN },
  'students.tests.export': { label: 'Export test dates CSV', group: 'Students', roles: TL_ADMIN },
  'students.ledger.refresh': { label: 'Refresh ledger', group: 'Students', roles: TL_ADMIN },
  'students.ledger.export': { label: 'Export ledger CSV', group: 'Students', roles: TL_ADMIN },
  'students.ledger.payroll': { label: 'Payroll upload / worked hours', group: 'Students', roles: TL_ADMIN },

  // ── Analytics ──
  'analytics.periodSelector': { label: 'Period selector', group: 'Analytics', roles: TL_ADMIN },
  'analytics.refresh': { label: 'Refresh', group: 'Analytics', roles: TL_ADMIN },
  'analytics.card.overview': { label: 'Overview card', group: 'Analytics', roles: TL_ADMIN },
  'analytics.card.hoursDistribution': { label: 'Hours Distribution card', group: 'Analytics', roles: TL_ADMIN },
  'analytics.card.shiftCoverage': { label: 'Shift Coverage card', group: 'Analytics', roles: TL_ADMIN },
  'analytics.card.studentPerformance': { label: 'Student Performance card', group: 'Analytics', roles: TL_ADMIN },
  'analytics.card.contractCompliance': { label: 'Contract Compliance card', group: 'Analytics', roles: TL_ADMIN },
  'analytics.card.swapActivity': { label: 'Swap Activity card', group: 'Analytics', roles: TL_ADMIN },
  'analytics.card.trends': { label: 'Trends card', group: 'Analytics', roles: TL_ADMIN },
  'analytics.compliance.export': { label: 'Export compliance CSV', group: 'Analytics', roles: TL_ADMIN },

  // ── Settings ──
  'settings.operationalHours': { label: 'Operational hours', group: 'Settings', roles: TL_ADMIN },
  'settings.publicHolidays': { label: 'Public holidays', group: 'Settings', roles: TL_ADMIN },
  'settings.specialHours': { label: 'Special hours', group: 'Settings', roles: TL_ADMIN },
  'settings.batchHolidays': { label: 'Batch holidays', group: 'Settings', roles: TL_ADMIN },
  'settings.shiftTemplates': { label: 'Shift templates', group: 'Settings', roles: TL_ADMIN },
  'settings.assessmentPeriods': { label: 'Assessment periods', group: 'Settings', roles: TL_ADMIN },
  'settings.testShifts': { label: 'Test shifts', group: 'Settings', roles: TL_ADMIN },
  'settings.assessmentSchedule': { label: 'Assessment schedule generation', group: 'Settings', roles: TL_ADMIN },
  'settings.monthlyTargets': { label: 'Monthly contract targets', group: 'Settings', roles: TL_ADMIN },
  'settings.scheduleView': { label: 'Schedule view toggle', group: 'Settings', roles: TL_ADMIN },
  'settings.featureAccess': { label: 'Feature access admin panel', group: 'Settings', roles: ADMIN_ONLY },
});

const GROUP_ORDER = [
  'Navigation', 'Dashboard', 'Schedule', 'Swaps', 'Students', 'Analytics', 'Settings',
];

const VIEW_ORDER = ['dashboard', 'schedule', 'swaps', 'students', 'analytics', 'settings'];

const STUDENT_TAB_FEATURES = Object.freeze({
  students: 'students.panel.students',
  contracts: 'students.panel.contracts',
  availability: 'students.panel.availability',
  tests: 'students.panel.tests',
  ledger: 'students.panel.ledger',
});

const SWAPS_TAB_FEATURES = Object.freeze({
  requests: 'swaps.panel.requests',
  marketplace: 'swaps.panel.marketplace',
});

function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'supervisor') return 'team-lead';
  return r;
}

class AccessControl {
  constructor(app) {
    this.app = app;
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

  defaultCan(role, featureId) {
    const def = FEATURE_CATALOG[featureId];
    if (!def) return false;
    const r = normalizeRole(role);
    if (r === 'admin') return true;
    return def.roles.includes(r);
  }

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
    const nodes = root === document
      ? document.querySelectorAll('[data-feature]')
      : root.querySelectorAll?.('[data-feature]') || [];
    nodes.forEach((el) => {
      const id = el.dataset.feature;
      const allowed = this.can(id);
      el.hidden = !allowed;
      el.classList.toggle('access-hidden', !allowed);
    });
  }

  /** All features editable in the admin matrix (except the matrix itself). */
  configurableFeatures() {
    return Object.entries(FEATURE_CATALOG)
      .filter(([id]) => id !== 'settings.featureAccess')
      .map(([id, meta]) => ({ id, ...meta }));
  }

  groupedConfigurableFeatures() {
    const groups = {};
    for (const f of this.configurableFeatures()) {
      if (!groups[f.group]) groups[f.group] = [];
      groups[f.group].push(f);
    }
    const ordered = {};
    for (const name of GROUP_ORDER) {
      if (groups[name]) ordered[name] = groups[name];
    }
    for (const [name, items] of Object.entries(groups)) {
      if (!ordered[name]) ordered[name] = items;
    }
    return ordered;
  }

  firstAllowedStudentTab() {
    for (const [tab, feat] of Object.entries(STUDENT_TAB_FEATURES)) {
      if (this.can(feat)) return tab;
    }
    return null;
  }

  firstAllowedSwapsTab() {
    for (const [tab, feat] of Object.entries(SWAPS_TAB_FEATURES)) {
      if (this.can(feat)) return tab;
    }
    return null;
  }

  canStudentTab(tab) {
    const feat = STUDENT_TAB_FEATURES[tab];
    return feat ? this.can(feat) : false;
  }

  canSwapsTab(tab) {
    const feat = SWAPS_TAB_FEATURES[tab];
    return feat ? this.can(feat) : false;
  }
}

if (typeof window !== 'undefined') {
  window.AccessControl = AccessControl;
  window.FEATURE_CATALOG = FEATURE_CATALOG;
  window.STUDENT_TAB_FEATURES = STUDENT_TAB_FEATURES;
  window.SWAPS_TAB_FEATURES = SWAPS_TAB_FEATURES;
  window.normalizeRole = normalizeRole;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AccessControl,
    FEATURE_CATALOG,
    ROLES,
    normalizeRole,
    VIEW_ORDER,
    STUDENT_TAB_FEATURES,
    SWAPS_TAB_FEATURES,
  };
}
