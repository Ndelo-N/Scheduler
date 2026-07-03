'use strict';
/* Phase 5 — SchedulingEngine STATEFUL correctness (hours accumulation + cap invariants).
 * Run: node tests/schedulingEngineState.smoke.js
 * Dates chosen in Sept/Oct 2025. Sept 7 2025 is a Sunday (getWeekStart uses Sunday). */
const fs = require('fs'), path = require('path');
const shim = {};
const load = (f) => new Function('window', fs.readFileSync(path.join(__dirname, '../src/js/core', f), 'utf8'))(shim);
load('utils.js'); load('assessment.js');
globalThis.SchedulerUtils = shim.SchedulerUtils;
globalThis.AssessmentManager = shim.AssessmentManager;
load('schedulingEngine.js');
const SchedulingEngine = shim.SchedulingEngine;

const ALL_WEEK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  .map(day => ({ day, start: '00:00', end: '23:59' }));
const mkStudent = (id, weeklyMax, monthlyMax) => ({
  id, name: id, weekly_max_hours: weeklyMax, contracted_monthly_hours: monthlyMax,
  availability: { weekly: ALL_WEEK, unavailable_dates: [] },
});
const mkShift = (id, date, start, end, opts = {}) => ({
  id, date, start, end,
  assignees: opts.assignees || [], required: opts.required ?? 1,
  maxCapacity: opts.maxCapacity ?? opts.required ?? 1, status: 'pending',
  isOpening: false, isClosing: false,
});

// ── Build state ──────────────────────────────────────────────────────────────
const students = [
  mkStudent('wk', 18, 72),
  mkStudent('mo', 40, 100),
  mkStudent('over', 10, 40),
  mkStudent('cap', 18, 72),
  mkStudent('capm', 40, 10),
];
const shifts = {
  // 'wk' — week of Sun 2025-09-07 .. Sat 2025-09-13, plus Sun 2025-09-14 (next week)
  s1: mkShift('s1', '2025-09-08', '09:00', '13:00', { assignees: ['wk'] }),   // Mon 4h
  s2: mkShift('s2', '2025-09-10', '09:00', '12:00', { assignees: ['wk'] }),   // Wed 3h
  s3: mkShift('s3', '2025-09-13', '09:00', '14:00', { assignees: ['wk'] }),   // Sat 5h (same week)
  s4: mkShift('s4', '2025-09-14', '10:00', '15:00', { assignees: ['wk'] }),   // Sun 5h (NEXT week)
  // 'mo' — month boundary
  m1: mkShift('m1', '2025-09-05', '09:00', '12:00', { assignees: ['mo'] }),   // Sep 3h
  m2: mkShift('m2', '2025-09-30', '09:00', '13:00', { assignees: ['mo'] }),   // Sep 4h
  m3: mkShift('m3', '2025-10-01', '09:00', '13:00', { assignees: ['mo'] }),   // Oct 4h
  // 'over' — over-assigned in one week (12h > 10 max)
  o1: mkShift('o1', '2025-09-08', '08:00', '14:00', { assignees: ['over'] }), // Mon 6h
  o2: mkShift('o2', '2025-09-09', '08:00', '14:00', { assignees: ['over'] }), // Tue 6h
  // 'cap' — 15h already this week (Mon4 Tue4 Wed4 Thu3)
  c1: mkShift('c1', '2025-09-08', '09:00', '13:00', { assignees: ['cap'] }),  // 4h
  c2: mkShift('c2', '2025-09-09', '09:00', '13:00', { assignees: ['cap'] }),  // 4h
  c3: mkShift('c3', '2025-09-10', '09:00', '13:00', { assignees: ['cap'] }),  // 4h
  c4: mkShift('c4', '2025-09-11', '09:00', '12:00', { assignees: ['cap'] }),  // 3h
  // candidate shifts for 'cap' (Fri 09-12), initially unassigned
  cFit: mkShift('cFit', '2025-09-12', '09:00', '12:00', {}),                  // +3h → 18 (==max, ok)
  cOver: mkShift('cOver', '2025-09-12', '14:00', '18:00', {}),                // +4h → 19 (>max, reject)
  cOverlap: mkShift('cOverlap', '2025-09-10', '12:00', '15:00', {}),          // overlaps c3 (09–13)
  // 'capm' — 8h this month; candidates to test monthly cap
  mm1: mkShift('mm1', '2025-09-03', '09:00', '17:00', { assignees: ['capm'] }), // 8h Sep
  mmFit: mkShift('mmFit', '2025-09-20', '09:00', '11:00', {}),                // +2h → 10 (==max, ok)
  mmOver: mkShift('mmOver', '2025-09-20', '13:00', '16:00', {}),              // +3h → 11 (>max, reject)
  // capacity-full shift (required 1, already filled by 'wk')
  full: mkShift('full', '2025-09-25', '09:00', '12:00', { assignees: ['wk'], required: 1 }),
};
const state = { students, schedule: shifts, year: 2025, month: 8 /* Sep */, fairness: {} };
const eng = new SchedulingEngine(state, null);
eng.buildRunContext();

