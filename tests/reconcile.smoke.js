/**
 * Smoke test for Reconcile (E2 acceptance criteria).
 * Run: node tests/reconcile.smoke.js
 *
 * Acceptance (prelude.md §0 / Prompt E2):
 *   - Hand-checked totals on a fixture (clocked Stud, adherence, flags, absences).
 *   - A swap does NOT false-flag absence/unrostered: the new assignee's session
 *     matches its slot, and the original assignee gets no phantom absence.
 *
 * Reconcile depends on EffectiveRoster, IdentityMap, WorkedHoursNormalizer and
 * PolicyFlags, so all five module sources are loaded into one shared `global`
 * object (each IIFE assigns global.X), then Reconcile.run is called with data
 * injected directly — no IndexedDB, no DOM, no monolith runtime.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ── Load all pipeline modules into one shared global ────────────────────────
const g = {};
for (const file of [
  'workedHoursNormalizer.js',
  'identityMap.js',
  'policyFlags.js',
  'effectiveRoster.js',
  'reconcile.js',
]) {
  const src = fs.readFileSync(path.join(__dirname, '../src/js/core', file), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('global', src)(g);
}
const Reconcile = g.Reconcile;

// ── Tiny assert harness (same style as effectiveRoster.smoke.js) ────────────
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

// ── Fixture builders ────────────────────────────────────────────────────────
const MONTH = '2025-09';

function entry(username, dateISO, startHM, endHM, opts = {}) {
  const shiftStartedISO = `${dateISO}T${startHM}:00`;
  const shiftEndedISO = endHM ? `${dateISO}T${endHM}:00` : null;
  return {
    naturalKey: `${username}|${shiftStartedISO}`,
    username,
    firstName: opts.firstName || '',
    lastName: opts.lastName || '',
    shiftStartedISO,
    shiftEndedISO,
    status: endHM ? 'complete' : 'open',
    edited: !!opts.edited,
    editedBy: opts.edited ? 'admin' : null,
    anomalies: opts.anomalies || [],
    dateISO,
    monthKey: dateISO.slice(0, 7),
    computedMinutes: null,
  };
}

const students = [
  { id: 'A', name: 'Alice' },
  { id: 'B', name: 'Bob' },
  { id: 'C', name: 'Carol' },
];

// September 2025 saved schedule (month is JS 0-indexed: 8 = September).
const schedule = {
  id: '2025-09',
  year: 2025,
  month: 8,
  shifts: [
    // A: one contiguous 3-slot block 06:30–09:30 on the 3rd.
    { date: '2025-09-03', start: '06:30', end: '07:30', assignees: ['A'] },
    { date: '2025-09-03', start: '07:30', end: '08:30', assignees: ['A'] },
    { date: '2025-09-03', start: '08:30', end: '09:30', assignees: ['A'] },
    // B: single slot 09:30–10:30 on the 3rd.
    { date: '2025-09-03', start: '09:30', end: '10:30', assignees: ['B'] },
    // A: rostered on the 4th but never clocks in → ABSENCE.
    { date: '2025-09-04', start: '06:30', end: '07:30', assignees: ['A'] },
    // A: rostered on the 5th but SWAPPED to C (approved swap below).
    { date: '2025-09-05', start: '06:30', end: '07:30', assignees: ['A'] },
    // B: single slot on the 8th — clocked via admin-edited (verbatim) entry.
    { date: '2025-09-08', start: '06:30', end: '07:30', assignees: ['B'] },
  ],
};

// Approved swap: A → C for the 2025-09-05 06:30 shift.
const approvedSwaps = [
  {
    status: 'approved',
    requesterId: 'A',
    takerId: 'C',
    fromShift: { date: '2025-09-05', start: '06:30' },
    createdAt: '2025-09-04T08:00:00.000Z',
  },
];

const timeEntries = [
  // A on the 3rd: in 06:28 → out 09:25, block [06:30,09:30] → worked 180, clean.
  entry('A', '2025-09-03', '06:28', '09:25'),
  // B on the 3rd: in 09:40 (late) → out 10:35, block [09:30,10:30] → worked 60, LATE_IN.
  entry('B', '2025-09-03', '09:40', '10:35'),
  // C on the 5th (the swap taker): in 06:30 → out 07:30 → worked 60, clean, NOT unrostered.
  entry('C', '2025-09-05', '06:30', '07:30'),
  // B on the 8th: admin-edited 06:00 → 08:00 → verbatim worked 120, EDITED, no LATE_IN.
  entry('B', '2025-09-08', '06:00', '08:00', { edited: true }),
  // A on the 9th: not rostered that day → UNROSTERED, worked not credited.
  entry('A', '2025-09-09', '10:00', '11:00'),
  // Unknown username: never silently dropped → pending bucket.
  entry('u99999999', '2025-09-03', '06:30', '07:30', { firstName: 'Dee', lastName: 'Unknown' }),
];

// ── Run ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n=== Reconcile smoke test ===\n');

  const result = await Reconcile.run({
    monthKey: MONTH,
    timeEntries,
    students,
    schedules: [schedule],
    approvedSwaps,
  });

  // ── Clocked Stud (monthly Σ worked) — hand-checked ─────────────────────────
  console.log('[ Clocked Stud monthly totals ]');
  assert('A worked = 180', result.clockedStud.byStudent.A.workedMinutes === 180);
  assert('B worked = 180 (60 + 120 verbatim)', result.clockedStud.byStudent.B.workedMinutes === 180);
  assert('C worked = 60 (swap taker)', result.clockedStud.byStudent.C.workedMinutes === 60);
  assert('total = 420', result.clockedStud.totalMinutes === 420);
  assert('A worked hours = 3', result.clockedStud.byStudent.A.workedHours === 3);

  // ── Adherence (Σscheduled − Σworked per student) — hand-checked ─────────────
  console.log('\n[ Adherence per-student aggregates ]');
  const ad = result.adherence.byStudent;
  assert('A scheduled 240, worked 180, delta 60', ad.A.scheduledMinutes === 240 && ad.A.workedMinutes === 180 && ad.A.deltaMinutes === 60);
  assert('B scheduled 120, worked 180, delta -60 (overtime)', ad.B.scheduledMinutes === 120 && ad.B.workedMinutes === 180 && ad.B.deltaMinutes === -60);
  assert('C scheduled 60, worked 60, delta 0', ad.C.scheduledMinutes === 60 && ad.C.workedMinutes === 60 && ad.C.deltaMinutes === 0);

  // ── Flags ──────────────────────────────────────────────────────────────────
  console.log('\n[ Flagged sessions ]');
  const flagsFor = (uname, date) =>
    result.flaggedSessions.filter((f) => f.username === uname && f.dateISO === date);
  assert('B 09-03 flagged LATE_IN', flagsFor('B', '2025-09-03').some((f) => f.flags.includes('LATE_IN')));
  assert('B 09-08 flagged EDITED', flagsFor('B', '2025-09-08').some((f) => f.flags.includes('EDITED')));
  assert('B 09-08 NOT flagged LATE_IN (admin bypass)', !flagsFor('B', '2025-09-08').some((f) => f.flags.includes('LATE_IN')));
  assert('A 09-09 flagged UNROSTERED', flagsFor('A', '2025-09-09').some((f) => f.flags.includes('UNROSTERED')));
  assert('exactly 3 flagged sessions', result.flaggedSessions.length === 3);

  // ── Absence ──────────────────────────────────────────────────────────────
  console.log('\n[ Absences ]');
  assert('exactly 1 absence', result.absences.length === 1);
  assert('absence is A on 09-04 06:30', result.absences[0].studentId === 'A' && result.absences[0].date === '2025-09-04' && result.absences[0].start === '06:30');

  // ── THE KEY GUARANTEE: swap does not false-flag absence/unrostered ─────────
  console.log('\n[ Swap does not false-flag (A→C on 09-05) ]');
  assert('C 09-05 NOT flagged UNROSTERED', !flagsFor('C', '2025-09-05').some((f) => f.flags.includes('UNROSTERED')));
  assert('C 09-05 not flagged at all (clean)', flagsFor('C', '2025-09-05').length === 0);
  assert('no absence for A on 09-05 (swapped away)', !result.absences.some((a) => a.studentId === 'A' && a.date === '2025-09-05'));
  assert('no absence for C on 09-05 (clocked it)', !result.absences.some((a) => a.studentId === 'C' && a.date === '2025-09-05'));

  // ── Pending identity ─────────────────────────────────────────────────────
  console.log('\n[ Pending identity bucket ]');
  assert('1 pending username', result.pending.length === 1);
  assert('pending is u99999999', result.pending[0].username === 'u99999999');
  assert('pending session not credited to any student', result.clockedStud.byStudent.u99999999 === undefined);

  // ── Determinism: two runs are byte-identical ──────────────────────────────
  console.log('\n[ Determinism ]');
  const a = JSON.stringify(await Reconcile.run({ monthKey: MONTH, timeEntries, students, schedules: [schedule], approvedSwaps }));
  const b = JSON.stringify(await Reconcile.run({ monthKey: MONTH, timeEntries, students, schedules: [schedule], approvedSwaps }));
  assert('two runs identical', a === b);

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  process.exitCode = fail > 0 ? 1 : 0;
})();
