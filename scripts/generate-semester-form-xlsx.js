#!/usr/bin/env node
'use strict';
/**
 * Build Jul 2026 semester Google Form-style .xlsx from the real UP responses export.
 * Keeps class-grid checkboxes and test times; shifts test dates into the new term.
 *
 *   node scripts/generate-semester-form-xlsx.js [source.xlsx] [output.xlsx]
 *
 * Default source: tests/fixtures/form-responses/Mar2026-source-responses.xlsx
 * Default output: tests/fixtures/form-responses/Jul2026-semester-responses.xlsx
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { FormResponseImport } = require('../src/js/data/formResponseImport');

const SEMESTER_START = '2026-07-20'; // Monday

/** Original Mar–May 2026 test dates → fictional Jul–Sep 2026 (same weekday). */
const DATE_MAP = {
  '2026-03-14': '2026-07-25',
  '2026-03-16': '2026-07-27',
  '2026-03-17': '2026-07-28',
  '2026-03-18': '2026-07-29',
  '2026-03-19': '2026-07-30',
  '2026-03-20': '2026-07-31',
  '2026-03-28': '2026-08-08',
  '2026-04-11': '2026-08-22',
  '2026-05-02': '2026-09-05',
  '2026-05-05': '2026-09-08',
  '2026-05-06': '2026-09-09',
  '2026-05-09': '2026-09-12'
};

function isoToExcelSerial(iso) {
  const ms = Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
    12, 0, 0
  );
  return ms / 86400000 + 25569;
}

function hhmmToExcelFraction(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h * 60 + m) / (24 * 60);
}

function mapTestDate(raw) {
  const iso = FormResponseImport.excelDateToISO(raw);
  if (!iso) return raw;
  return isoToExcelSerial(DATE_MAP[iso] || iso);
}

function shiftRowTests(row) {
  const out = { ...row };
  for (const group of FormResponseImport.TEST_GROUPS) {
    const [, dateKey, startKey, endKey] = group;
    if (!(dateKey in out) || out[dateKey] === '' || out[dateKey] == null) continue;
    out[dateKey] = mapTestDate(out[dateKey]);
    const start = FormResponseImport.excelTimeToHHMM(out[startKey]);
    const end = FormResponseImport.excelTimeToHHMM(out[endKey]);
    if (start) out[startKey] = hhmmToExcelFraction(start);
    if (end) out[endKey] = hhmmToExcelFraction(end);
  }
  return out;
}

function main() {
  const root = path.join(__dirname, '..');
  const defaultSource = path.join(root, 'tests/fixtures/form-responses/Mar2026-source-responses.xlsx');
  const defaultOut = path.join(root, 'tests/fixtures/form-responses/Jul2026-semester-responses.xlsx');

  const sourcePath = path.resolve(process.argv[2] || defaultSource);
  const outPath = path.resolve(process.argv[3] || defaultOut);

  if (!fs.existsSync(sourcePath)) {
    console.error('Source file not found:', sourcePath);
    console.error('Copy the UP responses .xlsx to that path or pass it as the first argument.');
    process.exit(1);
  }

  const wb = XLSX.readFile(sourcePath);
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  const shifted = rows.map((row, i) => {
    const next = shiftRowTests(row);
    next.Timestamp = isoToExcelSerial('2026-07-01') + (i * 0.001);
    return next;
  });

  const outWb = XLSX.utils.book_new();
  const outSheet = XLSX.utils.json_to_sheet(shifted, { header: Object.keys(rows[0]) });
  XLSX.utils.book_append_sheet(outWb, outSheet, sheetName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  XLSX.writeFile(outWb, outPath);

  const parsed = FormResponseImport.parseXlsxArrayBuffer(fs.readFileSync(outPath));
  console.log(`\n✅ Wrote ${outPath}`);
  console.log(`   Semester start: ${SEMESTER_START}`);
  console.log(`   Students: ${parsed.students.length}`);
  console.log('   Sample mapped test dates (Kiama):');
  for (const t of (parsed.students[0]?.testDates || []).slice(0, 4)) {
    console.log(`     ${t.subject} — ${t.date} ${t.start}–${t.end}`);
  }
  console.log('');
}

main();
