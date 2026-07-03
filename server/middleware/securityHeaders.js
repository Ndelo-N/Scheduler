'use strict';
/**
 * securityHeaders.js — response security headers. Hand-rolled (no dependency);
 * `helmet` is a drop-in alternative if you prefer.
 *
 * The CSP locks the dangerous directives (object-src, frame-ancestors, base-uri)
 * and pins everything to same-origin. script-src is 'self' only — no
 * 'unsafe-inline' — since all inline scripts and on* handlers have been
 * externalized/refactored to addEventListener (Phase 3 / F-11). style-src still
 * allows 'unsafe-inline' because the PWA applies dynamic per-item colors via
 * inline style attributes; CSS injection is low-risk with script-src locked.
 * FURTHER HARDENING: move dynamic colors to CSS custom properties / classes,
 * then drop 'unsafe-inline' from style-src too (see F-16).
 */

const DEFAULT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'"
].join('; ');

function securityHeaders({ csp = DEFAULT_CSP, hsts = true } = {}) {
  return function securityHeadersMw(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (csp) res.setHeader('Content-Security-Policy', csp);
    // HSTS only over TLS — never pin plain-HTTP dev/localhost to HTTPS.
    if (hsts && req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  };
}

module.exports = { securityHeaders, DEFAULT_CSP };
