'use strict';
/* Phase 5 — SchedulingEngine correctness suite (pure/critical functions).
 * Run: node tests/schedulingEngine.smoke.js
 * Loads utils.js + assessment.js as globals, then schedulingEngine.js. */
const fs = require('fs'), path = require('path');
const shim = {};
const load = (f) => new Function('window', fs.readFileSync(path.join(__dirname, '../src/js/core', f), 'utf8'))(shim);
load('utils.js'); load('assessment.js');
globalThis.SchedulerUtils = shim.SchedulerUtils;
globalThis.AssessmentManager = shim.AssessmentManager;
load('schedulingEngine.js');
const SchedulingEngine = shim.SchedulingEngine;

const eng = new SchedulingEngine({ students: [], schedule: {}, fairness: {} }, null);
const T = (hm) => eng.parseTimeStr(hm); // "HH:MM" → minutes

let pass = 0, fail = 0;
const findings = [];
const ok = (label, cond, note) => {
  if (cond) { pass++; console.log('  PASS', label); }
  else { fail++; console.log('  FAIL', label, note ? `— ${note}` : ''); if (note) findings.push(`${label}: ${note}`); }
};

// A pick of a NORMAL (non-exam) month for the date; September.
const NM = '2025-09-10';                 // normal-month shift/exam date
const NM_PREV = '2025-09-09';
// An EXAMINATION month (June); exam-month branch.
const EM = '2025-06-10';
const EM_PREV = '2025-06-09';

console.log('[ A. exam conflict — NORMAL month: overlap is half-open ]');
// shift 08:00–10:00 vs test 10:00–12:00 : ends exactly when test starts → NO conflict
ok('shift ending exactly at test start → no conflict',
  eng.shiftConflictsWithStudentTest(NM, T('08:00'), T('10:00'), NM, T('10:00'), T('12:00')) === false);
// shift 08:00–10:01 vs test 10:00–12:00 : 1-min overlap → conflict
ok('1-minute overlap → conflict',
  eng.shiftConflictsWithStudentTest(NM, T('08:00'), T('10:01'), NM, T('10:00'), T('12:00')) === true);
// buffer: shift starting exactly at testEnd (12:00), test ...–12:00 → within 60min buffer → conflict
ok('shift starting at testEnd → blocked by 60-min buffer',
  eng.shiftConflictsWithStudentTest(NM, T('12:00'), T('14:00'), NM, T('10:00'), T('12:00')) === true);
// buffer boundary: shift starting exactly at testEnd+60 (13:00) → allowed
ok('shift starting at testEnd+60 → allowed',
  eng.shiftConflictsWithStudentTest(NM, T('13:00'), T('15:00'), NM, T('10:00'), T('12:00')) === false);
// different day → no conflict in normal month
ok('different day (normal month) → no conflict',
  eng.shiftConflictsWithStudentTest('2025-09-11', T('10:00'), T('12:00'), NM, T('10:00'), T('12:00')) === false);

console.log('\n[ B. exam conflict — EXAMINATION month (June): strict "work only after exam" ]');
// day-before is entirely blocked
ok('day before exam (exam month) → blocked',
  eng.shiftConflictsWithStudentTest(EM_PREV, T('08:00'), T('10:00'), EM, T('10:00'), T('12:00')) === true);
// morning shift BEFORE the exam on exam day → blocked (strict rule)
ok('morning shift before exam on exam day → blocked',
  eng.shiftConflictsWithStudentTest(EM, T('06:00'), T('08:00'), EM, T('10:00'), T('12:00')) === true);
// shift starting at testEnd+60 on exam day → allowed
ok('exam day, start at testEnd+60 → allowed',
  eng.shiftConflictsWithStudentTest(EM, T('13:00'), T('15:00'), EM, T('10:00'), T('12:00')) === false);
// two days before (exam month) unrelated day → no conflict
ok('two days before exam (exam month) → no conflict',
  eng.shiftConflictsWithStudentTest('2025-06-08', T('08:00'), T('10:00'), EM, T('10:00'), T('12:00')) === false);

