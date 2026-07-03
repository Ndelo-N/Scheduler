'use strict';
/**
 * index.js — server bootstrap for the lab machine.
 *
 * Serves the API + the PWA over HTTPS when a mkcert cert is configured
 * (TLS_KEY/TLS_CERT), else plain HTTP for localhost dev. See
 * Brick7_TLS_Runbook.md for the scheduler.local cert + DNS + CA steps.
 */

const path = require('path');
const { Pool } = require('pg');
const { createApp } = require('./app');
const { buildServer } = require('./httpsServer');
const { warmup } = require('./security/credentialVerifier');
const sessionStore = require('./security/sessionStore');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'shift_scheduler',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: false
});

// Serve the PWA from a scoped directory (default ./public), NEVER the repo root.
const PWA_DIR = process.env.PWA_DIR || path.join(__dirname, '..', 'public');
const app = createApp(pool, { pwaDir: PWA_DIR });

const PORT = process.env.PORT || 3000;
const { server, secure } = buildServer(app, {
  tlsKey: process.env.TLS_KEY,     // e.g. ./certs/scheduler.local-key.pem
  tlsCert: process.env.TLS_CERT    // e.g. ./certs/scheduler.local.pem
});

async function start() {
  await warmup(); // precompute the enumeration-defense dummy hash
  server.listen(PORT, () => {
    console.log(`Auth server on :${PORT} (${secure ? 'HTTPS' : 'HTTP — dev/localhost only'})`);
    if (!secure) console.log('  TLS off: set TLS_KEY/TLS_CERT to the mkcert scheduler.local cert for the lab box.');
  });
  // periodic cleanup of expired sessions
  setInterval(() => sessionStore.sweepExpired(pool).catch(() => {}), 60 * 60 * 1000);
}

start().catch((e) => { console.error('server failed to start:', e); process.exit(1); });
