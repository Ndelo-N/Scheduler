'use strict';
/**
 * loginService.js — one place that owns a login attempt:
 *   verify credentials → (on success) reset lockout, upgrade hash if weak, open a
 *   session; (on failure) increment the failure counter and lock after a threshold.
 *
 * The route collapses every failure to one generic message (enumeration defense).
 */

const passwordHasher = require('./passwordHasher');
const { PasswordVerifier } = require('./credentialVerifier');
const sessionStore = require('./sessionStore');

const MAX_FAILED_ATTEMPTS = 5;               // lock after this many consecutive failures
const LOCK_DURATION_MS = 15 * 60 * 1000;     // 15 minutes

function makeFindByUNumber(pool) {
  return async (uNumber) => {
    const res = await pool.query(
      `SELECT id, student_number, password_hash, role, is_active,
              locked_until, failed_login_attempts, must_change_password
         FROM users WHERE student_number = $1`,
      [uNumber]
    );
    return res.rows[0] || null;
  };
}

async function attemptLogin(pool, { uNumber, password }, { sessionTtlMs } = {}) {
  const verifier = PasswordVerifier({ findByUNumber: makeFindByUNumber(pool) });
  const result = await verifier.verify({ uNumber, password });

  if (result.outcome === 'ok') {
    const user = result.user;
    // success clears the lockout state and records the login
    await pool.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = $2 WHERE id = $1`,
      [user.id, new Date().toISOString()]
    );
    // transparent upgrade when the stored hash uses weaker params than current
    // DEFAULTS (e.g. after we raise the scrypt work factor). Does NOT cover legacy
    // sha256 — those never verify, so they never reach here (re-provision them).
    if (passwordHasher.needsRehash(user.password_hash)) {
      const newHash = await passwordHasher.hash(password);
      await pool.query(
        `UPDATE users SET password_hash = $2, password_changed_at = $3 WHERE id = $1`,
        [user.id, newHash, new Date().toISOString()]
      );
    }
    const session = await sessionStore.createSession(pool, user.id, { ttlMs: sessionTtlMs });
    return {
      ok: true,
      user: { id: user.id, uNumber: user.student_number, role: user.role === 'supervisor' ? 'team-lead' : user.role },
      mustChangePassword: user.must_change_password === true,
      session
    };
  }

  if (result.outcome === 'bad_credentials') {
    // Increment the failure counter and lock after the threshold. No-op if the
    // u-Number doesn't exist (nothing to lock; the IP rate limiter covers spam).
    const u = String(uNumber || '').trim().toLowerCase();
    if (u) {
      await pool.query(
        `UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE student_number = $1`,
        [u]
      );
      const after = await pool.query(
        `SELECT failed_login_attempts FROM users WHERE student_number = $1`,
        [u]
      );
      const attempts = after.rows[0] && after.rows[0].failed_login_attempts;
      if (typeof attempts === 'number' && attempts >= MAX_FAILED_ATTEMPTS) {
        await pool.query(
          `UPDATE users SET locked_until = $2 WHERE student_number = $1`,
          [u, new Date(Date.now() + LOCK_DURATION_MS).toISOString()]
        );
      }
    }
    return { ok: false, reason: 'bad_credentials' };
  }

  if (result.outcome === 'locked') return { ok: false, reason: 'locked', until: result.until };
  if (result.outcome === 'inactive') return { ok: false, reason: 'inactive' };
  return { ok: false, reason: 'bad_credentials' };
}

module.exports = { attemptLogin, makeFindByUNumber, MAX_FAILED_ATTEMPTS, LOCK_DURATION_MS };
