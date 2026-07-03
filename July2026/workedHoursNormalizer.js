/**
 * WorkedHoursNormalizer  —  window.WorkedHoursNormalizer
 *
 * Pure functions that convert raw clock-in / clock-out times from a
 * PayrollParser entry into grid-snapped, capped "recorded" times and a
 * credited workedMinutes value, per the canonical spec in
 * Documentation/prelude.md §0 — "Normalization (non-admin rows)".
 *
 * Canonical spec: Documentation/prelude.md §0
 * Prompt:         Cursor_Prompts_WorkedHours_Integration.md — D1
 *
 * Design decisions:
 *   - All time arithmetic is in minutes-since-midnight.  This avoids Date
 *     objects for time-only logic and eliminates any timezone-conversion risk
 *     (SAST naïve wall-clock, per spec — never UTC-convert on ingest).
 *   - Admin bypass (entry.edited === true): clock times accepted verbatim,
 *     no rounding, no capping to [S, E], overtime and negative durations
 *     pass through unchanged (anomalies are already set by PayrollParser).
 *   - Open sessions (status !== 'complete' or shiftEndedISO absent): returned
 *     with workedMinutes: null; normalization is a no-op.
 *   - block is required for normalization.  Pass null to signal that the
 *     session has no matching scheduled block (UNROSTERED — flagged by E2).
 *   - No side effects; no globals read; usable in Node harness without DOM.
 *   - Input entry is never mutated; result is a shallow copy + new fields.
 */
