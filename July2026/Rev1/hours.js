/**
 * F1 — Node golden-master harness (hours pipeline)
 * tests/harness/hours.js · run via `npm run harness:hours`
 *
 * Pipeline under test (prelude.md §0 / Project_Directory_Map §4):
 *   PayrollParser → IdentityMap → EffectiveRoster → Reconcile → HoursLedger
 *
 * What this harness does:
 *   1. Loads (building on first use) a fixture DetailedPayroll workbook +
 *      saved September 2025 schedule + students + approved swaps.
 *   2. Parses the real .xlsx binary with PayrollParser (window.XLSX backed by
 *      the Node `xlsx` package — no DOM, no monolith runtime).
 *   3. Runs the full reconciliation pipeline via Reconcile.run (which itself
 *      drives IdentityMap + EffectiveRoster + WorkedHoursNormalizer +
 *      PolicyFlags internally).
 *   4. Bridges Reconcile's clockedStud output into HoursLedger for the
 *      reconciled month (see "Ledger bridge" note below — hoursLedger.js is
 *      still v1.2 in this repo; E3 has not shipped).
 *   5. Builds a deterministic canonical snapshot of the whole result, hashes
 *      it, and runs the WHOLE pipeline a second time to confirm the hash is
 *      byte-identical (Prompt F1 acceptance: "consecutive runs diff clean").
 *   6. Compares against a committed baseline.json (golden-master gate across
 *      separate invocations / commits) — re-capture deliberately with
 *      `--update-baseline` when a change is intentional.
 *   7. Asserts the hand-verified totals below (Prompt F1 acceptance: "totals
 *      hand-verified") and prints a PASS/FAIL summary, exit code 1 on any
 *      failure — same style as the existing tests/*.smoke.js suite.
 *
 * ── Ledger bridge note (post-E3) ────────────────────────────────────────────
 * E3 has now shipped: `hoursLedger.js` is VERSION '1.3' (Stud may be clocked;
 * `options.studSource` echoed on the report), and `Reconcile.run` exposes the
 * UNROSTERED `uncreditedPool` (per student per month) plus an `uncreditedMinutes`
 * field on each flagged session — both asserted below. Stud credit still EXCLUDES
 * uncredited minutes (admin accept/reject lives in state.js, not in this headless
 * harness). This harness drives the ledger directly via
 * `HoursLedger.buildStudentLedger(student, monthData, {studSource:'clocked'})`,
 * constructing `monthData['2025-09'].stud` from
 * `Reconcile.run().clockedStud.byStudent[id].workedHours`. The browser path
 * (state.getHoursLedgerReport with studSource='clocked', folding accepted
 * uncredited into Stud) is integration-tested separately; everything upstream of
 * the bridge is unchanged.
 *
 * Scope is deliberately the reconciled month only (`monthKeys: ['2025-09']`)
 * — a full multi-month ledger run would fabricate Contr/Stud figures for
 * months this fixture has no clocked data for. Multi-month ledger
 * correctness is already covered by HoursLedger's own §9 golden anchor
 * (`HoursLedger.verifyGoldenAnchor()`), which is out of scope here.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');

const ROOT = path.join(__dirname, '..', '..');
const CORE = path.join(ROOT, 'src', 'js', 'core');
const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'hours');
const BASELINE_PATH = path.join(__dirname, 'baseline.json');

const UPDATE_BASELINE = process.argv.includes('--update-baseline');

// ─── Tiny assert harness (style matches tests/*.smoke.js) ───────────────────

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

// ─── Module loading ──────────────────────────────────────────────────────────
// All `src/js/core/*` modules here use the IIFE pattern
//   (function (global) { ... })(typeof window !== 'undefined' ? window : global)
// and attach themselves to the passed-in object, EXCEPT hoursLedger.js, which
// assigns directly to a bare `window` identifier (no IIFE). Both are loaded
// into one shared plain object `g` so they see each other as `global.X`,
// mirroring tests/reconcile.smoke.js's loading technique exactly.

function loadIifeModule(g, filename) {
  const src = fs.readFileSync(path.join(CORE, filename), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('global', src)(g);
}

function loadWindowModule(g, filename) {
  const src = fs.readFileSync(path.join(CORE, filename), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', src)(g);
}

function loadPipelineModules() {
  const g = {};
  g.XLSX = XLSX; // PayrollParser reads window.XLSX
  for (const file of [
    'payrollParser.js',
    'workedHoursNormalizer.js',
    'identityMap.js',
    'policyFlags.js',
    'effectiveRoster.js',
    'reconcile.js',
  ]) {
    loadIifeModule(g, file);
  }
  loadWindowModule(g, 'hoursLedger.js');
  return g;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function ensureFixtures() {
  const payrollPath =
    process.env.HARNESS_PAYROLL_FILE || path.join(FIXTURE_DIR, 'DetailedPayroll.xlsx');

  const jsonFixturesMissing =
    !fs.existsSync(path.join(FIXTURE_DIR, 'schedule-2025-09.json')) ||
    !fs.existsSync(path.join(FIXTURE_DIR, 'students.json')) ||
    !fs.existsSync(path.join(FIXTURE_DIR, 'approved-swaps.json'));
  const defaultPayrollMissing =
    !process.env.HARNESS_PAYROLL_FILE && !fs.existsSync(payrollPath);

  // Build once if anything required is missing. Never overwrites files that
  // already exist (e.g. a hand-edited schedule fixture) — build-fixture.js
  // is idempotent-by-absence only; re-run it explicitly to regenerate.
  if (jsonFixturesMissing || defaultPayrollMissing) {
    // eslint-disable-next-line global-require
    require(path.join(FIXTURE_DIR, 'build-fixture.js')).build();
  }

  if (!fs.existsSync(payrollPath)) {
    throw new Error(`F1 harness: payroll fixture not found at ${payrollPath}`);
  }

  return {
    payrollPath,
    schedule: JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'schedule-2025-09.json'), 'utf8')),
    students: JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'students.json'), 'utf8')),
    approvedSwaps: JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'approved-swaps.json'), 'utf8')),
  };
}

// ─── One full pipeline pass ─────────────────────────────────────────────────

async function runPipelineOnce() {
  const g = loadPipelineModules();
  const { payrollPath, schedule, students, approvedSwaps } = ensureFixtures();

  // 1. PayrollParser — real binary file → entries.
  // (fs.readFileSync returns a pooled Buffer; .buffer can be a larger shared
  // ArrayBuffer, so slice to the Buffer's own byteOffset/byteLength.)
  const fileBuf = fs.readFileSync(payrollPath);
  const arrayBuffer = fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength);
  const parsed = g.PayrollParser.parseWorkbook(arrayBuffer);

  // 2–3. Reconcile — drives IdentityMap + EffectiveRoster + Normalizer +
  // PolicyFlags internally (no storage/DOM; data injected directly).
  const monthKey = '2025-09';
  const result = await g.Reconcile.run({
    monthKey,
    timeEntries: parsed.entries,
    students,
    schedules: [schedule],
    approvedSwaps,
  });

  // 4. Ledger bridge — see module-header note above.
  const ledgerByStudent = {};
  for (const student of students) {
    const clocked = result.clockedStud.byStudent[student.id];
    const studHours = clocked ? clocked.workedHours : 0;
    const ledger = g.HoursLedger.buildStudentLedger(
      student,
      { [monthKey]: { stud: studHours, claimed: 0 } },
      { year: 2025, monthKeys: [monthKey], studSource: 'clocked' }
    );
    ledgerByStudent[student.id] = ledger;
  }

  return {
    parserWarnings: parsed.warnings,
    sheetName: parsed.sheetName,
    reconcile: result,
    ledgerByStudent,
  };
}

// ─── Canonical snapshot ──────────────────────────────────────────────────────

function canonicalize(output) {
  // Reconcile's own output is already deterministically sorted (see its
  // module header). Sorting student-keyed maps here too makes the snapshot
  // robust even if upstream insertion order ever changes incidentally.
  const sortedLedger = {};
  for (const sid of Object.keys(output.ledgerByStudent).sort()) {
    sortedLedger[sid] = output.ledgerByStudent[sid];
  }
  return JSON.stringify(
    {
      sheetName: output.sheetName,
      parserWarnings: [...output.parserWarnings].sort(),
      reconcile: output.reconcile,
      ledgerByStudent: sortedLedger,
    },
    null,
    2
  );
}

function hashOf(canonicalJson) {
  return crypto.createHash('sha256').update(canonicalJson).digest('hex');
}

// ─── Hand-verified expectations (Prompt F1: "totals hand-verified") ────────
// Same scenario as tests/reconcile.smoke.js (E2), now driven through a real
// .xlsx file. See tests/fixtures/hours/build-fixture.js for the row-by-row
// arithmetic (raw clock times → normalized worked minutes).

const EXPECTED = {
  clockedMinutes: { u11111111: 180, u22222222: 180, u33333333: 60 },
  clockedTotal: 420,
  adherenceDelta: { u11111111: 60, u22222222: -60, u33333333: 0 },
  flaggedCount: 3,
  absenceCount: 1,
  pendingUsernames: ['u99999999'],
  // F-01 uncredited pool: only Alice's 2025-09-09 UNROSTERED session (clock
  // 10:00→11:00 ⇒ round_in 10:30, round_out 11:00 ⇒ 30 grid-rounded minutes,
  // zero Stud credit). Everyone else has no UNROSTERED session ⇒ 0.
  uncreditedMinutes: { u11111111: 30, u22222222: 0, u33333333: 0 },
  uncreditedTotal: 30,
  // Ledger bridge, September only (monthKeys: ['2025-09'], prevBalance starts
  // at 0 — see "Ledger bridge note" above for why this is intentionally
  // scoped to one month):
  //   contr = student.contracted_monthly_hours (no override in monthData)
  //   stud  = clockedStud.byStudent[id].workedHours
  //   delta = balance = contr + claimed(0) − stud   (Sept is not pre-contract)
  ledger: {
    u11111111: { contr: 60, stud: 3, balance: 57 },
    u22222222: { contr: 45, stud: 3, balance: 42 },
    u33333333: { contr: 20, stud: 1, balance: 19 },
  },
};

function checkHandVerifiedTotals(output) {
  console.log('\n[ Hand-verified totals — clocked Stud (minutes) ]');
  const byStudent = output.reconcile.clockedStud.byStudent;
  for (const [sid, expectedMin] of Object.entries(EXPECTED.clockedMinutes)) {
    assert(`${sid} worked = ${expectedMin}`, byStudent[sid]?.workedMinutes === expectedMin);
  }
  assert('total = 420', output.reconcile.clockedStud.totalMinutes === EXPECTED.clockedTotal);

  console.log('\n[ Hand-verified totals — adherence delta per student ]');
  const adh = output.reconcile.adherence.byStudent;
  for (const [sid, expectedDelta] of Object.entries(EXPECTED.adherenceDelta)) {
    assert(`${sid} delta = ${expectedDelta}`, adh[sid]?.deltaMinutes === expectedDelta);
  }

  console.log('\n[ Hand-verified totals — flags / absences / pending ]');
  assert(`flaggedSessions.length = ${EXPECTED.flaggedCount}`,
    output.reconcile.flaggedSessions.length === EXPECTED.flaggedCount);
  assert(`absences.length = ${EXPECTED.absenceCount}`,
    output.reconcile.absences.length === EXPECTED.absenceCount);
  assert(`pending = [${EXPECTED.pendingUsernames.join(', ')}]`,
    JSON.stringify(output.reconcile.pending.map((p) => p.username).sort()) ===
      JSON.stringify([...EXPECTED.pendingUsernames].sort()));

  console.log('\n[ Hand-verified totals — UNROSTERED uncredited pool (F-01) ]');
  const pool = output.reconcile.uncreditedPool.byStudent;
  for (const [sid, expectedMin] of Object.entries(EXPECTED.uncreditedMinutes)) {
    assert(`${sid} uncredited = ${expectedMin}`, pool[sid]?.uncreditedMinutes === expectedMin);
  }
  assert(`uncredited total = ${EXPECTED.uncreditedTotal}`,
    output.reconcile.uncreditedPool.totalMinutes === EXPECTED.uncreditedTotal);
  // Uncredited must NOT leak into Stud credit:
  assert('Alice Stud excludes uncredited (still 180)',
    output.reconcile.clockedStud.byStudent.u11111111.workedMinutes === 180);

  console.log('\n[ Hand-verified totals — ledger bridge (Sept only) ]');
  for (const [sid, expected] of Object.entries(EXPECTED.ledger)) {
    const row = output.ledgerByStudent[sid]?.rows?.[0];
    assert(`${sid} contr = ${expected.contr}`, row?.contr === expected.contr);
    assert(`${sid} stud = ${expected.stud}`, row?.stud === expected.stud);
    assert(`${sid} balance = ${expected.balance}`, row?.balance === expected.balance);
    assert(`${sid} ledger self-check ok`, output.ledgerByStudent[sid]?.selfCheckOk === true);
    assert(`${sid} ledger provenance = clocked v1.3`,
      output.ledgerByStudent[sid]?.studSource === 'clocked' &&
      output.ledgerByStudent[sid]?.version === '1.3');
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== F1 — Hours pipeline golden-master harness ===\n');

  // Run 1
  const outputA = await runPipelineOnce();
  const canonicalA = canonicalize(outputA);
  const hashA = hashOf(canonicalA);

  // Run 2 — fresh module load + fresh fixture read, same inputs.
  const outputB = await runPipelineOnce();
  const canonicalB = canonicalize(outputB);
  const hashB = hashOf(canonicalB);

  console.log('[ Determinism — two full pipeline runs ]');
  assert('run 1 and run 2 produce identical canonical JSON', canonicalA === canonicalB);
  assert('run 1 and run 2 produce identical SHA-256', hashA === hashB);
  if (canonicalA !== canonicalB) {
    const diffAt = firstDiffIndex(canonicalA, canonicalB);
    console.error(
      `  Diff near char ${diffAt}:\n    run1: …${canonicalA.slice(Math.max(0, diffAt - 40), diffAt + 40)}…\n` +
      `    run2: …${canonicalB.slice(Math.max(0, diffAt - 40), diffAt + 40)}…`
    );
  }

  // Baseline gate across separate invocations (the actual "golden master").
  console.log('\n[ Baseline snapshot ]');
  if (UPDATE_BASELINE || !fs.existsSync(BASELINE_PATH)) {
    fs.writeFileSync(BASELINE_PATH, JSON.stringify({ hash: hashA, canonical: canonicalA }, null, 2));
    console.log(`  Baseline ${UPDATE_BASELINE ? 're-' : ''}captured → ${path.relative(ROOT, BASELINE_PATH)}`);
    console.log('  hash', hashA);
  } else {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    assert('matches committed baseline.json', hashA === baseline.hash);
    if (hashA !== baseline.hash) {
      console.error(
        '  Golden master changed. If intentional, re-run with --update-baseline ' +
        'and commit the new baseline.json alongside the review.'
      );
    }
  }

  checkHandVerifiedTotals(outputA);

  if (outputA.parserWarnings.length) {
    console.log('\n[ PayrollParser warnings (informational) ]');
    for (const w of outputA.parserWarnings) console.log('  -', w);
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  process.exitCode = fail > 0 ? 1 : 0;
}

function firstDiffIndex(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return i;
  }
  return len;
}

main().catch((err) => {
  console.error('Harness crashed:', err);
  process.exitCode = 1;
});