let pass = 0, fail = 0;
const ok = (label, cond) => { if (cond) { pass++; console.log('  PASS', label); } else { fail++; console.log('  FAIL', label); } };
const near = (a, b) => Math.abs(a - b) < 1e-9;

console.log('[ A. weekly accumulation ]');
ok('wk week of 09-10 = 12h (Mon4+Wed3+Sat5, same Sun-week)', near(eng.getWeeklyAssignedHours('wk','2025-09-10'), 12));

console.log('\n[ B. Sunday week boundary — Sat 09-13 and Sun 09-14 are different weeks ]');
ok('query 09-13 (Sat) = 12h, excludes Sun 09-14', near(eng.getWeeklyAssignedHours('wk','2025-09-13'), 12));
ok('query 09-14 (Sun) = 5h only (new week)', near(eng.getWeeklyAssignedHours('wk','2025-09-14'), 5));

console.log('\n[ C. monthly accumulation — month boundary ]');
ok('mo Sept total = 7h (09-05 + 09-30), excludes 10-01', near(eng.getTotalMonthlyHours('mo','2025-09-15'), 7));
ok('mo Oct total = 4h (10-01 only)', near(eng.getTotalMonthlyHours('mo','2025-10-15'), 4));

console.log('\n[ D. weekly remaining floored at 0 ]');
ok('wk remaining = 6 (18-12)', near(eng.getWeeklyRemainingHours('wk','2025-09-10'), 6));
ok('over remaining = 0 (12h assigned > 10 max, floored not negative)', eng.getWeeklyRemainingHours('over','2025-09-08') === 0);

console.log('\n[ E. cap-enforcement invariants (canAssignStudentToShift) ]');
ok('weekly cap: +3h reaching exactly max (18) → assignable', eng.canAssignStudentToShift('cap', shifts.cFit) === true);
ok('weekly cap: +4h exceeding max (19>18) → rejected', eng.canAssignStudentToShift('cap', shifts.cOver) === false);
ok('monthly cap: +2h reaching exactly max (10) → assignable', eng.canAssignStudentToShift('capm', shifts.mmFit) === true);
ok('monthly cap: +3h exceeding max (11>10) → rejected', eng.canAssignStudentToShift('capm', shifts.mmOver) === false);
ok('double-book: overlapping existing shift → rejected', eng.canAssignStudentToShift('cap', shifts.cOverlap) === false);
ok('capacity full: shift already at required → rejected', eng.canAssignStudentToShift('capm', shifts.full) === false);
ok('already assigned: cannot re-assign same student → rejected', eng.canAssignStudentToShift('wk', shifts.s1) === false);

console.log('\n[ F. invariant sweep — no reachable canAssign violates a cap ]');
// For every (student, unassigned shift) pair canAssign says TRUE, assert caps truly hold.
let violations = 0, checkedTrue = 0;
for (const s of students) {
  for (const shift of Object.values(shifts)) {
    if (shift.assignees.includes(s.id)) continue;
    if (!eng.canAssignStudentToShift(s.id, shift)) continue;
    checkedTrue++;
    const wk = eng.getWeeklyAssignedHours(s.id, shift.date);
    const mo = eng.getTotalMonthlyHours(s.id, shift.date);
    const h = (eng.parseTimeStr(shift.end) - eng.parseTimeStr(shift.start)) / 60;
    if (wk + h > s.weekly_max_hours + 1e-9) violations++;
    if (mo + h > s.contracted_monthly_hours + 1e-9) violations++;
  }
}
ok(`every approved assignment respects weekly+monthly caps (${checkedTrue} approvals checked, ${violations} violations)`, violations === 0);

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
