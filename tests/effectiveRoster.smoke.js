/**
 * Smoke test for EffectiveRoster (E1 acceptance criteria).
 * Run: node tests/effectiveRoster.smoke.js
 *
 * Acceptance: post-swap assignee correct; A→B→C chain resolves.
 * Plus: dedupe across sources, idempotent replay, admin-override preservation,
 * date-range filtering, and source immutability (read-only guarantee).
 */
'use strict';

const src = require('fs').readFileSync(
  require('path').join(__dirname, '../src/js/core/effectiveRoster.js'),
  'utf8'
);

const g = {};
(new Function('global', src))(g); // eslint-disable-line no-new-func
const ER = g.EffectiveRoster;

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function assigneesOf(result, shiftKey) {
  const s = result.shifts.find((x) => `${x.date} ${x.start}` === shiftKey);
  return s ? s.assignees : null;
}

function sameSet(a, b) {
  if (!a || a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

// A September 2025 saved schedule. month is JS 0-indexed (8 = September).
function septSchedule() {
  return {
    id: '2025-09',
    year: 2025,
    month: 8,
    shifts: [
      { date: '2025-09-03', start: '06:30', end: '07:30', assignees: ['A'] },
      { date: '2025-09-04', start: '06:30', end: '07:30', assignees: ['X'] },
      { date: '2025-09-10', start: '08:30', end: '09:30', assignees: ['Z'], adminOverride: true, adminOverrideBy: 'admin', adminOverrideAt: '2025-09-01T10:00:00.000Z' },
    ],
  };
}

(async () => {
  console.log('\n=== EffectiveRoster smoke test ===\n');

  // ── 1. Single approved swap: requester A → taker B ─────────────────────────
  console.log('[ Single approved swap ]');
  {
    const result = await ER.forRange('2025-09-01', '2025-09-30', {
      schedules: [septSchedule()],
      approvedSwaps: [
        {
          status: 'approved',
          requesterId: 'A',
          fromShift: { date: '2025-09-03', start: '06:30' },
          takerId: 'B',
          createdAt: '2025-09-02T08:00:00.000Z',
        },
      ],
    });
    assert('A→B: assignee is now B', sameSet(assigneesOf(result, '2025-09-03 06:30'), ['B']));
    assert('A→B: A removed', !assigneesOf(result, '2025-09-03 06:30').includes('A'));
    assert('event recorded as applied', result.appliedEvents.some((e) => e.applied && e.to === 'B'));
  }

  // ── 2. A→B→C chain resolves to C (via swapDebts, createdAt-ordered) ─────────
  console.log('\n[ A→B→C chain ]');
  {
    const result = await ER.forRange('2025-09-01', '2025-09-30', {
      schedules: [septSchedule()],
      swapDebts: [
        { from: 'A', to: 'B', shift: '2025-09-03 06:30', status: 'pending',  createdAt: '2025-09-02T08:00:00.000Z' },
        { from: 'B', to: 'C', shift: '2025-09-03 06:30', status: 'pending',  createdAt: '2025-09-02T09:00:00.000Z' },
      ],
    });
    assert('chain resolves to C', sameSet(assigneesOf(result, '2025-09-03 06:30'), ['C']));
  }

  // ── 3. Chain resolves regardless of input order (sorted by createdAt) ──────
  console.log('\n[ A→B→C chain — events supplied out of order ]');
  {
    const result = await ER.forRange('2025-09-01', '2025-09-30', {
      schedules: [septSchedule()],
      swapDebts: [
        { from: 'B', to: 'C', shift: '2025-09-03 06:30', createdAt: '2025-09-02T09:00:00.000Z' },
        { from: 'A', to: 'B', shift: '2025-09-03 06:30', createdAt: '2025-09-02T08:00:00.000Z' },
      ],
    });
    assert('still resolves to C', sameSet(assigneesOf(result, '2025-09-03 06:30'), ['C']));
  }

  // ── 4. Dedupe: same swap in BOTH sources applies once (idempotent) ─────────
  console.log('\n[ Dedupe across approvedSwaps + swapDebts ]');
  {
    const result = await ER.forRange('2025-09-01', '2025-09-30', {
      schedules: [septSchedule()],
      approvedSwaps: [
        { status: 'approved', requesterId: 'A', fromShift: { date: '2025-09-03', start: '06:30' }, takerId: 'B', createdAt: '2025-09-02T08:00:00.000Z' },
      ],
      swapDebts: [
        { from: 'A', to: 'B', shift: '2025-09-03 06:30', createdAt: '2025-09-02T08:00:00.000Z' },
      ],
    });
    assert('deduped → assignee B', sameSet(assigneesOf(result, '2025-09-03 06:30'), ['B']));
    const appliedCount = result.appliedEvents.filter((e) => e.applied).length;
    assert('exactly one event applied', appliedCount === 1);
  }

  // ── 5. Idempotent replay against an already-mutated saved schedule ──────────
  // Saved schedule already shows B (performShiftSwap mutated it); the debt for
  // the same swap must be a no-op, not double-apply.
  console.log('\n[ Idempotent: debt replays onto already-swapped schedule ]');
  {
    const already = septSchedule();
    already.shifts[0].assignees = ['B']; // A→B already baked into saved month
    const result = await ER.forRange('2025-09-01', '2025-09-30', {
      schedules: [already],
      swapDebts: [
        { from: 'A', to: 'B', shift: '2025-09-03 06:30', createdAt: '2025-09-02T08:00:00.000Z' },
      ],
    });
    assert('still just B (no duplicate)', sameSet(assigneesOf(result, '2025-09-03 06:30'), ['B']));
    assert('event marked from-not-assigned', result.appliedEvents.some((e) => e.reason === 'from-not-assigned'));
  }

  // ── 6. Admin overrides preserved from saved schedule ───────────────────────
  console.log('\n[ Admin override flags preserved ]');
  {
    const result = await ER.forRange('2025-09-01', '2025-09-30', { schedules: [septSchedule()] });
    const s = result.shifts.find((x) => `${x.date} ${x.start}` === '2025-09-10 08:30');
    assert('override shift present', !!s);
    assert('adminOverride flag kept', s.adminOverride === true);
    assert('adminOverrideBy kept', s.adminOverrideBy === 'admin');
    assert('override assignee kept', sameSet(s.assignees, ['Z']));
  }

  // ── 7. Date-range filtering (single day) ───────────────────────────────────
  console.log('\n[ Range filter ]');
  {
    const dayShifts = await ER.forDate('2025-09-03', { schedules: [septSchedule()] });
    assert('only 2025-09-03 returned', dayShifts.length === 1 && dayShifts[0].date === '2025-09-03');
  }

  // ── 8. Read-only: source schedule is never mutated ─────────────────────────
  console.log('\n[ Source immutability ]');
  {
    const sched = septSchedule();
    const before = sched.shifts[0].assignees.slice();
    await ER.forRange('2025-09-01', '2025-09-30', {
      schedules: [sched],
      swapDebts: [{ from: 'A', to: 'B', shift: '2025-09-03 06:30', createdAt: '2025-09-02T08:00:00.000Z' }],
    });
    assert('source assignees unchanged', sameSet(sched.shifts[0].assignees, before) && sched.shifts[0].assignees.length === 1 && sched.shifts[0].assignees[0] === 'A');
  }

  // ── 9. Unmatched swap (no such shift) is reported, not thrown ───────────────
  console.log('\n[ Unmatched swap handled gracefully ]');
  {
    const result = await ER.forRange('2025-09-01', '2025-09-30', {
      schedules: [septSchedule()],
      swapDebts: [{ from: 'A', to: 'B', shift: '2025-09-99 06:30', createdAt: '2025-09-02T08:00:00.000Z' }],
    });
    assert('reported as no-matching-shift', result.appliedEvents.some((e) => e.reason === 'no-matching-shift'));
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  process.exitCode = fail > 0 ? 1 : 0;
})();
