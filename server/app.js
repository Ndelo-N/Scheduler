'use strict';
/**
 * server/app.js — Express app factory (Rev1 auth + Phase 11.0 health).
 *
 * Order: security headers → public health → auth routes → guarded API →
 * API 404 (JSON) → scoped static PWA → SPA fallback → final 404.
 */

const path = require('path');
const express = require('express');
const { createAuthRouter } = require('./routes/auth');
const { createProtectedRouter } = require('./routes/protected');
const { createHealthRouter } = require('./routes/health');
const { requireAuth, enforcePasswordChange } = require('./security/authMiddleware');
const { securityHeaders } = require('./middleware/securityHeaders');

/** Block web access to sensitive repo paths when PWA_DIR points at project root. */
function createStaticGuard() {
  const blocked = [
    '/server',
    '/database',
    '/node_modules',
    '/tests',
    '/july2026',
    '/documentation',
    '/.env',
    '/.git',
  ];
  return function staticGuard(req, res, next) {
    const p = req.path.toLowerCase();
    if (p.includes('..') || p.startsWith('/.') || blocked.some((b) => p === b || p.startsWith(`${b}/`))) {
      return res.status(404).end();
    }
    next();
  };
}

function createApp(pool, { pwaDir = process.env.PWA_DIR || null } = {}) {
  const app = express();
  // trust proxy (F-06): MUST reflect real deployment topology, or the leftmost
  // X-Forwarded-For becomes attacker-spoofable and defeats IP-based rate limiting.
  // Set TRUST_PROXY to the number of reverse-proxy hops in front of this app
  // (UP infra: typically 1), a subnet/IP list, or a keyword like 'loopback'.
  // Unset / '' / '0'  => trust nothing (direct-connect / dev) — spoofing impossible.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy === undefined || trustProxy === '' || trustProxy === '0') {
    app.set('trust proxy', false);
  } else if (/^\d+$/.test(trustProxy)) {
    app.set('trust proxy', Number(trustProxy));
  } else {
    app.set('trust proxy', trustProxy);
  }
  app.disable('x-powered-by');

  app.use(securityHeaders());
  app.use(express.json({ limit: '1mb' }));

  const health = createHealthRouter(pool);
  app.use('/health', health);
  app.use('/api/health', health);

  app.use('/api/auth', createAuthRouter(pool));

  app.use('/api', requireAuth(pool), enforcePasswordChange, createProtectedRouter(pool));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  if (pwaDir) {
    const root = path.resolve(pwaDir);
    app.use(createStaticGuard());
    app.use(express.static(root, { index: 'index.html', dotfiles: 'ignore' }));
    app.get('*', (req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(root, 'index.html'));
    });
  }

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  return app;
}

module.exports = { createApp };
