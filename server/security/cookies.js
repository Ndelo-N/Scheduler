'use strict';
/**
 * cookies.js — shared session-cookie config + helpers.
 *
 * Extracted so both routes/auth.js and security/authMiddleware.js can use these
 * without a circular import (auth.js now imports requireAuth from authMiddleware
 * for the change-password route; authMiddleware imports cookie helpers here).
 *
 * Cookie: httpOnly + Secure + SameSite=Lax, host-only (no Domain) → binds to the
 * single scheduler.local origin. Set AUTH_INSECURE_COOKIES=1 for plain-HTTP
 * localhost dev.
 */

const COOKIE_NAME = 'sid';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS) || 12 * 60 * 60 * 1000;
const SECURE_COOKIES = process.env.AUTH_INSECURE_COOKIES !== '1';

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieOptions(maxAgeMs) {
  return { httpOnly: true, secure: SECURE_COOKIES, sameSite: 'lax', path: '/', maxAge: maxAgeMs };
}

module.exports = { COOKIE_NAME, SESSION_TTL_MS, SECURE_COOKIES, parseCookies, cookieOptions };
