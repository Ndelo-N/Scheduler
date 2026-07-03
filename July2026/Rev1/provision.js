'use strict';
/**
 * provision.js — admin-only account provisioning with a TEMPORARY password.
 *
 * You (admin) already hold the roster of u-Numbers, so accounts are created here
 * rather than by student self-registration. Each provisioned account:
 *   • gets a random temp password (printed ONCE for you to hand over),
 *   • is flagged must_change_password = true (forced change on first login),
 *   • has its lockout state reset.
 *
 * Re-running for an existing email resets that account's password (a reset flow).
 *
 * Usage:
 *   node provision.js <uNumber|-> <email> <student|supervisor|admin> "First Last"
 *   node provision.js u12345678 s12345678@up.ac.za student "Thabo Mokoena"
 *   node provision.js -          admin2@up.ac.za    admin   "Second Admin"
 *
 * The core `provisionAccount(pool, opts)` takes an injected pg Pool so it can be
 * unit-tested against an in-memory Postgres.
 */

const crypto = require('crypto');
const passwordHasher = require('./server/security/passwordHasher');

const VALID_ROLES = new Set(['student', 'supervisor', 'admin']);

/** ~16 url-safe chars (~96 bits entropy). No ambiguous-character shaping needed
 *  because the user must change it on first login anyway. */
function generateTempPassword() {
  return crypto.randomBytes(12).toString('base64url');
}

function normalizeUNumber(u) {
  return String(u || '').trim().toLowerCase();
}

/**
 * @param {import('pg').Pool} pool
 * @param {{uNumber?:string,email:string,role:string,firstName?:string,lastName?:string}} opts
 * @returns {Promise<string>} the plaintext temporary password (show once)
 */
async function provisionAccount(pool, { uNumber, email, role, firstName, lastName }) {
  if (!email || typeof email !== 'string') throw new Error('email is required');
  if (!VALID_ROLES.has(role)) throw new Error(`role must be one of: ${[...VALID_ROLES].join(', ')}`);
  const u = normalizeUNumber(uNumber);
  if (role === 'student' && !u) throw new Error('student accounts require a u-Number');

  const tempPassword = generateTempPassword();
  const passwordHash = await passwordHasher.hash(tempPassword);

  await pool.query(
    `INSERT INTO users (email, password_hash, role, first_name, last_name, student_number,
                        is_active, email_verified, must_change_password,
                        failed_login_attempts, locked_until)
     VALUES ($1, $2, $3, $4, $5, $6, true, false, true, 0, NULL)
     ON CONFLICT (email) DO UPDATE SET
       password_hash        = EXCLUDED.password_hash,
       role                 = EXCLUDED.role,
       student_number       = EXCLUDED.student_number,
       must_change_password = true,
       failed_login_attempts = 0,
       locked_until         = NULL`,
    [email, passwordHash, role, firstName || '', lastName || '', u || null]
  );

  return tempPassword;
}

module.exports = { provisionAccount, generateTempPassword, normalizeUNumber, VALID_ROLES };

// ── CLI ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const { Pool } = require('pg');
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'shift_scheduler',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: false
  });

  const [, , uArg, email, role, name] = process.argv;
  if (!email || !role) {
    console.log('Usage: node provision.js <uNumber|-> <email> <student|supervisor|admin> "First Last"');
    process.exit(1);
  }
  const [firstName, ...rest] = String(name || '').trim().split(' ');
  const lastName = rest.join(' ');

  provisionAccount(pool, { uNumber: uArg === '-' ? '' : uArg, email, role, firstName, lastName })
    .then((temp) => {
      const uShown = role === 'student' ? ` (${normalizeUNumber(uArg)})` : '';
      console.log(`\n✅ Provisioned ${email}${uShown} as ${role}`);
      console.log(`   Temporary password: ${temp}`);
      console.log('   The user must change it on first login.\n');
    })
    .catch((e) => { console.error('❌', e.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
