/**
 * Reconcile  —  window.Reconcile.run({ monthKey })
 *
 * Full worked-hours reconciliation pipeline for one calendar month. Chains the
 * upstream modules built in B–E1 into the two outputs defined in
 * Documentation/prelude.md §0:
 *
 *   PayrollParser (time entries)  ─┐
 *   IdentityMap.resolve            ├─► per-student, per-date clocked sessions
 *   EffectiveRoster.forRange       │   matched to their scheduled block [S,E]
 *   WorkedHoursNormalizer.normalize│   → recorded times + worked minutes
 *   PolicyFlags.evaluate           ┘   → LATE_IN/EARLY_OUT/OVER_5H/… flags
 *
 *   ➜ Reconcile.run → {
 *        adherence      (weekly  Σscheduled − Σworked, per student per ISO week)
 *        clockedStud    (monthly Σworked,  per student — the v1.3 ledger feed)
 *        flaggedSessions(every session carrying ≥1 flag, incl. UNROSTERED)
 *        absences       (effective-roster slots with no clocked session)
 *      }
 *
 * Canonical spec: Documentation/prelude.md §0
 * Prompt:         Cursor_Prompts_WorkedHours_Integration.md — E2
 *
 * Scope / guardrails (prelude §0 + standing guardrails):
 *   - Read-only. Never mutates schedules, swaps, time entries, or the ledger.
 *   - Emits the monthly clocked `Stud` as plain output data only. Wiring it into
 *     hoursLedger.js (and the I6 flip to clocked Stud) is Prompt E3's job — this
 *     module does NOT touch hoursLedger.js or AppStateManager.
 *   - Headless: works in the Node harness by injecting data via options; in the
 *     browser by passing a StorageManager. Never requires the monolith runtime.
 *   - Deterministic: no timestamps in the output; everything sorted by stable
 *     keys so two runs over the same data are byte-identical (Prompt F1).
 *
 * Why match against the EFFECTIVE roster (not the frozen publication):
 *   A swap moves a shift from student A to student B. Reconciling against the
 *   effective roster means B's clocked session finds its slot (no false
 *   UNROSTERED) and A no longer holds that slot (no false ABSENCE). This is the
 *   E2 acceptance guarantee: "swap does not false-flag absence/unrostered".
 */
