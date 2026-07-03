'use strict';
/**
 * server/index.js — Rev1 auth bootstrap + scoped PWA hosting.
 *
 * Requires Postgres (run `npm run db:setup` then `node provision.js` for accounts).
 * Plain HTTP localhost: set AUTH_INSECURE_COOKIES=1.
 * TLS lab: see Documentation/Brick7_TLS_Runbook.md
 */

const path = require('path');
const { Pool } = require('pg');
const { createApp } = require('./app');
const { buildServer } = require('./httpsServer');
const { warmup } = require('./security/credentialVerifier');
const sessionStore = require('./security/sessionStore');

require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'shift_scheduler',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Default: serve PWA from repo root with staticGuard (see server/app.js).
// Production: set PWA_DIR to a scoped build directory (e.g. ./public).
const PWA_DIR = process.env.PWA_DIR || path.join(__dirname, '..');
const app = createApp(pool, { pwaDir: PWA_DIR });

const PORT = Number(process.env.PORT || 3000);
const { server, secure } = buildServer(app, {
  tlsKey: process.env.TLS_KEY,
  tlsCert: process.env.TLS_CERT,
});

async function start() {
  await pool.query('SELECT 1');
  await warmup();
  await new Promise((resolve, reject) => {
    server.listen(PORT, (err) => (err ? reject(err) : resolve()));
  });
  console.log(`Auth server on :${PORT} (${secure ? 'HTTPS' : 'HTTP — set AUTH_INSECURE_COOKIES=1 for cookie login on plain HTTP'})`);
  console.log(`PWA static root: ${path.resolve(PWA_DIR)}`);
  console.log(`Health: http${secure ? 's' : ''}://localhost:${PORT}/api/health`);
  setInterval(() => sessionStore.sweepExpired(pool).catch(() => {}), 60 * 60 * 1000);
}

async function shutdown() {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await pool.end();
}

if (require.main === module) {
  start().catch((e) => {
    console.error('Server failed to start:', e.message);
    console.error('Ensure Postgres is running and run: npm run db:setup');
    process.exit(1);
  });
  process.on('SIGTERM', () => shutdown().then(() => process.exit(0)));
  process.on('SIGINT', () => shutdown().then(() => process.exit(0)));
}

module.exports = { app, pool, start, shutdown, createApp };
