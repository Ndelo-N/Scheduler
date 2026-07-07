#!/usr/bin/env node
'use strict';
/**
 * Provision Postgres login accounts for all students in the Jul2026 form fixture.
 *
 *   npm run provision:form-students
 *   node scripts/provision-form-students.js [path/to/Jul2026-semester-responses.xlsx]
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { provisionAccount, normalizeUNumber } = require('../provision');
const { FormResponseImport } = require('../src/js/data/formResponseImport');

const DEFAULT_XLSX = path.join(
  __dirname,
  '../tests/fixtures/form-responses/Jul2026-semester-responses.xlsx'
);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'shift_scheduler',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: false
});

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  return { firstName: parts[0] || 'Student', lastName: parts.slice(1).join(' ') };
}

async function main() {
  const xlsxPath = path.resolve(process.argv[2] || DEFAULT_XLSX);
  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`Missing ${xlsxPath} — run: npm run generate:semester-form-data`);
  }

  await pool.query('SELECT 1');
  const parsed = FormResponseImport.parseXlsxArrayBuffer(fs.readFileSync(xlsxPath));
  const credentials = [];

  for (const st of parsed.students) {
    const uNumber = normalizeUNumber(st.studentNumber);
    const email = (st.email || `${uNumber}@tuks.co.za`).trim().toLowerCase();
    const { firstName, lastName } = splitName(st.name);
    const tempPassword = await provisionAccount(pool, {
      uNumber,
      email,
      role: 'student',
      firstName,
      lastName
    });
    credentials.push({ name: st.name, uNumber, email, tempPassword });
  }

  const credPath = path.join(path.dirname(xlsxPath), 'Jul2026-semester-credentials.txt');
  const lines = [
    '# Jul 2026 semester test accounts — temporary passwords (change on first login)',
    `# Generated ${new Date().toISOString()}`,
    ''
  ];
  for (const c of credentials) {
    lines.push(`${c.name}`);
    lines.push(`  u-Number: ${c.uNumber}`);
    lines.push(`  Email:    ${c.email}`);
    lines.push(`  Password: ${c.tempPassword}`);
    lines.push('');
  }
  fs.writeFileSync(credPath, lines.join('\n'), 'utf8');

  console.log(`\n✅ Provisioned ${credentials.length} student account(s)\n`);
  for (const c of credentials) {
    console.log(`  ${c.uNumber}  ${c.name}  →  ${c.tempPassword}`);
  }
  console.log(`\n  Credentials saved: ${credPath}`);
  console.log('  Sign in at http://localhost:3000 (AUTH_INSECURE_COOKIES=1 for HTTP)\n');
}

main()
  .catch((e) => {
    console.error('❌', e.message);
    console.error('   Ensure Postgres is running: npm run db:setup');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
