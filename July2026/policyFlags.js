/**
 * PolicyFlags  —  window.PolicyFlags.evaluate(session, ctx)
 *
 * Evaluates payroll session policy flags per Documentation/prelude.md §0.
 * Pure functions; no side effects; usable in Node harness without DOM.
 *
 * Canonical spec: Documentation/prelude.md §0
 * Prompt:         Cursor_Prompts_WorkedHours_Integration.md — D2
 *
 * Design decisions:
 *   - Per-date operational hours mirror SchedulingEngine.getOperationalHours:
 *     specialHours entry for the date, else defaultStart/defaultEnd.
 *   - TEST_CONFLICT mirrors SchedulingEngine.shiftConflictsWithStudentTest /
 *     studentShiftConflictsWithExams, using AssessmentManager.allExamsForStudent
 *     (interim data source until module timetable upload — Decisions Log §12.5).
 *   - Exam vs test inferred by AssessmentManager.isExaminationMonth(exam.date).
 *   - Admin-edited rows (session.edited): skip LATE_IN / EARLY_OUT only; other
 *     flags still apply on the verbatim recorded interval.
 *   - UNROSTERED and ABSENCE are evaluated by Reconcile (E2), not here.
 *   - PayrollParser anomalies (OPEN_SESSION, ZERO_DURATION, NEGATIVE_DURATION)
 *     are passed through unchanged.
 *   - Returns a deterministically sorted deduplicated flag array.
 */
