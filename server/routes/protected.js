'use strict';
/**
 * routes/protected.js — EXAMPLE protected routes wired to the brick-4 guards.
 *
 * These are templates: keep the guards, replace the stub handler bodies with the
 * real ones (hours ledger, schedule, admin operations). Everything here sits
 * behind requireAuth + enforcePasswordChange (mounted in app.js), so req.user is
 * always present and never a must-change user.
 */

const express = require('express');
const { requireRole, requireSelfOrRole } = require('../security/authMiddleware');

function createProtectedRouter(pool) {
  const router = express.Router();

  // Any authenticated user. (Scope to the caller with req.user — no id in the URL.)
  router.get('/schedule', (req, res) => {
    res.json({ ok: true, viewer: req.user.uNumber, role: req.user.role, note: 'schedule handler goes here' });
  });

  // Object-level: a student may read only THEIR OWN ledger; admin/supervisor any.
  router.get('/students/:uNumber/ledger', requireSelfOrRole('admin', 'supervisor'), (req, res) => {
    res.json({ ok: true, uNumber: req.params.uNumber, ledger: `‹ledger for ${req.params.uNumber}›` });
  });

  // Admin-only operation.
  router.get('/admin/users', requireRole('admin'), async (req, res) => {
    const r = await pool.query('SELECT student_number, role, is_active FROM users');
    res.json({ ok: true, users: r.rows });
  });

  // Notification preferences (per-user, persisted — F-14).
  router.get('/notifications/preferences', async (req, res) => {
    try {
      const r = await pool.query(
        'SELECT preferences FROM notification_preferences WHERE user_id = $1',
        [req.user.id]
      );
      res.json(r.rows[0] ? r.rows[0].preferences : {});
    } catch (e) {
      console.error('get preferences error:', e.message);
      res.status(500).json({ error: 'Could not load preferences' });
    }
  });

  // PUT/POST both upsert-and-merge (shallow: new keys win), matching prior semantics.
  const upsertPreferences = async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'preferences must be an object' });
    }
    try {
      const r = await pool.query(
        `INSERT INTO notification_preferences (user_id, preferences, updated_at)
         VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) DO UPDATE
           SET preferences = notification_preferences.preferences || EXCLUDED.preferences,
               updated_at = CURRENT_TIMESTAMP
         RETURNING preferences`,
        [req.user.id, JSON.stringify(req.body)]
      );
      res.json(r.rows[0].preferences);
    } catch (e) {
      console.error('save preferences error:', e.message);
      res.status(500).json({ error: 'Could not save preferences' });
    }
  };
  router.put('/notifications/preferences', upsertPreferences);
  router.post('/notifications/preferences', upsertPreferences);

  return router;
}

module.exports = { createProtectedRouter };
