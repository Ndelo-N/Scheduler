'use strict';
/**
 * credentialVerifier.js — the seam that keeps u-Number+password today and lets
 * institutional SSO drop in later WITHOUT touching session issuance or routing.
 *
 * Every verifier answers the same question: "given these credentials, which
 * verified u-Number is this?" — returning a small outcome object. The login
 * service then runs one identical path (lockout counters, session cookie, role).
 *
 *   Today:  PasswordVerifier  ({ uNumber, password })  -> checks scrypt hash
 *   Future: OidcVerifier      ({ idToken })            -> validates institutional token
 *
 * Outcomes (the ROUTE collapses every non-ok case to one generic user-facing
 * message, so a guessable u-Number can't be enumerated):
 *   { outcome:'ok', user }               success
 *   { outcome:'bad_credentials' }        unknown u-Number OR wrong password (indistinguishable)
 *   { outcome:'locked', until }          account currently locked (too many failures)
 *   { outcome:'inactive' }               account disabled
 */

const passwordHasher = require('./passwordHasher');

// A precomputed scrypt hash of a random string. When a u-Number is unknown we
// still run a verify against this so response timing does not reveal whether the
// account exists (enumeration defense). Computed lazily once.
let DUMMY_HASH = null;
async function dummyVerify(password) {
  if (!DUMMY_HASH) DUMMY_HASH = await passwordHasher.hash(require('crypto').randomBytes(24).toString('hex'));
  await passwordHasher.verify(password || '', DUMMY_HASH);
}

function normalizeUNumber(u) {
  return String(u || '').trim().toLowerCase();
}

/** Call once at server startup so the first unknown-u# login isn't slower than
 *  the rest (fully flattens the enumeration-timing signal). */
async function warmup() {
  await dummyVerify('warmup');
}

/**
 * PasswordVerifier
 * @param {object} deps
 * @param {(uNumber:string)=>Promise<object|null>} deps.findByUNumber
 *        Resolves the user row: { id, student_number, password_hash, role,
 *        is_active, locked_until, ... } or null.
 */
function PasswordVerifier({ findByUNumber }) {
  if (typeof findByUNumber !== 'function') throw new Error('findByUNumber is required');

  return {
    method: 'password',
    async verify(credentials) {
      const uNumber = normalizeUNumber(credentials && credentials.uNumber);
      const password = credentials && credentials.password;
      if (!uNumber || typeof password !== 'string' || password.length === 0) {
        await dummyVerify(password);
        return { outcome: 'bad_credentials' };
      }

      const user = await findByUNumber(uNumber);
      if (!user) {
        await dummyVerify(password);            // equalize timing vs. the "found" path
        return { outcome: 'bad_credentials' };
      }

      // Respect an existing lock BEFORE spending a hash verify.
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        return { outcome: 'locked', until: user.locked_until };
      }
      if (user.is_active === false) {
        await dummyVerify(password);
        return { outcome: 'inactive' };
      }

      const ok = await passwordHasher.verify(password, user.password_hash);
      if (!ok) return { outcome: 'bad_credentials' };

      return { outcome: 'ok', user };
    }
  };
}

/**
 * OidcVerifier — FUTURE institutional SSO. Same interface, same outcomes, so the
 * login service is unchanged. Left as a documented stub: validate the ID token
 * (issuer, audience, signature via JWKS, expiry, nonce), then map a token claim
 * (e.g. a student-number claim, or email→roster lookup) to the local u-Number.
 */
function OidcVerifier(/* { issuer, audience, jwks, mapClaimToUNumber, findByUNumber } */) {
  return {
    method: 'oidc',
    async verify(/* { idToken } */) {
      throw new Error('OidcVerifier not implemented yet — password login is the current method');
    }
  };
}

module.exports = { PasswordVerifier, OidcVerifier, normalizeUNumber, warmup };
