'use strict';
/**
 * Server-side feature-access validation (keep in sync with src/js/core/accessControl.js).
 */

const CONFIGURABLE_ROLES = new Set(['student', 'team-lead']);

/** Feature IDs admins may grant/revoke for student / team-lead (mirror FEATURE_CATALOG). */
const CONFIGURABLE_FEATURES = new Set([
  'view.dashboard',
  'view.schedule',
  'view.swaps',
  'view.students',
  'view.analytics',
  'view.settings',
  'dashboard.todaysShifts',
  'dashboard.pendingSwaps',
  'dashboard.quickStats',
  'dashboard.recentActivity',
  'dashboard.quickSchedule',
  'dashboard.viewAllSwaps',
  'dashboard.exportSchedule',
  'schedule.navMonth',
  'schedule.addShift',
  'schedule.generate',
  'schedule.rebalance',
  'schedule.fillOpenClose',
  'schedule.exportCsv',
  'schedule.exportIcs',
  'schedule.print',
  'schedule.saveState',
  'schedule.loadState',
  'schedule.weekView',
  'schedule.threeMonth',
  'schedule.adminMode',
  'schedule.sidebar.students',
  'schedule.sidebar.templates',
  'schedule.calendar',
  'schedule.summary',
  'swaps.postMarketplace',
  'swaps.refresh',
  'swaps.panel.requests',
  'swaps.panel.marketplace',
  'swaps.filters',
  'swaps.sidebar.debts',
  'swaps.sidebar.stats',
  'swaps.list',
  'students.addStudent',
  'students.loadSample',
  'students.importCsv',
  'students.clearAll',
  'students.exportCsv',
  'students.panel.students',
  'students.panel.contracts',
  'students.panel.availability',
  'students.panel.tests',
  'students.panel.ledger',
  'students.sidebar.filters',
  'students.sidebar.templates',
  'students.sidebar.stats',
  'students.contracts.export',
  'students.availability.grantAll',
  'students.availability.export',
  'students.tests.export',
  'students.ledger.refresh',
  'students.ledger.export',
  'students.ledger.payroll',
  'analytics.periodSelector',
  'analytics.refresh',
  'analytics.card.overview',
  'analytics.card.hoursDistribution',
  'analytics.card.shiftCoverage',
  'analytics.card.studentPerformance',
  'analytics.card.contractCompliance',
  'analytics.card.swapActivity',
  'analytics.card.trends',
  'analytics.compliance.export',
  'settings.operationalHours',
  'settings.publicHolidays',
  'settings.specialHours',
  'settings.batchHolidays',
  'settings.shiftTemplates',
  'settings.assessmentPeriods',
  'settings.testShifts',
  'settings.assessmentSchedule',
  'settings.monthlyTargets',
  'settings.scheduleView',
]);

function sanitizeOverrides(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  for (const [role, features] of Object.entries(input)) {
    const r = role === 'supervisor' ? 'team-lead' : String(role).trim().toLowerCase();
    if (!CONFIGURABLE_ROLES.has(r)) continue;
    if (!features || typeof features !== 'object' || Array.isArray(features)) continue;
    for (const [featureId, allowed] of Object.entries(features)) {
      if (!CONFIGURABLE_FEATURES.has(featureId)) continue;
      if (typeof allowed !== 'boolean') continue;
      if (!out[r]) out[r] = {};
      out[r][featureId] = allowed;
    }
    if (out[r] && !Object.keys(out[r]).length) delete out[r];
  }
  return out;
}

async function ensureConfigRow(pool) {
  await pool.query(
    `INSERT INTO feature_access_config (id, overrides)
     VALUES (1, '{}'::jsonb)
     ON CONFLICT (id) DO NOTHING`
  );
}

async function loadOverrides(pool) {
  await ensureConfigRow(pool);
  const r = await pool.query(
    `SELECT overrides, updated_at, updated_by FROM feature_access_config WHERE id = 1`
  );
  const row = r.rows[0] || { overrides: {}, updated_at: null, updated_by: null };
  return {
    overrides: sanitizeOverrides(row.overrides || {}),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

async function saveOverrides(pool, overrides, userId) {
  const clean = sanitizeOverrides(overrides);
  await ensureConfigRow(pool);
  const r = await pool.query(
    `UPDATE feature_access_config
        SET overrides = $2::jsonb,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = $3
      WHERE id = 1
      RETURNING overrides, updated_at, updated_by`,
    [1, JSON.stringify(clean), userId || null]
  );
  const row = r.rows[0];
  return {
    overrides: sanitizeOverrides(row.overrides || {}),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

module.exports = {
  CONFIGURABLE_ROLES,
  CONFIGURABLE_FEATURES,
  sanitizeOverrides,
  ensureConfigRow,
  loadOverrides,
  saveOverrides,
};
