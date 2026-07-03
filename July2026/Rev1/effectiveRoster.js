// Effective roster builder — worked-hours reconciliation (Documentation/prelude.md §0)
//
// "Effective roster" = what *scheduled* actually means for reconciliation. It is
// NOT the frozen publication. For a given date we start from the saved month
// schedule (IndexedDB `schedules` store via StorageManager.getMonthSchedule) and
// then replay, in `createdAt` order:
//
//   1. Approved swap-requests   (swaps store, status:'approved')
//   2. Persisted `swapDebts`    (AppStateManager meta/export log)
//   3. Admin overrides          (baked into the saved-schedule shift objects)
//
// Read-only and headless: it never mutates the source data, never touches the
// legacy monolith runtime, and never requires an AppStateManager instance — the
// Node harness passes data in directly.
//
// ── Why both swaps AND swapDebts? ───────────────────────────────────────────
// A single logical swap can be persisted twice: `performShiftSwap` mutates the
// saved month *and* pushes a swapDebt, while an approved swap-request that has
// not been re-applied to the saved month must still count. We merge both, dedupe
// on the natural key `from|to|shift|createdAt`, then apply each event as
// "replace `from` with `to` in that shift's assignees, only if `from` is still
// present". That makes replay idempotent against an already-mutated schedule and
// lets a chain A→B then B→C resolve to C automatically.
//
// ── Admin overrides ─────────────────────────────────────────────────────────
// In this repo there is no separate admin-override log: `manualDropAssign` bakes
// the override straight into the saved-schedule shift (the assignee plus
// `adminOverride`/`adminOverrideBy`/`adminOverrideAt` flags). So the builder
// preserves those flags from the loaded schedule; there is nothing extra to
// replay for overrides.
//
// F-15 — ORDERING NOTE: because overrides are already baked into the loaded
// shift, they form the BASE state and swap events replay on top of them, in
// createdAt order. The override/swap sequence is therefore intentionally
// collapsed: an override is always logically "first" (it is the starting
// assignee the swaps mutate), regardless of its `adminOverrideAt` timestamp
// relative to a swap's `createdAt`. There is deliberately no timestamp
// interleaving BETWEEN an override and a swap — only swaps are ordered among
// themselves. If a future requirement needs true override↔swap interleaving,
// overrides must first be promoted to their own timestamped event log.
//
// ── Worked example (A→B→C chain) ────────────────────────────────────────────
//   shift "2025-09-03 06:30" assignees: ['A']
//   debt1 { from:'A', to:'B', shift:'2025-09-03 06:30', createdAt:'...T08:00' }
//   debt2 { from:'B', to:'C', shift:'2025-09-03 06:30', createdAt:'...T09:00' }
//   → sorted by createdAt, apply debt1 (A→B) then debt2 (B→C)
//   → effective assignees: ['C']