(function (global) {
  'use strict';

  // ─── Small time/date helpers (string-based; naïve SAST wall-clock) ─────────

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /** "YYYY-MM" → { year, calendarMonth, jsMonthIndex }.  Throws on bad input. */
  function parseMonthKey(monthKey) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey || '').trim());
    if (!m) throw new Error('Reconcile.run: monthKey must be "YYYY-MM"');
    const year = +m[1];
    const calendarMonth = +m[2];
    if (calendarMonth < 1 || calendarMonth > 12) {
      throw new Error(`Reconcile.run: invalid month in "${monthKey}"`);
    }
    return { year, calendarMonth, jsMonthIndex: calendarMonth - 1 };
  }

  /** Inclusive [start, end] "YYYY-MM-DD" range covering the whole month. */
  function monthDateRange(year, calendarMonth) {
    // new Date(year, calendarMonth, 0) → day 0 of the *next* month = last day.
    const lastDay = new Date(year, calendarMonth, 0).getDate();
    return {
      start: `${year}-${pad2(calendarMonth)}-01`,
      end: `${year}-${pad2(calendarMonth)}-${pad2(lastDay)}`,
    };
  }

  /**
   * ISO-8601 week label, e.g. "2025-W36". Computed in UTC purely from the date
   * parts so it is deterministic and timezone-independent (the date itself is
   * naïve SAST; only the calendar arithmetic uses UTC to avoid DST shifts).
   */
  function isoWeekLabel(dateStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
    if (!m) return null;
    const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const dayNum = dt.getUTCDay() || 7;          // Mon=1 … Sun=7
    dt.setUTCDate(dt.getUTCDate() + 4 - dayNum); // shift to the week's Thursday
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
    return `${dt.getUTCFullYear()}-W${pad2(weekNo)}`;
  }

  function overlapMinutes(aStart, aEnd, bStart, bEnd) {
    return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  }

  function shiftKey(date, start) {
    return `${date} ${start}`;
  }

  // ─── Effective-roster → per-student contiguous "runs" ──────────────────────

  /**
   * From the flat effective-roster shift list build, for each (studentId, date),
   * the contiguous runs of assigned slots. A run is a maximal sequence of slots
   * where each slot's end equals the next slot's start (the :30-grid block in
   * prelude §0). Each run yields the [S, E] block used for normalization.
   *
   * @returns Map<studentId, Map<dateISO, Run[]>> where
   *   Run = { startMin, endMin, start, end, slots:[{date,start,end,...}], covered }
   */
  function buildRuns(effectiveShifts, timeToMinutes) {
    // studentId → date → slot[]
    const byStudentDate = new Map();

    for (const shift of effectiveShifts) {
      if (!shift || !shift.date || !shift.start || !Array.isArray(shift.assignees)) {
        continue;
      }
      for (const rawId of shift.assignees) {
        const sid = String(rawId);
        if (!byStudentDate.has(sid)) byStudentDate.set(sid, new Map());
        const dateMap = byStudentDate.get(sid);
        if (!dateMap.has(shift.date)) dateMap.set(shift.date, []);
        dateMap.get(shift.date).push(shift);
      }
    }

    const runsByStudent = new Map();

    for (const [sid, dateMap] of byStudentDate) {
      const dateRuns = new Map();
      for (const [date, slots] of dateMap) {
        // Sort slots by start time, then merge contiguous ones into runs.
        const sorted = slots
          .map((s) => ({
            slot: s,
            startMin: timeToMinutes(s.start),
            endMin: timeToMinutes(s.end),
          }))
          .filter((x) => x.startMin !== null && x.endMin !== null)
          .sort((a, b) => a.startMin - b.startMin);

        const runs = [];
        let current = null;
        for (const x of sorted) {
          if (current && x.startMin === current.endMin) {
            // Contiguous: extend the current run.
            current.endMin = x.endMin;
            current.end = x.slot.end;
            current.slots.push(x.slot);
          } else {
            current = {
              startMin: x.startMin,
              endMin: x.endMin,
              start: x.slot.start,
              end: x.slot.end,
              slots: [x.slot],
              covered: false,
            };
            runs.push(current);
          }
        }
        if (runs.length) dateRuns.set(date, runs);
      }
      runsByStudent.set(sid, dateRuns);
    }

    return runsByStudent;
  }

  /**
   * Match a clocked session to the run it belongs to on a given date.
   *   - Complete session [clockIn, clockOut]: the run with the greatest time
   *     overlap (must be > 0).
   *   - Open session (clockOut === null): the run whose window contains clockIn,
   *     else the nearest run starting within 30 min; ties broken by earliest run.
   * Returns the matched Run, or null (→ UNROSTERED).
   */
  function matchRun(runs, clockIn, clockOut) {
    if (!runs || !runs.length || clockIn === null) return null;

    if (clockOut !== null) {
      let best = null;
      let bestOverlap = 0;
      for (const run of runs) {
        const ov = overlapMinutes(clockIn, clockOut, run.startMin, run.endMin);
        if (ov > bestOverlap) {
          bestOverlap = ov;
          best = run;
        }
      }
      return best;
    }

    // Open session: no clock-out, match on clock-in proximity.
    let best = null;
    let bestDist = Infinity;
    for (const run of runs) {
      if (clockIn >= run.startMin && clockIn < run.endMin) return run; // inside
      const dist = Math.abs(clockIn - run.startMin);
      if (clockIn <= run.endMin && dist <= 30 && dist < bestDist) {
        bestDist = dist;
        best = run;
      }
    }
    return best;
  }

  // ─── Data loading (injectable for the Node harness) ────────────────────────

  async function loadInputs(options) {
    const storage = options.storage || null;

    const timeEntries = options.timeEntries
      || (storage ? await storage.getTimeEntriesForMonth(options.monthKey) : []);

    const students = options.students
      || (storage ? await storage.getStudents() : []);

    const overrides = options.overrides
      || (storage && options.IdentityMap !== undefined
        ? await options.IdentityMap.loadOverrides(storage)
        : (storage && global.IdentityMap
          ? await global.IdentityMap.loadOverrides(storage)
          : {}));

    const approvedSwaps = options.approvedSwaps
      || (storage ? await storage.getSwapRequests('approved') : []);

    return { storage, timeEntries, students, overrides, approvedSwaps };
  }

  // ─── Main pipeline ─────────────────────────────────────────────────────────

  /**
   * run(options) → ReconcileResult  (async)
   *
   * @param {Object} options
   *   @param {string}  options.monthKey            REQUIRED — "YYYY-MM" calendar month.
   *   @param {StorageManager} [options.storage]    Browser: pulls entries/students/swaps.
   *   @param {Object[]} [options.timeEntries]      Inject (Node): payroll time entries.
   *   @param {Object[]} [options.students]         Inject (Node): scheduler students.
   *   @param {Object}   [options.overrides]        Inject (Node): identity overrides.
   *   @param {Object[]} [options.schedules]        Inject (Node): saved-schedule records.
   *   @param {Function} [options.getMonthSchedule] Browser roster source (year, jsMonthIndex).
   *   @param {Object[]} [options.approvedSwaps]    Approved swap-requests.
   *   @param {Object[]} [options.swapDebts]        Persisted swapDebts log (meta/export).
   *   @param {Object}   [options.operationalHours] Per-date op-hours (state.operationalHours).
   *   @param {Object}   [options.assessmentManager] AssessmentManager (TEST_CONFLICT source).
   *   Module overrides (testing): EffectiveRoster, IdentityMap,
   *   WorkedHoursNormalizer, PolicyFlags.
   *
   * @returns {Promise<Object>} see RESULT SHAPE at the bottom of this function.
   */
  async function run(options) {
    options = options || {};
    const { year, calendarMonth, jsMonthIndex } = parseMonthKey(options.monthKey);
    const monthKey = `${year}-${pad2(calendarMonth)}`;
    const { start, end } = monthDateRange(year, calendarMonth);

    // Resolve module dependencies (injected for tests, else global namespaces).
    const ER = options.EffectiveRoster || global.EffectiveRoster;
    const IM = options.IdentityMap || global.IdentityMap;
    const WN = options.WorkedHoursNormalizer || global.WorkedHoursNormalizer;
    const PF = options.PolicyFlags || global.PolicyFlags;
    if (!ER || !IM || !WN || !PF) {
      throw new Error(
        'Reconcile.run: missing dependency (EffectiveRoster, IdentityMap, ' +
        'WorkedHoursNormalizer, PolicyFlags must be loaded)'
      );
    }
    const timeToMinutes = WN.timeToMinutes;
    const isoTimeMinutes = WN.isoTimeMinutes;

    const assessmentManager =
      options.assessmentManager !== undefined
        ? options.assessmentManager
        : (global.AssessmentManager || null);
    const operationalHours = options.operationalHours || null;

    const { storage, timeEntries, students, overrides, approvedSwaps } =
      await loadInputs({ ...options, IdentityMap: IM });

    // ── 1. Identity resolution (username → student) ─────────────────────────
    const resolutions = IM.resolve(timeEntries, students, overrides);
    const studentById = new Map();
    for (const s of students) studentById.set(String(s.id), s);
    const nameOf = (sid) => {
      const s = studentById.get(String(sid));
      return s ? (s.name || '') : '';
    };

    // ── 2. Effective roster for the whole month, then contiguous runs ───────
    const rosterOpts = {
      approvedSwaps,
      swapDebts: options.swapDebts || [],
    };
    if (Array.isArray(options.schedules)) {
      rosterOpts.schedules = options.schedules;
    }
    if (typeof options.getMonthSchedule === 'function') {
      rosterOpts.getMonthSchedule = options.getMonthSchedule;
    } else if (storage) {
      rosterOpts.getMonthSchedule = (y, mi) => storage.getMonthSchedule(y, mi);
    }
    const { shifts: effectiveShifts } = await ER.forRange(start, end, rosterOpts);
    const runsByStudent = buildRuns(effectiveShifts, timeToMinutes);

    // ── 3. Walk clocked sessions: match → normalize → flag ──────────────────
    // Accumulators keyed by studentId.
    const clockedMinutes = new Map();             // sid → Σ worked minutes
    const uncreditedMinutes = new Map();          // sid → Σ uncredited (UNROSTERED) minutes (F-01)
    const scheduledByWeek = new Map();            // `${sid}|${week}` → minutes
    const workedByWeek = new Map();               // `${sid}|${week}` → minutes
    const flaggedSessions = [];
    const pendingBucket = new Map();              // username → { label, count }

    const ensureStudentSeen = (sid) => {
      if (!clockedMinutes.has(sid)) clockedMinutes.set(sid, 0);
    };

    for (const entry of timeEntries) {
      // Only this month's entries (defensive — storage query is already scoped).
      if (entry.monthKey && entry.monthKey !== monthKey) continue;

      const resolution = resolutions[entry.username];

      // Unresolved identity → never silently dropped; held in the pending bucket.
      if (!resolution || resolution.status !== 'resolved') {
        const label = (resolution && resolution.label) || entry.username || '(unknown)';
        const prev = pendingBucket.get(entry.username) || { label, count: 0 };
        prev.count += 1;
        pendingBucket.set(entry.username, prev);
        continue;
      }

      const sid = String(resolution.studentId);
      ensureStudentSeen(sid);
      const student = studentById.get(sid) || null;

      const dateISO = entry.dateISO || (entry.shiftStartedISO || '').slice(0, 10);
      const clockIn = isoTimeMinutes(entry.shiftStartedISO);
      const clockOut = isoTimeMinutes(entry.shiftEndedISO);

      // Find the student's contiguous run for this date that the session covers.
      const dateRuns = runsByStudent.get(sid);
      const runs = dateRuns ? dateRuns.get(dateISO) : null;
      const matchedRun = matchRun(runs, clockIn, clockOut);
      const block = matchedRun
        ? { start: matchedRun.start, end: matchedRun.end }
        : null;
      if (matchedRun) matchedRun.covered = true; // attended → not an absence

      // Normalize (rounding/capping per §0; admin bypass handled inside).
      const normalized = WN.normalize(entry, block);

      // Policy flags (UNROSTERED/ABSENCE are this module's responsibility).
      const flags = new Set(
        PF.evaluate(normalized, { operationalHours, student, assessmentManager })
      );
      if (!matchedRun) flags.add('UNROSTERED');

      // Credit worked minutes toward the monthly clocked Stud + weekly worked.
      const worked = typeof normalized.workedMinutes === 'number'
        ? normalized.workedMinutes
        : 0;
      clockedMinutes.set(sid, clockedMinutes.get(sid) + worked);

      // F-01: UNROSTERED sessions earn zero Stud credit but their grid-rounded
      // clock span (round_out(out) − round_in(in), NO block clamp — prelude §0)
      // is preserved as uncredited minutes for the admin accept/reject pool.
      let sessionUncredited = 0;
      if (!matchedRun && entry.status === 'complete'
          && clockIn !== null && clockOut !== null) {
        sessionUncredited = Math.max(0, WN.roundOut(clockOut) - WN.roundIn(clockIn));
        uncreditedMinutes.set(sid, (uncreditedMinutes.get(sid) || 0) + sessionUncredited);
      }

      const week = isoWeekLabel(dateISO);
      if (week) {
        const wk = `${sid}|${week}`;
        workedByWeek.set(wk, (workedByWeek.get(wk) || 0) + worked);
      }

      const flagList = [...flags].sort();
      if (flagList.length) {
        flaggedSessions.push({
          naturalKey: entry.naturalKey || `${entry.username}|${entry.shiftStartedISO}`,
          username: entry.username,
          studentId: sid,
          studentName: nameOf(sid),
          dateISO,
          shiftStartedISO: entry.shiftStartedISO || null,
          shiftEndedISO: entry.shiftEndedISO || null,
          status: entry.status || null,
          edited: !!entry.edited,
          blockStart: matchedRun ? matchedRun.start : null,
          blockEnd: matchedRun ? matchedRun.end : null,
          workedMinutes: normalized.workedMinutes,
          uncreditedMinutes: sessionUncredited, // F-01: >0 only for UNROSTERED
          flags: flagList,
        });
      }
    }

    // ── 4. Scheduled minutes + ABSENCE from uncovered runs ──────────────────
    const absences = [];
    for (const [sid, dateRuns] of runsByStudent) {
      ensureStudentSeen(sid);
      for (const [date, runs] of dateRuns) {
        const week = isoWeekLabel(date);
        for (const run of runs) {
          const dur = run.endMin - run.startMin;
          if (week) {
            const wk = `${sid}|${week}`;
            scheduledByWeek.set(wk, (scheduledByWeek.get(wk) || 0) + dur);
          }
          if (!run.covered) {
            // No clocked session for this rostered block → absence. Per §0 this
            // routes to the swap-market view, not a hard error; emit per slot so
            // each schedulable shift is individually actionable.
            for (const slot of run.slots) {
              absences.push({
                studentId: sid,
                studentName: nameOf(sid),
                date,
                start: slot.start,
                end: slot.end,
                shiftKey: shiftKey(date, slot.start),
              });
            }
          }
        }
      }
    }

    // ── 5. Assemble deterministic output ────────────────────────────────────
    const studentIds = [...clockedMinutes.keys()].sort();

    // clockedStud: monthly Σ worked (the v1.3 ledger feed; E3 consumes this).
    const clockedByStudent = {};
    let clockedTotal = 0;
    for (const sid of studentIds) {
      const mins = clockedMinutes.get(sid);
      clockedTotal += mins;
      clockedByStudent[sid] = {
        studentId: sid,
        studentName: nameOf(sid),
        workedMinutes: mins,
        workedHours: Math.round((mins / 60) * 100) / 100,
      };
    }

    // uncreditedPool (F-01 / prelude §0 outputs): per student per month, Σ
    // uncredited minutes from UNROSTERED sessions. Surfaced SEPARATELY from
    // clockedStud. Default is uncredited until an admin accepts it (E3/state).
    const uncreditedByStudent = {};
    let uncreditedTotal = 0;
    for (const sid of studentIds) {
      const mins = uncreditedMinutes.get(sid) || 0;
      uncreditedTotal += mins;
      uncreditedByStudent[sid] = {
        studentId: sid,
        studentName: nameOf(sid),
        uncreditedMinutes: mins,
        uncreditedHours: Math.round((mins / 60) * 100) / 100,
      };
    }

    // adherence: per student per ISO week, Σscheduled − Σworked.
    const weekKeys = new Set([...scheduledByWeek.keys(), ...workedByWeek.keys()]);
    const adherenceRows = [];
    const adherenceByStudent = {};
    for (const key of weekKeys) {
      const sepIdx = key.indexOf('|');
      const sid = key.slice(0, sepIdx);
      const week = key.slice(sepIdx + 1);
      const scheduled = scheduledByWeek.get(key) || 0;
      const worked = workedByWeek.get(key) || 0;
      adherenceRows.push({
        studentId: sid,
        studentName: nameOf(sid),
        isoWeek: week,
        scheduledMinutes: scheduled,
        workedMinutes: worked,
        deltaMinutes: scheduled - worked,
      });
      if (!adherenceByStudent[sid]) {
        adherenceByStudent[sid] = {
          studentId: sid,
          studentName: nameOf(sid),
          scheduledMinutes: 0,
          workedMinutes: 0,
          deltaMinutes: 0,
        };
      }
      const agg = adherenceByStudent[sid];
      agg.scheduledMinutes += scheduled;
      agg.workedMinutes += worked;
      agg.deltaMinutes += scheduled - worked;
    }
    adherenceRows.sort((a, b) =>
      a.studentId < b.studentId ? -1 :
      a.studentId > b.studentId ? 1 :
      a.isoWeek < b.isoWeek ? -1 :
      a.isoWeek > b.isoWeek ? 1 : 0
    );

    flaggedSessions.sort((a, b) =>
      a.dateISO < b.dateISO ? -1 :
      a.dateISO > b.dateISO ? 1 :
      a.username < b.username ? -1 :
      a.username > b.username ? 1 :
      (a.shiftStartedISO || '') < (b.shiftStartedISO || '') ? -1 :
      (a.shiftStartedISO || '') > (b.shiftStartedISO || '') ? 1 : 0
    );

    absences.sort((a, b) =>
      a.date < b.date ? -1 :
      a.date > b.date ? 1 :
      a.start < b.start ? -1 :
      a.start > b.start ? 1 :
      a.studentId < b.studentId ? -1 :
      a.studentId > b.studentId ? 1 : 0
    );

    // F-15: emit adherenceByStudent with sorted keys, matching clockedByStudent's
    // canonical ordering (deterministic JSON regardless of insertion order).
    const adherenceByStudentSorted = {};
    for (const sid of Object.keys(adherenceByStudent).sort()) {
      adherenceByStudentSorted[sid] = adherenceByStudent[sid];
    }

    const pending = [...pendingBucket.keys()].sort().map((username) => ({
      username,
      label: pendingBucket.get(username).label,
      sessionCount: pendingBucket.get(username).count,
    }));

    // ── RESULT SHAPE ────────────────────────────────────────────────────────
    return {
      monthKey,
      range: { start, end },
      clockedStud: {
        byStudent: clockedByStudent,
        totalMinutes: clockedTotal,
      },
      uncreditedPool: {
        byStudent: uncreditedByStudent,
        totalMinutes: uncreditedTotal,
      },
      adherence: {
        byStudentWeek: adherenceRows,
        byStudent: adherenceByStudentSorted,
      },
      flaggedSessions,
      absences,
      pending,
      counts: {
        timeEntries: timeEntries.length,
        students: studentIds.length,
        flaggedSessions: flaggedSessions.length,
        absences: absences.length,
        pending: pending.length,
        uncreditedMinutes: uncreditedTotal,
      },
    };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** @namespace window.Reconcile */
  global.Reconcile = Object.freeze({
    run,
    // Exposed for testing / reuse:
    parseMonthKey,
    monthDateRange,
    isoWeekLabel,
    buildRuns,
    matchRun,
  });

})(typeof window !== 'undefined' ? window : /* Node harness */ global);
