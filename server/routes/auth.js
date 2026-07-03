'use strict';
/**
 * routes/auth.js — the authentication endpoints.
 *
 *   POST /api/auth/login   { uNumber, password } → sets an httpOnly session cookie
 *   POST /api/auth/logout                        → revokes the session, clears cookie
 *   GET  /api/auth/me                            → the current user (or 401)
 *
 * Cookie: httpOnly + Secure + SameSite=Lax, host-only (no Domain), so it binds to
 * scheduler.local alone. Set AUTH_INSECURE_COOKIES=1 for plain-HTTP localhost dev.
 */

const express = require('express');
const loginService = require('../security/loginService');
const sessionStore = require('../security/sessionStore');
const passwordHasher = require('../security/passwordHasher');
const { requireAuth } = require('../security/authMiddleware');
const { createRateLimiter } = require('../rateLimit');
const { COOKIE_NAME, SESSION_TTL_MS, parseCookies, cookieOptions } = require('../security/cookies');

function createAuthRouter(pool) {
  const router = express.Router();
  const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

  router.post('/login', loginLimiter, async (req, res) => {
    const { uNumber, password } = req.body || {};
    if (typeof uNumber !== 'string' || typeof password !== 'string' || !uNumber || !password) {
      return res.status(400).json({ error: 'uNumber and password are required' });
    }
    try {
      const result = await loginService.attemptLogin(pool, { uNumber, password }, { sessionTtlMs: SESSION_TTL_MS });
      if (!result.ok) {
        // Enumeration-safe: bad_credentials / locked / inactive all return the SAME
        // 401 with the SAME body, so a guessable u-Number can't be probed.
        return res.status(401).json({ error: 'Invalid u-Number or password' });
      }
      res.cookie(COOKIE_NAME, result.session.token, cookieOptions(SESSION_TTL_MS));
      return res.json({ user: result.user, mustChangePassword: result.mustChangePassword });
    } catch (e) {
      console.error('login error:', e.message);
      return res.status(500).json({ error: 'Login failed' });
    }
  });

  router.post('/logout', async (req, res) => {
    const token = parseCookies(req)[COOKIE_NAME];
    try { await sessionStore.destroySession(pool, token); } catch { /* idempotent */ }
    res.clearCookie(COOKIE_NAME, cookieOptions(0));
    return res.status(204).end();
  });

  router.get('/me', async (req, res) => {
    const token = parseCookies(req)[COOKIE_NAME];
    const user = await sessionStore.validateSession(pool, token, { slideMs: SESSION_TTL_MS });
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    return res.json({
      user: {
        id: user.id,
        uNumber: user.uNumber,
        role: user.role,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim()
      },
      mustChangePassword: user.mustChangePassword
    });
  });

  // Change password. Reachable by must-change users (it is NOT behind
  // enforcePasswordChange), but still requires a valid session. On success:
  // rotate the hash, clear the must-change flag, revoke ALL of the user's
  // sessions (kills any stolen session), then re-issue a fresh cookie for the
  // caller so they stay logged in.
  router.post('/change-password', requireAuth(pool), async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string'
        || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    try {
      const row = (await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id])).rows[0];
      if (!row) return res.status(401).json({ error: 'Not authenticated' });

      if (!(await passwordHasher.verify(currentPassword, row.password_hash))) {
        return res.status(403).json({ error: 'Current password is incorrect' });
      }
      const strength = passwordHasher.validateStrength(newPassword);
      if (!strength.ok) return res.status(400).json({ error: strength.reason });
      if (await passwordHasher.verify(newPassword, row.password_hash)) {
        return res.status(400).json({ error: 'New password must differ from the current one' });
      }

      const newHash = await passwordHasher.hash(newPassword);
      await pool.query(
        `UPDATE users SET password_hash = $2, must_change_password = false,
                          password_changed_at = $3, failed_login_attempts = 0, locked_until = NULL
         WHERE id = $1`,
        [req.user.id, newHash, new Date().toISOString()]
      );

      // Revoke every session (including the current one), then mint a fresh one.
      await sessionStore.destroyUserSessions(pool, req.user.id);
      const session = await sessionStore.createSession(pool, req.user.id, { ttlMs: SESSION_TTL_MS });
      res.cookie(COOKIE_NAME, session.token, cookieOptions(SESSION_TTL_MS));
      return res.json({ ok: true });
    } catch (e) {
      console.error('change-password error:', e.message);
      return res.status(500).json({ error: 'Could not change password' });
    }
  });

  return router;
}

module.exports = { createAuthRouter };
