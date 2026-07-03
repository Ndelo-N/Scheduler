'use strict';
/**
 * passwordHasher.js — secure password hashing for the auth server.
 *
 * Replaces the insecure `crypto.createHash('sha256')` in setup.js. SHA-256 is a
 * fast, UNSALTED hash: a stolen users table is crackable with rainbow tables /
 * GPU brute force in minutes. This uses **scrypt** — memory-hard, per-password
 * random salt, tunable work factor — via Node's built-in `crypto` (no native
 * build step, runs anywhere Node runs).
 *
 * Stored format (self-describing, so parameters can be raised later without
 * breaking existing hashes):
 *     scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>
 *
 * OWASP note: scrypt is the #2 recommended password KDF (Argon2id is #1). If you
 * later add the `argon2` npm package, add an 'argon2$...' branch to verify() and
 * switch DEFAULTS.algo; old scrypt hashes keep verifying and upgrade on next login.
 */

const crypto = require('crypto');

// Work factors. N=2^15 is a solid login-server balance (~tens of ms/verify).
// 128 * N * r bytes of memory are used, so maxmem must exceed that.
const DEFAULTS = Object.freeze({ N: 32768, r: 8, p: 1, keylen: 32, saltBytes: 16 });
const MAXMEM = 128 * DEFAULTS.N * DEFAULTS.r * 3; // generous headroom over 128*N*r

const MIN_PASSWORD_LENGTH = 12; // NIST 800-63B favours length over composition rules

function scryptAsync(password, salt, N, r, p, keylen) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, { N, r, p, maxmem: MAXMEM }, (err, dk) => {
      if (err) reject(err);
      else resolve(dk);
    });
  });
}

/** Hash a plaintext password → self-describing encoded string. */
async function hash(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  const { N, r, p, keylen, saltBytes } = DEFAULTS;
  const salt = crypto.randomBytes(saltBytes);
  const dk = await scryptAsync(password, salt, N, r, p, keylen);
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${dk.toString('base64')}`;
}

/** Verify a plaintext password against a stored encoded string (timing-safe). */
async function verify(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt, expected;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let actual;
  try {
    actual = await scryptAsync(password, salt, N, r, p, expected.length);
  } catch {
    return false;
  }
  // Lengths equal by construction (keylen = expected.length), but guard anyway:
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

/** True if a stored hash was made with weaker params than current DEFAULTS
 *  (or a different algo) → re-hash transparently on the user's next login. */
function needsRehash(stored) {
  if (typeof stored !== 'string') return true;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true; // non-scrypt (e.g. legacy sha256) → upgrade
  const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
  return N < DEFAULTS.N || r < DEFAULTS.r || p < DEFAULTS.p;
}

/** Basic password strength gate. Extend with a breached-password check (k-anon
 *  Pwned Passwords range API) when the server has outbound HTTPS available. */
function validateStrength(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  return { ok: true };
}

module.exports = { hash, verify, needsRehash, validateStrength, DEFAULTS, MIN_PASSWORD_LENGTH };
