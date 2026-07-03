/**
 * PayrollParser  —  window.PayrollParser.parseWorkbook(arrayBuffer)
 *
 * Parses a VeraLab "DetailedPayroll" .xls export (ArrayBuffer) using SheetJS
 * (window.XLSX) and returns a normalised, deterministic array of time-entry
 * objects ready for upsert into the `timeEntries` IndexedDB store.
 *
 * Canonical spec: Documentation/prelude.md §0
 * Prompt:         Cursor_Prompts_WorkedHours_Integration.md — C1
 *
 * Design decisions (see prelude §0 for rationale):
 *   - Non-breaking-space headers normalised before lookup.
 *   - Header→column index stored in an Object.create(null) map (prototype-
 *     pollution-safe); only whitelisted column names are accepted.
 *   - IP columns dropped at parse time — never reach the entry object.
 *   - Duration recomputed from clock times; Total Time used only as a
 *     ±1-minute sanity check.
 *   - Timestamps formatted from JS Date *local* components — no UTC conversion
 *     (SAST naïve wall-clock, per spec).
 *   - Output sorted deterministically: username ASC, shiftStartedISO ASC.
 */
(function (global) {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────────────────

  /** Columns we expect in the export (after \u00a0 normalisation). */
  const EXPECTED_COLUMNS = new Set([
    'Username',
    'First Name',
    'Last Name',
    'Shift Started',
    'Shift Ended',
    'Pay Rate',
    'Total Time',
    'Total Pay',
    'Sign On IP Address',
    'Sign Out IP Address',
    'Edited By',
    "Editor's First Name",
    "Editor's Last Name",
    'Date Edited',
  ]);

  /** Columns containing PII that must never appear in output (prelude §0). */
  const DROP_COLUMNS = new Set([
    'Sign On IP Address',
    'Sign Out IP Address',
  ]);

  // ─── Header utilities ─────────────────────────────────────────────────────

  /**
   * Replaces all non-breaking spaces (\u00a0) with regular spaces and trims.
   * VeraLab exports use \u00a0 in headers; normalise before any lookup.
   */
  function normaliseHeader(raw) {
    return String(raw == null ? '' : raw)
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  /**
   * Build a prototype-pollution-safe map of normalised column name → 0-based
   * column index.  Only whitelisted names (EXPECTED_COLUMNS) are accepted;
   * any header whose normalised form is not in the whitelist is silently
   * ignored (it will never appear as a key in the map).
   *
   * Using Object.create(null) means the map has no prototype, so even a raw
   * header value of '__proto__' or 'constructor' cannot pollute Object.
   */
  function buildHeaderMap(headerRow) {
    const map = Object.create(null);
    for (let i = 0; i < headerRow.length; i++) {
      const norm = normaliseHeader(headerRow[i]);
      if (
        EXPECTED_COLUMNS.has(norm) &&
        !DROP_COLUMNS.has(norm) &&                 // F-13: PII columns never enter the map
        !Object.prototype.hasOwnProperty.call(map, norm)
      ) {
        map[norm] = i;
      }
    }
    return map;
  }

  // ─── Date / time helpers ──────────────────────────────────────────────────

  /**
   * Format a JS Date to a naïve local ISO string (YYYY-MM-DDTHH:MM:SS).
   * Deliberately uses getFullYear/getMonth/… (local) — never toISOString()
   * (which is UTC) — because payroll timestamps are SAST wall-clock.
   */
  function toLocalISO(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    const p = (n) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
      `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    );
  }

  /**
   * Convert an Excel date serial to a local-time ISO string.
   * Fallback for cells where SheetJS leaves a numeric serial instead of a
   * Date object (e.g. cells with an unrecognised date format code).
   * Excel epoch is 1899-12-30 (accounts for the Lotus 1-2-3 leap-year bug).
   */
  function excelSerialToLocalISO(serial) {
    const MS_PER_DAY = 86400000;
    // new Date(year, month, day) constructs in local time.
    const excelEpoch = new Date(1899, 11, 30).getTime();
    return toLocalISO(new Date(excelEpoch + serial * MS_PER_DAY));
  }

  /**
   * Coerce a SheetJS cell value that represents a datetime to a naïve local
   * ISO string.  Handles:
   *   - JS Date  (cellDates:true, standard case)
   *   - number   (Excel serial — fallback for unrecognised format codes)
   *   - string   (pre-formatted by SheetJS or already ISO-like)
   * Returns null for empty / unrecognisable values.
   */
  function cellToLocalISO(cell) {
    if (cell instanceof Date) return toLocalISO(cell);
    if (typeof cell === 'number' && cell > 0) return excelSerialToLocalISO(cell);
    if (typeof cell === 'string' && cell.trim()) {
      // F-11: only accept ISO-shaped strings ("YYYY-MM-DD" optionally with a
      // "T"/" " time). SheetJS returns Date objects under cellDates:true, so this
      // is a fallback; an unrecognisable string is treated as missing (null)
      // rather than passed through to corrupt monthKey/dateISO slices downstream.
      const s = cell.trim();
      const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?$/.exec(s);
      if (!m) return null;
      return m[2] ? `${m[1]}T${m[2]}` : `${m[1]}T00:00:00`;
    }
    return null;
  }

  /**
   * Compute the difference in whole minutes between two naïve local ISO
   * strings.  Using new Date() on a string like "2025-03-14T09:30:00" causes
   * the JS engine to interpret it as LOCAL time (no trailing Z), which is
   * exactly what we want here.
   */
  function diffMinutes(startISO, endISO) {
    if (!startISO || !endISO) return null;
    const s = new Date(startISO);
    const e = new Date(endISO);
    if (isNaN(s) || isNaN(e)) return null;
    return Math.round((e.getTime() - s.getTime()) / 60000);
  }

  /**
   * Parse a "Total Time" cell value to whole minutes.
   * The cell can arrive as:
   *   - Date   (SheetJS may represent HH:MM duration as a Date at epoch+offset)
   *   - number (Excel time serial = fraction of 24 h, e.g. 0.5 = 12 h)
   *   - string (e.g. "2:30" or "02:30:00")
   * Returns null when the value cannot be interpreted.
   */
  function parseTotalTimeMinutes(cell) {
    if (cell == null || cell === '') return null;
    if (cell instanceof Date) {
      // SheetJS time-only Date: midnight-relative — hour/minute give duration.
      return cell.getHours() * 60 + cell.getMinutes();
    }
    if (typeof cell === 'number') {
      // Fraction of a day.
      return Math.round(cell * 24 * 60);
    }
    if (typeof cell === 'string') {
      const m = cell.trim().match(/^(\d+):(\d{2})/);
      if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    }
    return null;
  }

  /** Extract YYYY-MM-DD date part from a local ISO string. */
  function datePartFromISO(iso) {
    return iso ? iso.slice(0, 10) : null;
  }

  /** Extract YYYY-MM calendar month key from a local ISO string. */
  function monthKeyFromISO(iso) {
    return iso ? iso.slice(0, 7) : null;
  }

  // ─── Core parser ──────────────────────────────────────────────────────────

  /**
   * parseWorkbook(arrayBuffer) → { entries, warnings, sheetName }
   *
   * @param  {ArrayBuffer} arrayBuffer  Raw bytes of the .xls / .xlsx file.
   * @returns {{ entries: Object[], warnings: string[], sheetName: string }}
   *
   * Each entry contains:
   *   naturalKey      {string}       "username|shiftStartedISO" — upsert key
   *   username        {string}
   *   firstName       {string}
   *   lastName        {string}
   *   shiftStartedISO {string|null}  Naïve local ISO (YYYY-MM-DDTHH:MM:SS)
   *   shiftEndedISO   {string|null}  Null when session is open
   *   computedMinutes {number|null}  Null for open / anomalous sessions
   *   status          {'complete'|'open'}
   *   edited          {boolean}      true when Edited By is non-empty
   *   editedBy        {string|null}
   *   editorFirstName {string|null}
   *   editorLastName  {string|null}
   *   dateEdited      {string|null}  Naïve local ISO or raw string
   *   dateISO         {string|null}  YYYY-MM-DD of Shift Started
   *   monthKey        {string|null}  YYYY-MM calendar month of Shift Started
   *   anomalies       {string[]}     Any of: OPEN_SESSION, NEGATIVE_DURATION,
   *                                  ZERO_DURATION, DURATION_MISMATCH
   *
   * IP address fields are NEVER present in output (PII minimisation).
   */
  function parseWorkbook(arrayBuffer) {
    if (!global.XLSX) {
      throw new Error('PayrollParser: window.XLSX (SheetJS) is not loaded');
    }

    // ── 1. Read workbook ────────────────────────────────────────────────────
    const wb = global.XLSX.read(new Uint8Array(arrayBuffer), {
      type: 'array',
      cellDates: true,   // Datetime cells → JS Date objects
      cellNF: false,     // Skip number-format strings (not needed)
      cellText: false,   // Skip pre-formatted text (we format ourselves)
    });

    // ── 2. Locate 'report' sheet ────────────────────────────────────────────
    const sheetName =
      wb.SheetNames.find((n) => n.toLowerCase() === 'report') ||
      wb.SheetNames[0];
    if (!sheetName) {
      throw new Error('PayrollParser: workbook contains no sheets');
    }
    const ws = wb.Sheets[sheetName];

    // ── 3. Extract raw rows (array-of-arrays, header row first) ─────────────
    const rows = global.XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      blankrows: false,
    });
    if (!rows.length) {
      return { entries: [], warnings: ['Sheet is empty'], sheetName };
    }

    const headerMap = buildHeaderMap(rows[0]);
    const warnings = [];

    // Warn about missing required columns (never throw — partial data is valid).
    for (const req of ['Username', 'Shift Started']) {
      if (!Object.prototype.hasOwnProperty.call(headerMap, req)) {
        warnings.push(`Missing required column: "${req}"`);
      }
    }

    // Helper: safely read a cell by column name.
    const get = (row, colName) => {
      const idx = headerMap[colName];
      return idx !== undefined ? row[idx] : undefined;
    };

    // ── 4. Parse data rows ───────────────────────────────────────────────────
    const entries = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];

      // Skip genuinely blank rows.
      if (row.every((c) => c === '' || c == null)) continue;

      // ── Identity fields ──────────────────────────────────────────────────
      const username = String(get(row, 'Username') ?? '').trim();
      const firstName = String(get(row, 'First Name') ?? '').trim();
      const lastName = String(get(row, 'Last Name') ?? '').trim();

      // ── Timestamps (naïve local) ─────────────────────────────────────────
      const shiftStartedISO = cellToLocalISO(get(row, 'Shift Started'));
      const shiftEndedRaw = get(row, 'Shift Ended');
      // Treat blank string, null, undefined, and 0 all as "no end time".
      const shiftEndedISO =
        shiftEndedRaw === '' || shiftEndedRaw == null || shiftEndedRaw === 0
          ? null
          : cellToLocalISO(shiftEndedRaw);

      // ── Admin-edit flag ──────────────────────────────────────────────────
      const editedByRaw = String(get(row, 'Edited By') ?? '').trim();
      const edited = editedByRaw.length > 0;

      // ── Duration and anomaly detection ──────────────────────────────────
      const anomalies = [];
      let status = 'complete';
      let computedMinutes = null;

      if (!shiftEndedISO) {
        // Open session: Shift Ended is absent.
        status = 'open';
        anomalies.push('OPEN_SESSION');
      } else {
        computedMinutes = diffMinutes(shiftStartedISO, shiftEndedISO);

        if (computedMinutes === null) {
          // Could not compute — treat as open.
          status = 'open';
          anomalies.push('OPEN_SESSION');
        } else if (computedMinutes < 0) {
          anomalies.push('NEGATIVE_DURATION');
        } else if (computedMinutes === 0) {
          anomalies.push('ZERO_DURATION');
        }

        // Sanity-check against exported Total Time (±1 minute tolerance).
        const totalTimeMinutes = parseTotalTimeMinutes(get(row, 'Total Time'));
        if (
          totalTimeMinutes !== null &&
          computedMinutes !== null &&
          Math.abs(computedMinutes - totalTimeMinutes) > 1
        ) {
          anomalies.push('DURATION_MISMATCH');
          warnings.push(
            `Row ${r + 1} (${username}): computed ${computedMinutes} min` +
              ` vs Total Time ${totalTimeMinutes} min`
          );
        }
      }

      // ── Date / month derivation ──────────────────────────────────────────
      const dateISO = datePartFromISO(shiftStartedISO);
      const monthKey = monthKeyFromISO(shiftStartedISO);

      // Natural key: username|shiftStartedISO (upsert key in timeEntries store).
      // F-11: when Shift Started is absent/unparseable, do NOT collapse every such
      // row to "username|null" (which would silently overwrite distinct rows).
      // Use a per-row discriminator and flag the row for review instead.
      let naturalKey;
      if (shiftStartedISO) {
        naturalKey = `${username}|${shiftStartedISO}`;
      } else {
        naturalKey = `${username}|NO_START#${r}`;
        anomalies.push('MISSING_START');
        warnings.push(`Row ${r + 1} (${username || 'unknown'}): missing/unparseable Shift Started`);
      }

      // ── Date Edited ──────────────────────────────────────────────────────
      const dateEditedRaw = get(row, 'Date Edited');
      const dateEdited =
        dateEditedRaw instanceof Date
          ? toLocalISO(dateEditedRaw)
          : dateEditedRaw
          ? String(dateEditedRaw)
          : null;

      // ── Build entry (IP fields intentionally absent) ──────────────────────
      entries.push({
        // `id` is the IndexedDB `timeEntries` keyPath (StorageManager.upsertTimeEntries).
        // It is identical to naturalKey; kept as a distinct field so the store can
        // derive an inline key without a remap step at the ingest boundary (F-04).
        id: naturalKey,
        naturalKey,
        username,
        firstName,
        lastName,
        shiftStartedISO,
        shiftEndedISO,
        computedMinutes,
        status,
        edited,
        editedBy: edited ? editedByRaw : null,
        editorFirstName: edited
          ? String(get(row, "Editor's First Name") ?? '').trim() || null
          : null,
        editorLastName: edited
          ? String(get(row, "Editor's Last Name") ?? '').trim() || null
          : null,
        dateEdited,
        dateISO,
        monthKey,
        anomalies,
      });
    }

    // ── 5. Deterministic sort: username ASC, shiftStartedISO ASC ────────────
    entries.sort((a, b) => {
      if (a.username < b.username) return -1;
      if (a.username > b.username) return 1;
      const sa = a.shiftStartedISO ?? '';
      const sb = b.shiftStartedISO ?? '';
      if (sa < sb) return -1;
      if (sa > sb) return 1;
      return 0;
    });

    return { entries, warnings, sheetName };
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** @namespace window.PayrollParser */
  global.PayrollParser = Object.freeze({ parseWorkbook });

})(typeof window !== 'undefined' ? window : /* Node harness */ global);
