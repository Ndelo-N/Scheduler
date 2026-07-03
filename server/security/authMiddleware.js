'use strict';
/**
 * authMiddleware.js — authorization layer (brick 4).
 *
 *   requireAuth(pool)              validates the session cookie → req.user, else 401
 *   requireRole(...roles)          req.user.role must be allowed, else 403
 *   requireSelfOrRole(...roles)    a caller may act on their OWN :uNumber; privileged
 *                                  roles may act on anyone (object-level / anti-IDOR)
 *   enforcePasswordChange          backstop: a must-change user is blocked from
 *                                  protected routes until they set a new password
 *
 * Authentication (who you are) is brick 3; this is authorization (what you may do).
 * Guards are ordered: requireAuth first (populates req.user), then role/ownership.
 */

const sessionStore = require('./sessionStore');
const { parseCookies, COOKIE_NAME, SESSION_TTL_MS } = require('./cookies');
const { normalizeUNumber } = require('./credentialVerifier');

function requireAuth(pool) {
  return async function requireAuthMw(req, res, next) {
    try {
      const token = parseCookies(req)[COOKIE_NAME];
      const user = await sessionStore.validateSession(pool, token, { slideMs: SESSION_TTL_MS });
      if (!user) return res.status(401).json({ error: 'Not authenticated' });
      req.user = user; // { id, uNumber, role, firstName, lastName, mustChangePassword }
      next();
    } catch (e) {
      console.error('requireAuth error:', e.message);
      return res.status(500).json({ error: 'Auth check failed' });
    }
  };
}

function requireRole(...allowed) {
  const set = new Set(allowed);
  return function requireRoleMw(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!set.has(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

/**
 * Allow when the caller holds a privileged role, OR the `:uNumber` in the path is
 * the caller's own. This is the object-level check that stops a student from
 * reading another student's records by editing the URL.
 * (Note: returns 403 on denial. Switch to 404 if you'd rather not reveal that the
 *  target resource exists — a small enumeration-hardening trade-off.)
 */
function requireSelfOrRole(...privilegedRoles) {
  const priv = new Set(privilegedRoles);
  return function requireSelfOrRoleMw(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (priv.has(req.user.role)) return next();
    const target = normalizeUNumber(req.params.uNumber);
    if (target && target === normalizeUNumber(req.user.uNumber)) return next();
    return res.status(403).json({ error: 'Forbidden' });
  };
}

/** Backstop for the must-change-password state (defense in depth alongside the
 *  mustChangePassword flag the client already sees on login/me). Mount on the
 *  protected group only — NOT on /api/auth, so the change-password route stays
 *  reachable. */
function enforcePasswordChange(req, res, next) {
  if (req.user && req.user.mustChangePassword) {
    return res.status(403).json({ error: 'Password change required', code: 'password_change_required' });
  }
  next();
}

module.exports = { requireAuth, requireRole, requireSelfOrRole, enforcePasswordChange };