(function (global) {
  'use strict';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /** Calendar-month schedule id — matches StorageManager.monthScheduleId / HoursLedger.monthKey. */
  function monthScheduleId(year, jsMonthIndex) {
    return `${year}-${pad2(jsMonthIndex + 1)}`;
  }

  /** Shift natural key, e.g. "2025-09-03 06:30" — same shape as swapDebts.shift. */
  function shiftKey(date, start) {
    return `${date} ${start}`;
  }

  /** Parse "YYYY-MM-DD" without Date()/timezone (clock data is naïve SAST wall-clock). */
  function parseDateKey(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
    if (!m) return null;
    return { year: +m[1], jsMonthIndex: +m[2] - 1, day: +m[3] };
  }

  function cmpDate(a, b) {
    if (a.year !== b.year) return a.year - b.year;
    if (a.jsMonthIndex !== b.jsMonthIndex) return a.jsMonthIndex - b.jsMonthIndex;
    return a.day - b.day;
  }

  /** Inclusive list of {year, jsMonthIndex} months covered by [start, end]. */
  function monthsInRange(startKey, endKey) {
    const a = parseDateKey(startKey);
    const b = parseDateKey(endKey);
    if (!a || !b) throw new Error('EffectiveRoster.forRange: start/end must be "YYYY-MM-DD"');
    if (cmpDate(a, b) > 0) throw new Error('EffectiveRoster.forRange: start is after end');

    const months = [];
    let y = a.year;
    let mi = a.jsMonthIndex;
    while (y < b.year || (y === b.year && mi <= b.jsMonthIndex)) {
      months.push({ year: y, jsMonthIndex: mi });
      mi += 1;
      if (mi > 11) {
        mi = 0;
        y += 1;
      }
    }
    return months;
  }

  /** Defensive clone — assignees coerced to strings so id comparisons are stable. */
  function cloneShift(s) {
    return {
      ...s,
      assignees: Array.isArray(s.assignees) ? s.assignees.map(String) : [],
    };
  }

  /**
   * Collect the saved-schedule shifts for the covered months.
   * Source priority: an explicit `schedules` array (Node harness) overrides
   * anything fetched via `getMonthSchedule` (browser StorageManager).
   */
  async function loadShifts(months, opts) {
    const byId = new Map();

    if (typeof opts.getMonthSchedule === 'function') {
      for (const { year, jsMonthIndex } of months) {
        const rec = await opts.getMonthSchedule(year, jsMonthIndex);
        if (rec) byId.set(monthScheduleId(year, jsMonthIndex), rec);
      }
    }

    if (Array.isArray(opts.schedules)) {
      for (const rec of opts.schedules) {
        const id = rec.id || monthScheduleId(rec.year, rec.month);
        byId.set(id, rec);
      }
    }

    const shifts = [];
    for (const { year, jsMonthIndex } of months) {
      const rec = byId.get(monthScheduleId(year, jsMonthIndex));
      if (!rec || !Array.isArray(rec.shifts)) continue;
      for (const s of rec.shifts) shifts.push(cloneShift(s));
    }
    return shifts;
  }

  /** Normalize approved swap-requests → swap events. */
  function eventsFromApprovedSwaps(approvedSwaps) {
    const out = [];
    for (const sw of approvedSwaps || []) {
      if (sw.status && sw.status !== 'approved') continue;
      const fs = sw.fromShift;
      if (!fs || !fs.date || !fs.start) continue;

      const from = sw.requesterId != null ? String(sw.requesterId) : null;
      const taker = sw.acceptedOffer && sw.acceptedOffer.student
        ? sw.acceptedOffer.student.id
        : sw.takerId;
      if (from == null || taker == null) continue;

      out.push({
        from,
        to: String(taker),
        shift: shiftKey(fs.date, fs.start),
        createdAt: sw.createdAt || '',
        source: 'approvedSwap',
      });
    }
    return out;
  }

  /** Normalize persisted swapDebts → swap events (all statuses; settling ≠ reversal). */
  function eventsFromDebts(swapDebts) {
    const out = [];
    for (const d of swapDebts || []) {
      if (d.from == null || d.to == null || !d.shift) continue;
      out.push({
        from: String(d.from),
        to: String(d.to),
        shift: String(d.shift),
        createdAt: d.createdAt || '',
        source: 'swapDebt',
      });
    }
    return out;
  }

  /** Dedupe identical events that appear in both sources (natural key). */
  function dedupeEvents(events) {
    const seen = new Set();
    const out = [];
    for (const e of events) {
      const key = `${e.from}|${e.to}|${e.shift}|${e.createdAt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
    return out;
  }

  /** Chronological order; stable for equal/missing createdAt so chains stay deterministic. */
  function sortByCreatedAt(events) {
    return events
      .map((e, i) => ({ e, i }))
      .sort((a, b) => {
        if (a.e.createdAt < b.e.createdAt) return -1;
        if (a.e.createdAt > b.e.createdAt) return 1;
        return a.i - b.i;
      })
      .map((x) => x.e);
  }

  /** Apply events in order, mutating the working shift index; records an audit log. */
  function applyEvents(shiftIndex, events) {
    const log = [];
    for (const e of events) {
      const shift = shiftIndex.get(e.shift);
      if (!shift) {
        log.push({ ...e, applied: false, reason: 'no-matching-shift' });
        continue;
      }
      const idx = shift.assignees.indexOf(e.from);
      if (idx === -1) {
        // `from` already swapped away (chain link or duplicate source) — no-op.
        log.push({ ...e, applied: false, reason: 'from-not-assigned' });
        continue;
      }
      shift.assignees.splice(idx, 1);
      if (!shift.assignees.includes(e.to)) shift.assignees.push(e.to);
      log.push({ ...e, applied: true });
    }
    return log;
  }

  function compareShifts(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.start !== b.start) return a.start < b.start ? -1 : 1;
    return 0;
  }

  /**
   * Build the effective roster for an inclusive date range.
   *
   * @param {string} start - "YYYY-MM-DD"
   * @param {string} end   - "YYYY-MM-DD"
   * @param {object} [options]
   * @param {function(number, number): (object|Promise<object>)} [options.getMonthSchedule]
   *        Browser: `storage.getMonthSchedule.bind(storage)` (year, jsMonthIndex).
   * @param {object[]} [options.schedules]      Node harness: saved-schedule records ({id|year+month, shifts}).
   * @param {object[]} [options.approvedSwaps]  swaps store records (status:'approved').
   * @param {object[]} [options.swapDebts]      AppStateManager meta/export swapDebts log.
   * @returns {Promise<{shifts: object[], appliedEvents: object[]}>}
   *          `shifts` — effective shifts in [start,end], assignees reflecting swaps + overrides.
   *          `appliedEvents` — per-event audit (applied flag + reason).
   */
  async function forRange(start, end, options = {}) {
    const months = monthsInRange(start, end);
    const shifts = await loadShifts(months, options);

    const index = new Map();
    for (const s of shifts) index.set(shiftKey(s.date, s.start), s);

    const events = sortByCreatedAt(
      dedupeEvents([
        ...eventsFromApprovedSwaps(options.approvedSwaps),
        ...eventsFromDebts(options.swapDebts),
      ])
    );

    const appliedEvents = applyEvents(index, events);

    const startD = parseDateKey(start);
    const endD = parseDateKey(end);
    const inRange = shifts.filter((s) => {
      const d = parseDateKey(s.date);
      return d && cmpDate(d, startD) >= 0 && cmpDate(d, endD) <= 0;
    });
    inRange.sort(compareShifts);

    return { shifts: inRange, appliedEvents };
  }

  /** Convenience: effective shifts for a single date (drops the audit log). */
  async function forDate(date, options = {}) {
    const { shifts } = await forRange(date, date, options);
    return shifts;
  }

  /**
   * Browser convenience: wire `getMonthSchedule` + approved swaps from a live
   * StorageManager. `swapDebts` still comes from AppStateManager meta/export
   * (not a store), so it is passed in — the builder never needs the monolith.
   *
   * @param {string} start
   * @param {string} end
   * @param {object} args
   * @param {StorageManager} args.storage
   * @param {object[]} [args.swapDebts]
   */
  async function forRangeWithStorage(start, end, { storage, swapDebts = [] }) {
    if (!storage) throw new Error('EffectiveRoster.forRangeWithStorage: storage required');
    const approvedSwaps = await storage.getSwapRequests('approved');
    return forRange(start, end, {
      getMonthSchedule: (y, m) => storage.getMonthSchedule(y, m),
      approvedSwaps,
      swapDebts,
    });
  }

  global.EffectiveRoster = Object.freeze({
    forRange,
    forDate,
    forRangeWithStorage,
    // Exposed for testing / reuse:
    monthScheduleId,
    shiftKey,
  });
})(typeof window !== 'undefined' ? window : /* Node harness */ global);
