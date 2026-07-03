'use strict';
const fs = require('fs');
/**
 * Postgres SSL configuration (F-05).
 * Production: verify the server certificate (rejectUnauthorized:true) to prevent
 * MITM. For an internal/institutional CA (e.g. UP), set DB_CA_CERT to the CA PEM
 * path so the chain validates without disabling verification.
 * Non-production: SSL disabled (local loopback dev).
 *
 * Fails CLOSED: if the CA isn't configured for an internal cert, the connection
 * errors loudly rather than silently accepting an unverified (MITM-able) peer.
 */
function dbSsl(env = process.env) {
  if (env.NODE_ENV !== 'production') return false;
  const cfg = { rejectUnauthorized: true };
  if (env.DB_CA_CERT) cfg.ca = fs.readFileSync(env.DB_CA_CERT, 'utf8');
  return cfg;
}

module.exports = { dbSsl };
