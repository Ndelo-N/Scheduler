'use strict';

const express = require('express');

/**
 * Public liveness + DB probe. Accepts a pg Pool (Rev1) or DatabaseManager (11.0 tests).
 */
function createHealthRouter(db) {
  const router = express.Router();

  router.get('/', async (_req, res, next) => {
    try {
      let dbStatus = 'unknown';
      if (db) {
        if (typeof db.query === 'function') {
          await db.query('SELECT 1');
          dbStatus = db.activeMode || 'postgres';
        } else if (typeof db.isConnected === 'function' && db.isConnected()) {
          await db.query('SELECT 1');
          dbStatus = db.activeMode || 'memory';
        }
      }
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        db: dbStatus,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createHealthRouter };
