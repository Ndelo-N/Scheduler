'use strict';
/**
 * rateLimit.js — a small fixed-window in-memory rate limiter, enough for a single
 * always-on server. For multiple processes, swap for `express-rate-limit` backed
 * by a shared store; the middleware signature is the same.
 */

function createRateLimiter({ windowMs, max, keyGen } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  // opportunistic cleanup so the map doesn't grow unbounded
  function sweep(now) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    if (hits.size > 5000) sweep(now);
    const key = keyGen ? keyGen(req) : (req.ip || (req.socket && req.socket.remoteAddress) || 'unknown');

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    }
    next();
  };
}

module.exports = { createRateLimiter };
