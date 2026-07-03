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

  return router;
}

module.exports = { createProtectedRouter };
