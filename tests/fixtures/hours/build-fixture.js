/**
 * F1 harness fixtures — idempotent builder (creates files only if missing).
 * Scenario mirrors tests/reconcile.smoke.js with UP student ids and real .xlsx.
 * Row-by-row worked-minute arithmetic is asserted in tests/harness/hours.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const FIXTURE_DIR = __dirname;

const HEADERS = [
  'Username',
  'First Name',
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

function dt(y, mo, d, h, mi, s = 0) {
  return new Date(y, mo - 1, d, h, mi, s);
}

function durationSerial(hours, minutes) {
  return new Date(1899, 11, 30, hours, minutes, 0);
}

function payrollRow(username, first, last, start, end, opts = {}) {
  const totalMin = opts.totalMinutes ?? null;
  const totalTime =
    totalMin != null ? durationSerial(Math.floor(totalMin / 60), totalMin % 60) : '';
  return [
    username,
    first,
    last,
    start,
    end ?? '',
    '150',
    totalTime,
    '0',
    '10.0.0.1',
    '10.0.0.2',
    opts.editedBy || '',
    opts.editorFirst || '',
    opts.editorLast || '',
    opts.dateEdited || '',
  ];
}

function writeIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) return false;
  fs.writeFileSync(filePath, content);
  return true;
}

function build() {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  const studentsPath = path.join(FIXTURE_DIR, 'students.json');
  const schedulePath = path.join(FIXTURE_DIR, 'schedule-2025-09.json');
  const swapsPath = path.join(FIXTURE_DIR, 'approved-swaps.json');
  const payrollPath = path.join(FIXTURE_DIR, 'DetailedPayroll.xlsx');

  writeIfMissing(
    studentsPath,
    JSON.stringify(
      [
        { id: 'u11111111', name: 'Alice Anderson', contracted_monthly_hours: 60 },
        { id: 'u22222222', name: 'Bob Baker', contracted_monthly_hours: 45 },
        { id: 'u33333333', name: 'Carol Carter', contracted_monthly_hours: 20 },
      ],
      null,
      2
    )
  );

  writeIfMissing(
    schedulePath,
    JSON.stringify(
      {
        id: '2025-09',
        year: 2025,
        month: 8,
        shifts: [
          { date: '2025-09-03', start: '06:30', end: '07:30', assignees: ['u11111111'] },
          { date: '2025-09-03', start: '07:30', end: '08:30', assignees: ['u11111111'] },
          { date: '2025-09-03', start: '08:30', end: '09:30', assignees: ['u11111111'] },
          { date: '2025-09-03', start: '09:30', end: '10:30', assignees: ['u22222222'] },
          { date: '2025-09-04', start: '06:30', end: '07:30', assignees: ['u11111111'] },
          { date: '2025-09-05', start: '06:30', end: '07:30', assignees: ['u11111111'] },
          { date: '2025-09-08', start: '06:30', end: '07:30', assignees: ['u22222222'] },
        ],
      },
      null,
      2
    )
  );

  writeIfMissing(
    swapsPath,
    JSON.stringify(
      [
        {
          status: 'approved',
          requesterId: 'u11111111',
          takerId: 'u33333333',
          fromShift: { date: '2025-09-05', start: '06:30' },
          createdAt: '2025-09-04T08:00:00.000Z',
        },
      ],
      null,
      2
    )
  );

  if (!fs.existsSync(payrollPath)) {
    const rows = [
      HEADERS,
      // Alice 09-03: 06:28→09:25, block [06:30,09:30] → 180 worked
      payrollRow(
        'u11111111',
        'Alice',
        'Anderson',
        dt(2025, 9, 3, 6, 28),
        dt(2025, 9, 3, 9, 25),
        { totalMinutes: 177 }
      ),
      // Bob 09-03: 09:40→10:34:59 (matches committed baseline naturalKey end)
      payrollRow(
        'u22222222',
        'Bob',
        'Baker',
        dt(2025, 9, 3, 9, 40),
        dt(2025, 9, 3, 10, 34, 59),
        { totalMinutes: 55 }
      ),
      // Carol 09-05 swap taker: 06:30→07:30 → 60 worked
      payrollRow(
        'u33333333',
        'Carol',
        'Carter',
        dt(2025, 9, 5, 6, 30),
        dt(2025, 9, 5, 7, 30),
        { totalMinutes: 60 }
      ),
      // Bob 09-08 admin-edited: 06:00→08:00 verbatim 120
      payrollRow(
        'u22222222',
        'Bob',
        'Baker',
        dt(2025, 9, 8, 6, 0),
        dt(2025, 9, 8, 8, 0),
        {
          totalMinutes: 120,
          editedBy: 'admin',
          editorFirst: 'Admin',
          editorLast: 'User',
          dateEdited: dt(2025, 9, 8, 9, 0),
        }
      ),
      // Alice 09-09 unrostered: 10:00→11:00 → 30 uncredited pool
      payrollRow(
        'u11111111',
        'Alice',
        'Anderson',
        dt(2025, 9, 9, 10, 0),
        dt(2025, 9, 9, 11, 0),
        { totalMinutes: 60 }
      ),
      // Unknown username → pending bucket
      payrollRow(
        'u99999999',
        'Dee',
        'Unknown',
        dt(2025, 9, 10, 12, 0),
        dt(2025, 9, 10, 13, 0),
        { totalMinutes: 60 }
      ),
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'report');
    XLSX.writeFile(wb, payrollPath);
  }
}

if (require.main === module) {
  build();
  console.log('Fixtures ready in', FIXTURE_DIR);
}

module.exports = { build };