(function (global) {
  'use strict';

  /** Tunable constant from prelude §0. */
  const LATE_GRACE_MIN = 0;

  /** Five hours in minutes — OVER_5H threshold. */
  const OVER_5H_THRESHOLD = 5 * 60;

  /** Anomaly flags forwarded from PayrollParser without re-evaluation. */
  const PASSTHROUGH_ANOMALIES = new Set([
    'OPEN_SESSION',
    'ZERO_DURATION',
    'NEGATIVE_DURATION',
  ]);

  // ─── Time helpers ─────────────────────────────────────────────────────────

  function timeToMinutes(t) {
    if (typeof t === 'number') return Number.isFinite(t) ? t : null;
    if (typeof t !== 'string') return null;
    const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  function resolveMinutes(value) {
    return timeToMinutes(value);
  }

  function sessionDateISO(session) {
    if (session && session.dateISO) return session.dateISO;
    const iso = session && session.shiftStartedISO;
    return iso && typeof iso === 'string' ? iso.slice(0, 10) : null;
  }

  // ─── Operational hours (SchedulingEngine.getOperationalHours pattern) ─────

  /**
   * Resolve per-date operational window from ctx.operationalHours.
   * Matches SchedulingEngine.getOperationalHours — specialHours override,
   * else defaultStart/defaultEnd (never hardcoded 06:00–19:00 without config).
   *
   * @param {Object|null|undefined} operationalHours
   * @param {string} dateStr  YYYY-MM-DD
   * @returns {{ start: string, end: string, name: string }}
   */
  function getOperationalHours(operationalHours, dateStr) {
    const oh = operationalHours || {};
    const special = (oh.specialHours || []).find((s) => s.date === dateStr);
    if (special) {
      return {
        start: special.start,
        end: special.end,
        name: special.name || 'Special hours',
      };
    }
    if (oh.defaultStart && oh.defaultEnd) {
      return { start: oh.defaultStart, end: oh.defaultEnd, name: 'Normal hours' };
    }
    // F-05: no per-date window configured → return null. Callers must NOT fall
    // back to a hardcoded 06:00–19:00 window (prelude §0: never hardcode; the
    // window varies with holidays/special hours and may extend to max 22:00).
    return null;
  }

  // ─── TEST_CONFLICT (mirrors schedulingEngine.shiftConflictsWithStudentTest) ─

  /**
   * Whether a worked interval conflicts with one assessment block.
   * Logic aligned with SchedulingEngine.shiftConflictsWithStudentTest.
   *
   * Exam months (June/November): any work on D−1; on D any work before
   * exam_end + POST_EXAM_BUFFER, including overlap.
   * Other months: overlap on D, or work starting before exam_end + buffer
   * while extending past exam_end.
   */
  function sessionConflictsWithAssessment(
    sessionDate,
    sessionStart,
    sessionEnd,
    examDate,
    testStart,
    testEnd,
    assessmentManager
  ) {
    const am = assessmentManager;
    const post = am.POST_EXAM_BUFFER_MINS;

    if (am.isExaminationMonth(examDate)) {
      const dayBefore = am.previousDateStr(examDate);
      if (sessionDate === dayBefore) return true;
      if (sessionDate !== examDate) return false;
      if (sessionStart < testEnd && sessionEnd > testStart) return true;
      if (sessionStart < testEnd + post) return true;
      return false;
    }

    if (sessionDate !== examDate) return false;
    if (sessionStart < testEnd && sessionEnd > testStart) return true;
    if (sessionStart < testEnd + post && sessionEnd > testEnd) return true;
    return false;
  }

  function hasTestConflict(session, student, assessmentManager) {
    if (!student || !assessmentManager) return false;

    const sessionDate = sessionDateISO(session);
    const sessionStart = resolveMinutes(session.recordedStartMinutes);
    const sessionEnd = resolveMinutes(session.recordedEndMinutes);
    if (!sessionDate || sessionStart === null || sessionEnd === null) return false;

    for (const exam of assessmentManager.allExamsForStudent(student)) {
      const testStart = timeToMinutes(exam.start || '00:00');
      const testEnd = timeToMinutes(exam.end || '00:00');
      if (
        sessionConflictsWithAssessment(
          sessionDate,
          sessionStart,
          sessionEnd,
          exam.date,
          testStart,
          testEnd,
          assessmentManager
        )
      ) {
        return true;
      }
    }
    return false;
  }

  // ─── Individual flag checks ───────────────────────────────────────────────

  function checkLateIn(session) {
    const clockIn = resolveMinutes(session.clockInMinutes);
    const blockStart = resolveMinutes(session.blockStartMinutes);
    if (clockIn === null || blockStart === null) return false;
    return clockIn > blockStart + LATE_GRACE_MIN;
  }

  function checkEarlyOut(session) {
    const recordedEnd = resolveMinutes(session.recordedEndMinutes);
    const blockEnd = resolveMinutes(session.blockEndMinutes);
    if (recordedEnd === null || blockEnd === null) return false;
    return recordedEnd < blockEnd;
  }

  function checkOutsideHours(session, operationalHours) {
    const dateStr = sessionDateISO(session);
    const recordedStart = resolveMinutes(session.recordedStartMinutes);
    const recordedEnd = resolveMinutes(session.recordedEndMinutes);
    if (!dateStr || recordedStart === null || recordedEnd === null) return false;

    const op = getOperationalHours(operationalHours, dateStr);
    if (!op) return false; // F-05: cannot evaluate without a configured window — do not guess
    const opStart = timeToMinutes(op.start);
    const opEnd = timeToMinutes(op.end);
    if (opStart === null || opEnd === null) return false;

    return recordedStart < opStart || recordedEnd > opEnd;
  }

  function checkOver5h(session) {
    const worked = session.workedMinutes;
    return typeof worked === 'number' && worked > OVER_5H_THRESHOLD;
  }

  function passthroughAnomalies(session) {
    const anomalies = session && session.anomalies;
    if (!Array.isArray(anomalies)) return [];
    return anomalies.filter((a) => PASSTHROUGH_ANOMALIES.has(a));
  }

  // ─── Main evaluate function ───────────────────────────────────────────────

  /**
   * evaluate(session, ctx) → string[]
   *
   * @param {Object} session
   *   Normalized session from WorkedHoursNormalizer (or equivalent shape).
   *   Relevant fields: dateISO, shiftStartedISO, clockInMinutes,
   *   recordedStartMinutes, recordedEndMinutes, workedMinutes,
   *   blockStartMinutes, blockEndMinutes, edited, anomalies.
   *
   * @param {Object} ctx
   *   @param {Object} [ctx.operationalHours]  Same shape as state.operationalHours
   *   @param {Object} [ctx.student]           Resolved student record
   *   @param {Object} [ctx.assessmentManager]  Defaults to global.AssessmentManager
   *
   * @returns {string[]}  Deterministically sorted, deduplicated flag codes.
   *
   * Flags evaluated here:
   *   LATE_IN, EARLY_OUT, OUTSIDE_HOURS, OVER_5H, TEST_CONFLICT,
   *   OPEN_SESSION, ZERO_DURATION, NEGATIVE_DURATION, EDITED
   *
   * Not evaluated here (E2): UNROSTERED, ABSENCE
   */
  function evaluate(session, ctx) {
    ctx = ctx || {};
    const flags = new Set();
    const assessmentManager =
      ctx.assessmentManager ||
      (typeof global !== 'undefined' ? global.AssessmentManager : null);

    // PayrollParser anomalies — pass through unchanged.
    for (const a of passthroughAnomalies(session)) {
      flags.add(a);
    }

    if (session && session.edited) {
      flags.add('EDITED');
    }

    // Open / incomplete sessions: anomaly flags only (no schedule-relative checks).
    if (
      !session ||
      session.status === 'open' ||
      !session.shiftEndedISO ||
      session.normalizationNote === 'open_session'
    ) {
      return [...flags].sort();
    }

    if (session.edited) {
      // Admin bypass: no LATE_IN / EARLY_OUT; other flags still apply.
      if (checkOutsideHours(session, ctx.operationalHours)) flags.add('OUTSIDE_HOURS');
      if (checkOver5h(session)) flags.add('OVER_5H');
      if (hasTestConflict(session, ctx.student, assessmentManager)) {
        flags.add('TEST_CONFLICT');
      }
      return [...flags].sort();
    }

    if (checkLateIn(session)) flags.add('LATE_IN');
    if (checkEarlyOut(session)) flags.add('EARLY_OUT');
    if (checkOutsideHours(session, ctx.operationalHours)) flags.add('OUTSIDE_HOURS');
    if (checkOver5h(session)) flags.add('OVER_5H');
    if (hasTestConflict(session, ctx.student, assessmentManager)) {
      flags.add('TEST_CONFLICT');
    }

    return [...flags].sort();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** @namespace window.PolicyFlags */
  global.PolicyFlags = Object.freeze({
    evaluate,
    getOperationalHours,
    LATE_GRACE_MIN,
    OVER_5H_THRESHOLD,
    sessionConflictsWithAssessment,
  });

})(typeof window !== 'undefined' ? window : /* Node harness */ global);
