'use strict';
/* Phase 5 — HoursLedger correctness (balance math, claimable cap, self-check).
 * Run: node tests/hoursLedger.smoke.js
 * Sign convention: balance > 0 = student OWES work; < 0 = student is OWED pay. */
const fs = require('fs'), path = require('path');
const shim = {};
new Function('window', fs.readFileSync(path.join(__dirname, '../src/js/core/hoursLedger.js'), 'utf8'))(shim);
const HL = shim.HoursLedger;

let pass = 0, fail = 0;
const ok = (label, cond) => { if (cond) { pass++; console.log('  PASS', label); } else { fail++; console.log('  FAIL', label); } };
const near = (a, b) => Math.abs(a - b) < 1e-9;

console.log('[ A. roundHours — 1-decimal, half-up ]');
ok('5.25 → 5.3', HL.roundHours(5.25) === 5.3);
ok('5.24 → 5.2', HL.roundHours(5.24) === 5.2);
ok('-27 → -27', HL.roundHours(-27) === -27);
ok('null → 0', HL.roundHours(null) === 0);

console.log('\n[ B. preClaimBalance — Bal(N-1)+Contr−Stud ]');
ok('non-pre: 5.5 + 50 − 57 = -1.5', near(HL.preClaimBalance(5.5, 50, 57, false), -1.5));
ok('pre-contract: 0 − 51 = -51 (no contract added)', near(HL.preClaimBalance(0, 50, 51, true), -51));

console.log('\n[ C. computeClaimable — I7: min(banked deficit, 72−Contr) ]');
ok('deficit 49 capped by headroom (72−50=22) → 22', near(HL.computeClaimable(-49, 50, false), 22));
ok('deficit 10 under headroom 22 → 10', near(HL.computeClaimable(-10, 50, false), 10));
ok('surplus (+5) → 0 claimable', near(HL.computeClaimable(5, 50, false), 0));
ok('pre-contract deficit 51 → 51 (no headroom cap)', near(HL.computeClaimable(-51, 0, true), 51));
ok('headroom zero when contr = 72 → 0', near(HL.computeClaimable(-40, 72, false), 0));

console.log('\n[ D. monthDelta / monthBalance — GOLDEN_ANCHOR chain by hand ]');
ok('Feb pre: delta = 51−51 = 0', near(HL.monthDelta(0, 51, 51, true), 0));
ok('Mar: delta = (50+22)−99 = -27', near(HL.monthDelta(50, 22, 99, false), -27));
ok('Mar balance from 0 → -27', near(HL.monthBalance(0, 50, 22, 99, false), -27));
ok('Apr: balance -27 + ((33+30.5)−31) = 5.5', near(HL.monthBalance(-27, 33, 30.5, 31, false), 5.5));
ok('May: balance 5.5 + ((50+11)−57) = 9.5', near(HL.monthBalance(5.5, 50, 11, 57, false), 9.5));

console.log('\n[ E. validateClaim — 0 ≤ claimed ≤ claimable ]');
ok('claimed 10 ≤ cap 22 → valid', HL.validateClaim(10, 22).valid === true);
ok('claimed 25 > cap 22 → invalid', HL.validateClaim(25, 22).valid === false);
ok('negative claim → invalid', HL.validateClaim(-5, 22).valid === false);
ok('claimed == cap (boundary) → valid', HL.validateClaim(22, 22).valid === true);

console.log('\n[ F. verifyGoldenAnchor — built-in raw-formula regression anchor ]');
const anchor = HL.verifyGoldenAnchor();
ok('golden anchor passes (all 5 months match expected balances)', anchor.ok === true && anchor.errors.length === 0);

console.log('\n[ G. buildStudentLedger — independent self-check + term balance ]');
const student = { id: 's1', name: 'S One', contracted_monthly_hours: 50 };
// Feb pre (40/40, bal 0) → Mar (stud60, claim10, bal 0) → Apr (stud40, claim0, bal +10)
const monthData = {
  '2025-02': { stud: 40, claimed: 40 },
  '2025-03': { stud: 60, claimed: 10 },
  '2025-04': { stud: 40, claimed: 0 },
};
const led = HL.buildStudentLedger(student, monthData, {
  year: 2025, monthKeys: ['2025-02', '2025-03', '2025-04'], contractPeriods: [],
});
ok('self-check passes (balance chain == Σcredit − Σworked)', led.selfCheckOk === true);
ok('term balance = 10', near(led.termBalance, 10));
ok('totalWorked = 140 (40+60+40)', near(led.totalWorked, 140));
ok('totalCredit = 150 (40 + 60 + 50)', near(led.totalCredit, 150));
ok('sign label = owes work (balance > 0)', led.signLabel === 'owes work');
ok('no violations on valid claims', led.violations.length === 0);

// Over-claim triggers an A1 violation (claim exceeds claimable cap)
const ledBad = HL.buildStudentLedger(student, {
  '2025-03': { stud: 60, claimed: 99 }, // claimable is only min(10,22)=10
}, { year: 2025, monthKeys: ['2025-03'], contractPeriods: [] });
ok('over-claim flags an A1 violation', ledBad.violations.some(v => v.code === 'A1'));

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
