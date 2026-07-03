'use strict';
/**
 * securityHeaders.js — response security headers. Hand-rolled (no dependency);
 * `helmet` is a drop-in alternative if you prefer.
 *
 * The CSP is a STARTER: it locks the dangerous directives (object-src,
 * frame-ancestors, base-uri) and pins everything to same-origin, but still allows
 * 'unsafe-inline' for scripts/styles so the current PWA — which has inline
 * scripts in index.html — keeps working. HARDENING PATH: externalize those inline
 * scripts/styles, then remove 'unsafe-inline' from script-src/style-src.
 */

const DEFAULT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",              // TODO: drop 'unsafe-inline' after externalizing inline scripts
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
