'use strict';
/**
 * Provision a fixed test student for local auth-server dev.
 *
 * Defaults align with the F1 harness fixture student Alice (u11111111).
 * Re-running resets the temp password (same as provision.js ON CONFLICT).
 *
 * Usage:
 *   npm run provision:test-student
 *
 * Environment overrides:
 *   TEST_STUDENT_UNUMBER  (default: u11111111)
 *   TEST_STUDENT_EMAIL    (default: u11111111@test.lab)
 *   TEST_STUDENT_NAME     (default: Alice Anderson)
 */

require('dotenv').config();

const { Pool } = require('pg');
const { provisionAccount, normalizeUNumber } = require('../provision');

const uNumber = process.env.TEST_STUDENT_UNUMBER || 'u11111111';
const email = process.env.TEST_STUDENT_EMAIL || `${normalizeUNumber(uNumber)}@test.lab`;
const fullName = process.env.TEST_STUDENT_NAME || 'Alice Anderson';
const [firstName, ...rest] = fullName.trim().split(/\s+/);
const lastName = rest.join(' ') || 'Student';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'shift_scheduler',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: false,
});

async function main() {
  await pool.query('SELECT 1');
  const tempPassword = await provisionAccount(pool, {
    uNumber,
    email,
    role: 'student',
    firstName,
    lastName,
  });

  console.log('\n✅ Test student provisioned\n');
  console.log(`  u-Number:  ${normalizeUNumber(uNumber)}`);
  console.log(`  Email:     ${email}`);
  console.log(`  Name:      ${firstName} ${lastName}`.trim());
  console.log(`  Password:  ${tempPassword}`);
  console.log('\n  Sign in at http://localhost:3000 (set AUTH_INSECURE_COOKIES=1 for plain HTTP).');
  console.log('  You must change the password on first login.\n');
}

main()
  .catch((e) => {
    console.error('❌ Failed to provision test student:', e.message);
    console.error('   Run: npm run db:setup');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
