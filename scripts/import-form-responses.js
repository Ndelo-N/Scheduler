#!/usr/bin/env node
'use strict';
/**
 * Preview or validate a Google Form .xlsx export (UP class schedule + tests).
 *
 *   node scripts/import-form-responses.js path/to/responses.xlsx
 *   node scripts/import-form-responses.js path/to/responses.xlsx --json
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { FormResponseImport } = require('../src/js/data/formResponseImport');

function main() {
  const file = process.argv[2];
  const asJson = process.argv.includes('--json');
  if (!file) {
    console.error('Usage: node scripts/import-form-responses.js <responses.xlsx> [--json]');
    process.exit(1);
  }

  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error('File not found:', abs);
    process.exit(1);
  }

  const buf = fs.readFileSync(abs);
  const parsed = FormResponseImport.parseXlsxArrayBuffer(buf);

  if (asJson) {
    console.log(JSON.stringify(parsed, null, 2));
    return;
  }

  console.log(`Form import preview — ${parsed.students.length} student(s)\n`);
  if (parsed.warnings.length) {
    console.log('Warnings:');
    parsed.warnings.forEach((w) => console.log('  •', w));
    console.log('');
  }

  for (const st of parsed.students) {
    console.log(`── ${st.name} (${st.studentNumber || 'no u-number'})`);
    console.log(`   Email: ${st.email || '—'}`);
    console.log(`   Weekly blocks: ${st.availability.weekly.length}`);
    for (const w of st.availability.weekly.slice(0, 6)) {
      console.log(`     ${w.day} ${w.start}–${w.end}`);
    }
    if (st.availability.weekly.length > 6) {
      console.log(`     … +${st.availability.weekly.length - 6} more`);
    }
    console.log(`   Tests: ${st.testDates.length}`);
    for (const t of st.testDates) {
      console.log(`     ${t.subject} — ${t.date} ${t.start}–${t.end}`);
    }
    console.log('');
  }
}

main();
