'use strict';
/**
 * app.js — builds the Express app. Takes an injected pg Pool (so it can be tested
 * against an in-memory Postgres) and an optional PWA directory to serve.
 *
 * Order: security headers → API (auth + guarded) → API 404 (JSON) → scoped static
 * PWA → SPA fallback → final 404. Static is served from `pwaDir` ONLY — never the
 * repo root — so .env / server / database are not web-reachable.
 */

const path = require('path');
const express = require('express');
const { createAuthRouter } = require('./routes/auth');
const { createProtectedRouter } = require('./routes/protected');
const { requireAuth, enforcePasswordChange } = require('./security/authMiddleware');
const { securityHeaders } = require('./middleware/securityHeaders');

function createApp(pool, { pwaDir = process.env.PWA_DIR || null } = {}) {
  const app = express();
  app.set('trust proxy', true);        // req.secure/req.ip correct behind the TLS front
  app.disable('x-powered-by');

  app.use(securityHeaders());          // headers on every response
  app.use(express.json({ limit: '1mb' }));

  // Public + session auth endpoints (login/logout/me/change-password).
  app.use('/api/auth', createAuthRouter(pool));

  // Everything else under /api requires a valid session; a must-change user is
  // blocked here until they set a new password (change-password lives on the
  // /api/auth router above). Per-route role/ownership guards live in the router.
  app.use('/api', requireAuth(pool), enforcePasswordChange, createProtectedRouter(pool));

  // Unmatched /api/* → JSON 404 (never fall through to the SPA HTML).
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // Static PWA + SPA fallback — scoped to pwaDir. When pwaDir is unset the server
  // is API-only (e.g. tests).
  if (pwaDir) {
    const root = path.resolve(pwaDir);
    app.use(express.static(root, { index: 'index.html', dotfiles: 'ignore' }));
    app.get('*', (req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(root, 'index.html'));
    });
  }

  // Final catch-all.
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  return app;
}

module.exports = { createApp };
