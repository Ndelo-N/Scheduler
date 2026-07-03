/**
 * Smoke test for PayrollParser (C1 acceptance criteria).
 * Run: node tests/payrollParser.smoke.js
 */
'use strict';

const src = require('fs').readFileSync(
  require('path').join(__dirname, '../src/js/core/payrollParser.js'),
  'utf8'
);

const g = {};
(new Function('global', src))(g); // eslint-disable-line no-new-func

// ── Minimal SheetJS mock ───────────────────────────────────────────────────

const HEADERS = [
  'Username',
  'First\u00a0Name',     // non-breaking space — must be normalised
  'Last Name',
  'Shift Started',
  'Shift Ended',
  'Pay Rate',
  'Total Time',
  'Total Pay',
  'Sign On IP Address',
  'Sign Out IP Address',
  'Edited By',
  "Editor's First Name",
  "Editor's Last Name",
  'Date Edited',
];

// Jane: complete session, 2 h 30 min, no admin edit
// Total Time mock: Date(1899-12-30 02:30) → 150 min
const janeRow = [
  'u12345678', 'Jane', 'Doe',
  new Date(2025, 2, 14, 9, 30, 0),   // Shift Started  09:30
  new Date(2025, 2, 14, 12, 0, 0),   // Shift Ended    12:00 → 150 min
  '150',
  new Date(1899, 11, 30, 2, 30, 0),  // Total Time  2:30 → 150 min
  '375',
  '192.168.1.10', '10.0.0.1',         // IPs — must be dropped
  '', '', '', '',
];

// Bob: open session
const bobRow = [
  'u87654321', 'Bob', 'Smith',
  new Date(2025, 2, 14, 8, 0, 0),    // Shift Started
  '',                                 // Shift Ended — open
  '150', '', '0',
  '10.0.0.2', '10.0.0.3',
  '', '', '', '',
];

// Admin-edited row with a duration mismatch so we also cover DURATION_MISMATCH
// Total Time claims 60 min but clock diff is 90 min
const adminRow = [
  'u11111111', 'Admin', 'Edit',
  new Date(2025, 2, 14, 10, 0, 0),
  new Date(2025, 2, 14, 11, 30, 0),  // 90 min actual
  '150',
  new Date(1899, 11, 30, 1, 0, 0),   // Total Time 60 min → mismatch
  '225',
  '192.168.2.1', '10.0.0.4',
  'AdminUser', 'Admin', 'User',       // Edited By non-empty
  new Date(2025, 2, 15, 9, 0, 0),
];

g.XLSX = {
  read: () => ({ SheetNames: ['report'], Sheets: { report: {} } }),
  utils: {
    sheet_to_json: () => [HEADERS, janeRow, bobRow, adminRow],
  },
};

const { entries, warnings, sheetName } = g.PayrollParser.parseWorkbook(
  new ArrayBuffer(4)
);

// ── Assertions ─────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function assert(label, condition) {
  if (condition) {
    console.log('  PASS', label);
    pass++;
  } else {
    console.error('  FAIL', label);
    fail++;
  }
}

console.log('\n=== PayrollParser smoke test ===\n');

// Locate entries by username (sorted, so order may vary)
const jane  = entries.find((e) => e.username === 'u12345678');
const bob   = entries.find((e) => e.username === 'u87654321');
const admin = entries.find((e) => e.username === 'u11111111');

console.log('[ Sheet ]');
assert('sheetName is "report"', sheetName === 'report');

console.log('\n[ IP fields ]');
assert('Jane has no Sign On IP field',  !Object.keys(jane).some((k) => /ip/i.test(k)));
assert('Bob has no Sign Out IP field',  !Object.keys(bob).some((k) => /ip/i.test(k)));

console.log('\n[ Header normalisation ]');
assert('Jane firstName parsed correctly (\\u00a0 header)', jane.firstName === 'Jane');

console.log('\n[ Complete session — Jane ]');
assert('status complete',             jane.status === 'complete');
assert('computedMinutes = 150',       jane.computedMinutes === 150);
assert('no anomalies',                jane.anomalies.length === 0);
assert('edited = false',              jane.edited === false);
assert('editedBy = null',             jane.editedBy === null);
assert('shiftStartedISO local',       jane.shiftStartedISO === '2025-03-14T09:30:00');
assert('shiftEndedISO local',         jane.shiftEndedISO   === '2025-03-14T12:00:00');
assert('monthKey',                    jane.monthKey === '2025-03');
assert('dateISO',                     jane.dateISO === '2025-03-14');
assert('naturalKey',                  jane.naturalKey === 'u12345678|2025-03-14T09:30:00');

console.log('\n[ Open session — Bob ]');
assert('status open',                 bob.status === 'open');
assert('OPEN_SESSION flag',           bob.anomalies.includes('OPEN_SESSION'));
assert('computedMinutes null',        bob.computedMinutes === null);
assert('shiftEndedISO null',          bob.shiftEndedISO === null);

console.log('\n[ Admin-edited row ]');
assert('edited = true',               admin.edited === true);
assert('editedBy populated',          admin.editedBy === 'AdminUser');
assert('DURATION_MISMATCH flagged',   admin.anomalies.includes('DURATION_MISMATCH'));
assert('warning emitted for mismatch',
  warnings.some((w) => w.includes('u11111111')));

console.log('\n[ Deterministic sort ]');
const usernames = entries.map((e) => e.username);
assert('sorted by username ASC',
  JSON.stringify(usernames) === JSON.stringify([...usernames].sort()));

console.log('\n[ Prototype pollution ]');
// __proto__ header must not pollute Object.prototype
const poisonHeaders = ['__proto__', 'constructor', 'toString'];
const poisonG = {};
(new Function('global', src))(poisonG);
poisonG.XLSX = {
  read: () => ({ SheetNames: ['report'], Sheets: { report: {} } }),
  utils: {
    sheet_to_json: () => [
      [...poisonHeaders, ...HEADERS],
      [...Array(poisonHeaders.length).fill('pwned'), ...janeRow],
    ],
  },
};
poisonG.PayrollParser.parseWorkbook(new ArrayBuffer(4));
assert('Object.prototype not polluted', ({}).poisoned === undefined);
assert('({}).toString is still a function', typeof ({}).toString === 'function');

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
process.exitCode = fail > 0 ? 1 : 0;