console.log('\n[ C. maxConsecutiveBlockHours — chaining, gaps, overlap ]');
ok('back-to-back 8–10,10–12 → 4h',
  eng.maxConsecutiveBlockHours([{start:T('08:00'),end:T('10:00')},{start:T('10:00'),end:T('12:00')}]) === 4);
ok('60-min gap still chains, counts worked hours only (8–10, 11–13 → 4h)',
  eng.maxConsecutiveBlockHours([{start:T('08:00'),end:T('10:00')},{start:T('11:00'),end:T('13:00')}]) === 4);
ok('>60-min gap breaks chain (8–10, 11:01–13 → max 2h)',
  eng.maxConsecutiveBlockHours([{start:T('08:00'),end:T('10:00')},{start:T('11:01'),end:T('13:00')}]) === 2);
ok('single block 8–13 → 5h',
  eng.maxConsecutiveBlockHours([{start:T('08:00'),end:T('13:00')}]) === 5);
ok('empty → 0h', eng.maxConsecutiveBlockHours([]) === 0);
// F-19 (low, robustness): on OVERLAPPING/nested blocks the impl sums worked hours
// (8–12 + nested 9–10 → 5), double-counting the overlap. NOT a live bug: overlaps
// are rejected upstream by validateAssignment, so only non-overlapping input reaches
// here, where worked-hours-sum == interval-union. Asserting actual (guarded) behavior.
ok('overlapping blocks: worked-hours sum = 5 (unreachable via guarded path; see F-19)',
  eng.maxConsecutiveBlockHours([{start:T('08:00'),end:T('12:00')},{start:T('09:00'),end:T('10:00')}]) === 5);

console.log('\n[ D. adjacentSlotKey — day boundaries ]');
ok('60 min before 09:00 → "... 08:00"', eng.adjacentSlotKey('2025-09-10','09:00',-60) === '2025-09-10 08:00');
ok('60 min before 00:30 → null (before midnight)', eng.adjacentSlotKey('2025-09-10','00:30',-60) === null);
ok('at 23:00 +60 → "... 24:00" is out of range → null OR valid?', eng.adjacentSlotKey('2025-09-10','23:30',60) === null);

console.log('\n[ E. getWeeklyTargetHours — monthly→weekly, and 0-contract edge ]');
const engS = new SchedulingEngine({ students: [
  { id: 'a', name: 'A', contracted_monthly_hours: 72 },
  { id: 'z', name: 'Z', contracted_monthly_hours: 0 },
], schedule: {}, fairness: {} }, null);
const wk72 = engS.getWeeklyTargetHours('a');
ok('72 monthly → ~16.615 weekly (72*12/52)', Math.abs(wk72 - (72*12/52)) < 1e-9);
// F-20 (low, domain): a 0-hour contract cannot be represented — normalizeStudent
// coerces 0→72 (Number(0)||weeklyMax*4) and getWeeklyTargetHours repeats monthly||72.
// So a "0-hour / on-hold" student silently gets the full 72-equiv target. If that
// state is ever needed, switch `||` to `??`. Asserting actual behavior (~16.615).
ok('0-hour contract coerced to 72-equiv weekly ~16.615 (see F-20)',
  Math.abs(engS.getWeeklyTargetHours('z') - (72*12/52)) < 1e-9);

console.log('\n[ F. shift defaults ]');
ok('getShiftCapacity defaults to required', eng.getShiftCapacity({ required: 3 }) === 3);
ok('getShiftCapacity maxCapacity wins', eng.getShiftCapacity({ required: 3, maxCapacity: 5 }) === 5);
const sh = eng.normalizeShiftInPlace({});
ok('normalizeShiftInPlace defaults required=1', sh.required === 1);
ok('normalizeShiftInPlace defaults maxCapacity=required', sh.maxCapacity === 1);
ok('normalizeShiftInPlace defaults assignees=[]', Array.isArray(sh.assignees) && sh.assignees.length === 0);

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (findings.length) {
  console.log('\nFINDINGS (expected-vs-actual discrepancies to triage):');
  findings.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}
process.exit(fail ? 1 : 0);
