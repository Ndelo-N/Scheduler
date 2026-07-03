'use strict';
/**
 * sessionStore.js — server-side sessions backed by the user_sessions table.
 *
 * The cookie holds a high-entropy RAW token; the DB stores only its SHA-256 hash.
 * So a leaked user_sessions table does NOT hand an attacker live sessions (they'd
 * have only hashes). SHA-256 is appropriate here — the token is already 256 bits
 * of randomness, so a slow KDF buys nothing (unlike passwords).
 *
 * Sessions are revocable (delete the row) and use sliding expiry.
 */

const crypto = require('crypto');

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function generateToken() {
  return crypto.randomBytes(32).toString('base64url'); // ~256 bits
}
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Create a session. Returns the RAW token (for the cookie); DB keeps only the hash. */
async function createSession(pool, userId, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlMs);
  await pool.query(
    `INSERT INTO user_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [userId, hashToken(token), expiresAt.toISOString()]
  );
  return { token, expiresAt };
}

/** Validate a raw cookie token → the joined user (or null). Slides expiry forward. */
async function validateSession(pool, token, { slideMs = DEFAULT_TTL_MS } = {}) {
  if (!token || typeof token !== 'string') return null;
  const tokenHash = hashToken(token);
  const res = await pool.query(
    `SELECT s.expires_at, u.id, u.student_number, u.role,
            u.first_name, u.last_name, u.is_active, u.must_change_password
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = $1`,
    [tokenHash]
  );
  const row = res.rows[0];
  if (!row) return null;
  if (new Date(row.expires_at) <= new Date() || row.is_active === false) {
    await destroySession(pool, token);
    return null;
  }
  const newExpiry = new Date(Date.now() + slideMs);
  await pool.query(
    `UPDATE user_sessions SET last_accessed = $2, expires_at = $3 WHERE token = $1`,
    [tokenHash, new Date().toISOString(), newExpiry.toISOString()]
  );
  return {
    id: row.id,
    uNumber: row.student_number,
    role: row.role,
    firstName: row.first_name,
    lastName: row.last_name,
    mustChangePassword: row.must_change_password === true
  };
}

/** Revoke a single session (logout). */
async function destroySession(pool, token) {
  if (!token) return;
  await pool.query(`DELETE FROM user_sessions WHERE token = $1`, [hashToken(token)]);
}

/** Revoke ALL of a user's sessions (e.g. after a password change). */
async function destroyUserSessions(pool, userId) {
  await pool.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]);
}

/** Housekeeping: delete expired rows. Call on an interval. */
async function sweepExpired(pool) {
  const r = await pool.query(`DELETE FROM user_sessions WHERE expires_at <= $1`, [new Date().toISOString()]);
  return r.rowCount || 0;
}

module.exports = {
  createSession, validateSession, destroySession, destroyUserSessions,
  sweepExpired, generateToken, hashToken, DEFAULT_TTL_MS
};