(function (global) {
  'use strict';

  // ─── Time helpers ─────────────────────────────────────────────────────────

  /**
   * Parse 'HH:MM' (or 'HH:MM:SS') to whole minutes since midnight.
   * Also accepts a numeric value (assumed already minutes-since-midnight).
   * Returns null on invalid or missing input.
   *
   * @param {string|number|null|undefined} t
   * @returns {number|null}
   */
  function timeToMinutes(t) {
    if (typeof t === 'number') return Number.isFinite(t) ? t : null;
    if (typeof t !== 'string') return null;
    const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  /**
   * Format whole minutes since midnight to 'HH:MM'.
   * e.g. 570 → '09:30',  750 → '12:30',  0 → '00:00'
   *
   * @param {number} m  Minutes since midnight (0–1439).
   * @returns {string}
   */
  function minutesToTime(m) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  /**
   * Extract the time component from a naïve local ISO string as minutes since
   * midnight.  Parsing is purely string-based — no Date constructor, no
   * timezone interpretation.
   *
   * e.g. '2025-03-14T09:22:00' → 562  (= 9 × 60 + 22)
   *      '2025-03-14T18:30:00' → 1110 (= 18 × 60 + 30)
   *
   * @param {string|null|undefined} iso  Naïve local ISO (YYYY-MM-DDTHH:MM[:SS])
   * @returns {number|null}
   */
  function isoTimeMinutes(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const m = iso.match(/T(\d{2}):(\d{2})/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  /**
   * Resolve a block field to minutes-since-midnight.
   * Accepts the field as either an 'HH:MM' string or a numeric value.
   *
   * @param {Object} block
   * @param {string} strKey  Field name expected to hold an 'HH:MM' string
   * @param {string} numKey  Fallback field name expected to hold a number
   * @returns {number|null}
   */
  function _resolveBlockMinutes(block, strKey, numKey) {
    const v = block[strKey] !== undefined ? block[strKey] : block[numKey];
    return timeToMinutes(v);
  }

  // ─── Rounding functions (prelude §0) ──────────────────────────────────────

  /**
   * round_in(t) — snap a clock-in time to the :30/:00 grid.
   *
   *   H = hour(t),  m = minute(t)
   *   m ≤ 44  →  H:30    (credit starts at the :30 mark of this hour)
   *   m > 44  →  (H+1):00  (missed the :30 window; credit from next :00)
   *
   * Canonical examples:
   *   09:22  m=22  ≤44  →  09:30
   *   09:44  m=44  ≤44  →  09:30  (boundary — 44 still rounds to :30)
   *   09:45  m=45  >44  →  10:00  (boundary — 45 crosses to next :00)
   *   09:00  m= 0  ≤44  →  09:30  (early arrival; first credit at :30)
   *   17:55  m=55  >44  →  18:00
   *
   * @param {number} t  Clock-in time in minutes since midnight.
   * @returns {number}  Grid-snapped time in minutes since midnight.
   */
  function roundIn(t) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    return m <= 44 ? h * 60 + 30 : (h + 1) * 60;
  }

  /**
   * round_out(t) — snap a clock-out time to the :30/:00 grid.
   *
   *   H = hour(t),  m = minute(t)
   *   m ≥ 20  →  H:30   (enough of the :30 block was worked; credit to :30)
   *   m < 20  →  H:00   (left before the :30 threshold; credit only to :00)
   *
   * Canonical examples:
   *   12:45  m=45  ≥20  →  12:30
   *   12:20  m=20  ≥20  →  12:30  (boundary — 20 rounds to :30)
   *   12:19  m=19  <20  →  12:00  (boundary — 19 rounds down to :00)
   *   12:00  m= 0  <20  →  12:00  (exact :00 stays)
   *   18:30  m=30  ≥20  →  18:30  (exact :30 stays)
   *
   * @param {number} t  Clock-out time in minutes since midnight.
   * @returns {number}  Grid-snapped time in minutes since midnight.
   */
  function roundOut(t) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    return m >= 20 ? h * 60 + 30 : h * 60;
  }

  // ─── Main normalize function ───────────────────────────────────────────────

  /**
   * normalize(entry, block) → NormalizedEntry
   *
   * Apply rounding and capping per prelude §0.  Returns a new object that
   * extends the input entry with normalization fields.  Never mutates entry.
   *
   * ─── Parameters ─────────────────────────────────────────────────────────
   *
   * @param {Object} entry
   *   A PayrollParser entry.  Relevant fields:
   *     shiftStartedISO  {string|null}  Naïve local ISO (YYYY-MM-DDTHH:MM:SS)
   *     shiftEndedISO    {string|null}  Null when session is open
   *     status           {'complete'|'open'}
   *     edited           {boolean}      true → admin bypass
   *     anomalies        {string[]}     Pre-set anomaly flags from PayrollParser
   *
   * @param {Object|null} block
   *   The matched scheduled block; null if the session is unrostered.
   *   Field names are flexible — accepts either 'HH:MM' strings or numbers:
   *     start  / startMinutes  {string|number}  Scheduled start  e.g. '09:30' or 570
   *     end    / endMinutes    {string|number}  Scheduled end    e.g. '12:30' or 750
   *
   * ─── Return shape (entry fields + normalization fields) ─────────────────
   *
   *   blockStartMinutes    {number|null}  S in minutes since midnight
   *   blockEndMinutes      {number|null}  E in minutes since midnight
   *   clockInMinutes       {number|null}  Raw clock-in  (minutes since midnight)
   *   clockOutMinutes      {number|null}  Raw clock-out (minutes since midnight)
   *   recordedStartMinutes {number|null}  max(round_in(clockIn), S)
   *   recordedEndMinutes   {number|null}  min(round_out(clockOut), E)
   *   workedMinutes        {number|null}  max(0, recordedEnd − recordedStart)
   *                                       null for open/unrostered sessions
   *   normalizationNote    {string|null}  'admin_bypass' | 'open_session' |
   *                                       'unrostered'   | 'invalid_times' | null
   *
   * ─── Canonical worked examples (prelude §0) ──────────────────────────────
   *
   *   Example A — on time, clean in/out:
   *     Block [09:30, 12:30],  clock in 09:22 → out 12:45
   *     round_in(09:22)=09:30   max(09:30, 09:30)=09:30  (recordedStart)
   *     round_out(12:45)=12:30  min(12:30, 12:30)=12:30  (recordedEnd)
   *     workedMinutes = 12:30 − 09:30 = 180 ✓
   *
   *   Example B — late arrival:
   *     Block [09:30, 12:30],  clock in 10:05 → out 12:35
   *     round_in(10:05)=10:30   max(10:30, 09:30)=10:30
   *     round_out(12:35)=12:30  min(12:30, 12:30)=12:30
   *     workedMinutes = 120  (first hour forfeited)
   *
   *   Example C — early departure:
   *     Block [09:30, 12:30],  clock in 09:22 → out 11:10
   *     round_in(09:22)=09:30   max(09:30, 09:30)=09:30
   *     round_out(11:10)=11:00  min(11:00, 12:30)=11:00
   *     workedMinutes = 90
   *
   *   Example D — very early clock-in (no early credit):
   *     Block [09:30, 12:30],  clock in 08:55 → out 12:30
   *     round_in(08:55)=09:00   max(09:00, 09:30)=09:30  ← clamped to S
   *     round_out(12:30)=12:30  min(12:30, 12:30)=12:30
   *     workedMinutes = 180  (no early credit)
   *
   *   Example E — late clock-out (no overtime credit):
   *     Block [09:30, 12:30],  clock in 09:22 → out 13:45
   *     round_in(09:22)=09:30   max(09:30, 09:30)=09:30
   *     round_out(13:45)=13:30  min(13:30, 12:30)=12:30  ← clamped to E
   *     workedMinutes = 180  (no overtime credit)
   *
   *   Example F — zero duration after rounding (anomaly):
   *     Block [09:30, 10:30],  clock in 09:47 → out 09:55
   *     round_in(09:47)=10:00   max(10:00, 09:30)=10:00
   *     round_out(09:55)=09:30  min(09:30, 10:30)=09:30  ← before recordedStart
   *     workedMinutes = max(0, 09:30 − 10:00) = max(0, −30) = 0
   *
   *   Example G — admin bypass (entry.edited = true):
   *     Block [09:30, 12:30],  clock in 08:55 → out 13:20
   *     No rounding; no capping; overtime accepted.
   *     recordedStart = 08:55 (535 min),  recordedEnd = 13:20 (800 min)
   *     workedMinutes = 800 − 535 = 265
   */
  function normalize(entry, block) {
    // Resolve block boundaries up-front; null when block is absent.
    const blockStart = block != null
      ? _resolveBlockMinutes(block, 'start', 'startMinutes')
      : null;
    const blockEnd = block != null
      ? _resolveBlockMinutes(block, 'end', 'endMinutes')
      : null;

    const clockIn  = isoTimeMinutes(entry && entry.shiftStartedISO);
    const clockOut = isoTimeMinutes(entry && entry.shiftEndedISO);

    /** Build result object without mutating the input entry. */
    function result(recStart, recEnd, worked, note) {
      return Object.assign({}, entry, {
        blockStartMinutes:    blockStart,
        blockEndMinutes:      blockEnd,
        clockInMinutes:       clockIn,
        clockOutMinutes:      clockOut,
        recordedStartMinutes: recStart,
        recordedEndMinutes:   recEnd,
        workedMinutes:        worked,
        normalizationNote:    note,
      });
    }

    // ── Open session: no clock-out available ──────────────────────────────
    if (!entry || entry.status !== 'complete' || !entry.shiftEndedISO) {
      return result(null, null, null, 'open_session');
    }

    // ── Admin bypass: accept clock times verbatim, no rounding or caps ───
    // (Spec: "accept clock times verbatim; no rounding, no caps, overtime
    //  allowed, no late/early flags; set edited:true" — prelude §0)
    if (entry.edited) {
      // F-09: an admin edit adjusts clock times; it does NOT conjure a scheduled
      // block. An admin-edited session with no matching block is still UNROSTERED
      // → zero Stud credit, routed to the uncredited pool for accept/reject. Only
      // a *rostered* admin session is credited verbatim.
      if (block == null || blockStart === null || blockEnd === null) {
        return result(null, null, null, 'unrostered');
      }
      if (clockIn === null || clockOut === null) {
        return result(null, null, null, 'admin_bypass');
      }
      // Compute raw diff; do NOT clamp.  Negative values indicate a data
      // anomaly already recorded in entry.anomalies by PayrollParser.
      return result(clockIn, clockOut, clockOut - clockIn, 'admin_bypass');
    }

    // ── Unrostered: no matching scheduled block ───────────────────────────
    // UNROSTERED flag is set by Reconcile (E2); normalizer just signals it.
    if (block == null || blockStart === null || blockEnd === null) {
      return result(null, null, null, 'unrostered');
    }

    // ── Clock-time parse failure ──────────────────────────────────────────
    if (clockIn === null || clockOut === null) {
      return result(null, null, null, 'invalid_times');
    }

    // ── Normal path (prelude §0) ──────────────────────────────────────────
    //   recorded_start = max(round_in(clock_in), S)    // no early credit
    //   recorded_end   = min(round_out(clock_out), E)  // no overtime credit
    //   worked_minutes = max(0, recorded_end − recorded_start)
    const recordedStart = Math.max(roundIn(clockIn),   blockStart);
    const recordedEnd   = Math.min(roundOut(clockOut), blockEnd);
    const worked        = Math.max(0, recordedEnd - recordedStart);

    return result(recordedStart, recordedEnd, worked, null);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * @namespace window.WorkedHoursNormalizer
   *
   * Exported functions (all pure — no side effects):
   *   normalize(entry, block)  Main function; see JSDoc above.
   *   roundIn(t)               round_in  primitive (minutes → minutes).
   *   roundOut(t)              round_out primitive (minutes → minutes).
   *   timeToMinutes(t)         'HH:MM' | number → minutes-since-midnight.
   *   minutesToTime(m)         minutes-since-midnight → 'HH:MM'.
   *   isoTimeMinutes(iso)      'YYYY-MM-DDTHH:MM:SS' → minutes-since-midnight.
   */
  global.WorkedHoursNormalizer = Object.freeze({
    normalize,
    roundIn,
    roundOut,
    timeToMinutes,
    minutesToTime,
    isoTimeMinutes,
  });

})(typeof window !== 'undefined' ? window : /* Node harness */ global);
