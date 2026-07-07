// Google Form response import — UP "Student Technician Class Schedule and Test Information"
// Accepts sheet rows (from XLSX or CSV) and produces scheduler student records.
const FormResponseImport = {
  LAB_START: '07:30',
  LAB_END: '17:30',
  SLOT_MINUTES: 60,

  _parseTime(t) {
    if (typeof SchedulerUtils !== 'undefined') return SchedulerUtils.parseTimeStr(t);
    const [h, m] = String(t).split(':').map(Number);
    return h * 60 + m;
  },

  _formatTime(mins) {
    if (typeof SchedulerUtils !== 'undefined') return SchedulerUtils.toTimeStr(mins);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  _localDateStr(date) {
    if (typeof SchedulerUtils !== 'undefined') return SchedulerUtils.localDateStr(date);
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  _stableColor(name) {
    if (typeof SchedulerUtils !== 'undefined') return SchedulerUtils.stableColor(name);
    return '#BDE0FF';
  },

  DAY_FULL_TO_SHORT: {
    monday: 'Mon',
    tuesday: 'Tue',
    wednesday: 'Wed',
    thursday: 'Thu',
    friday: 'Fri',
    saturday: 'Sat',
    sunday: 'Sun'
  },

  /** Exact column keys from Google Sheets .xlsx export of this form. */
  TEST_GROUPS: [
    ['Module Code', '  Test date  ', 'Start Time', 'End Time  '],
    ['Module code2', '  Test date   2', 'Start Time 2', 'End Time'],
    ['Module code 2', '  Test date   3', 'Start Time 3', 'End Time 2'],
    ['Module code 3', '  Test date   4', 'Start Time 4', 'End Time 3'],
    ['Module code 4', '  Test date   5', 'Start Time 5', 'End Time 4'],
    ['Module code 5', '  Test date   6', 'Start Time 6', 'End Time 5']
  ],

  /** Column keys when the same form is exported as CSV (duplicate headers suffixed). */
  TEST_GROUPS_CSV: [
    ['Module Code', '  Test date  ', 'Start Time', 'End Time  '],
    ['Module code', '  Test date  _1', 'Start Time_1', 'End Time'],
    ['Module code_1', '  Test date  _2', 'Start Time_2', 'End Time_1'],
    ['Module code_2', '  Test date  _3', 'Start Time_3', 'End Time_2'],
    ['Module code_3', '  Test date  _4', 'Start Time_4', 'End Time_3'],
    ['Module code_4', '  Test date  _5', 'Start Time_5', 'End Time_4']
  ],

  testGroupsForRow(row) {
    if ('Module code_1' in row || '  Test date  _1' in row) return this.TEST_GROUPS_CSV;
    return this.TEST_GROUPS;
  },

  /** Browser or Node: parse Google Sheets CSV export of this form */
  parseCsvText(csvText, options = {}) {
    let xlsxLib = typeof XLSX !== 'undefined' ? XLSX : null;
    if (!xlsxLib && typeof require === 'function') {
      try { xlsxLib = require('xlsx'); } catch (_) { /* browser bundle */ }
    }
    if (!xlsxLib) {
      throw new Error('SheetJS (XLSX) is required to import form CSV');
    }
    const wb = xlsxLib.read(csvText, { type: 'string' });
    const sheetName = wb.SheetNames[0];
    const rows = xlsxLib.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
    return this.parseRows(rows, options);
  },

  looksLikeFormExportText(text) {
    const head = (String(text).split(/\r?\n/)[0] || '').toLowerCase();
    return head.includes('student number') && head.includes('[07:30]');
  },

  detect(rows) {
    if (!Array.isArray(rows) || !rows.length) return false;
    const keys = Object.keys(rows[0] || {});
    const joined = keys.join(' ').toLowerCase();
    return joined.includes('student number') &&
      joined.includes('module code') &&
      keys.some((k) => /\[07:30\]/.test(k));
  },

  parseRows(rows, options = {}) {
    if (!this.detect(rows)) {
      return { students: [], mode: 'form-response', warnings: ['Not a recognized UP class schedule form export'] };
    }

    const labStart = options.labStart || this.LAB_START;
    const labEnd = options.labEnd || this.LAB_END;
    const timeCols = Object.keys(rows[0]).filter((k) => /^\s*\[\d{2}:\d{2}\]\s*$/.test(k));
    const students = [];
    const warnings = [];

    for (const row of rows) {
      const name = this._cell(row, '  Full name  ', 'Full name');
      if (!name) continue;

      const email = this._cell(row, 'Tuks E-mail Address', 'Email');
      const studentNumber = this.normalizeStudentNumber(
        this._cell(row, 'Student Number'),
        email
      );

      const unavailable = this.parseClassGrid(row, timeCols);
      const availability = this.invertToWeeklyAvailability(unavailable, labStart, labEnd);
      const testDates = this.parseTestDates(row);

      if (!availability.weekly.length) {
        warnings.push(`${name}: no weekly availability derived — check class grid or lab hours`);
      }

      students.push({
        id: '',
        name,
        email,
        studentNumber,
        color: this._stableColor(name),
        weekly_max_hours: 18,
        contracted_monthly_hours: 72,
        availability,
        testDates
      });
    }

    return { students, mode: 'form-response', warnings };
  },

  /** Browser or Node: parse ArrayBuffer / Buffer from .xlsx upload */
  parseXlsxArrayBuffer(arrayBuffer, options = {}) {
    let xlsxLib = typeof XLSX !== 'undefined' ? XLSX : null;
    if (!xlsxLib && typeof require === 'function') {
      try { xlsxLib = require('xlsx'); } catch (_) { /* not in Node bundle */ }
    }
    if (!xlsxLib) {
      throw new Error('SheetJS (XLSX) is required to import .xlsx files');
    }
    const wb = xlsxLib.read(arrayBuffer, { type: 'array', cellDates: true });
    const sheetName = wb.SheetNames[0];
    const rows = xlsxLib.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
    return this.parseRows(rows, options);
  },

  parseClassGrid(row, timeCols) {
    /** @type {Record<string, string[]>} dayFull -> slot starts */
    const byDay = {};
    for (const col of timeCols) {
      const slot = this._slotFromHeader(col);
      if (!slot) continue;
      const daysRaw = this._cell(row, col);
      if (!daysRaw) continue;
      for (const part of daysRaw.split(',')) {
        const dayFull = part.trim().toLowerCase();
        if (!dayFull) continue;
        if (!byDay[dayFull]) byDay[dayFull] = [];
        if (!byDay[dayFull].includes(slot)) byDay[dayFull].push(slot);
      }
    }
    return byDay;
  },

  invertToWeeklyAvailability(unavailableByDay, labStart, labEnd) {
    const weekly = [];
    const labStartMin = this._parseTime(labStart);
    const labEndMin = this._parseTime(labEnd);
    const weekdayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

    for (const dayFull of weekdayOrder) {
      const day = this.DAY_FULL_TO_SHORT[dayFull];
      if (!day) continue;

      const slots = unavailableByDay[dayFull] || [];
      if (!slots.length) {
        weekly.push({
          day,
          start: this._formatTime(labStartMin),
          end: this._formatTime(labEndMin),
          label: 'Available (no classes)'
        });
        continue;
      }

      const blocks = slots
        .map((s) => ({
          start: this._parseTime(s),
          end: this._parseTime(s) + this.SLOT_MINUTES
        }))
        .sort((a, b) => a.start - b.start);

      const merged = [];
      for (const b of blocks) {
        const last = merged[merged.length - 1];
        if (last && b.start <= last.end) {
          last.end = Math.max(last.end, b.end);
        } else {
          merged.push({ ...b });
        }
      }

      let cursor = labStartMin;
      for (const block of merged) {
        const gapStart = Math.max(cursor, labStartMin);
        const gapEnd = Math.min(block.start, labEndMin);
        if (gapEnd > gapStart) {
          weekly.push({
            day,
            start: this._formatTime(gapStart),
            end: this._formatTime(gapEnd),
            label: 'Available (outside class)'
          });
        }
        cursor = Math.max(cursor, block.end);
      }

      if (cursor < labEndMin) {
        weekly.push({
          day,
          start: this._formatTime(cursor),
          end: this._formatTime(labEndMin),
          label: 'Available (outside class)'
        });
      }
    }

    return { weekly, unavailable_dates: [] };
  },

  parseTestDates(row) {
    const tests = [];
    for (const [modKey, dateKey, startKey, endKey] of this.testGroupsForRow(row)) {
      const subject = this._cell(row, modKey);
      const dateRaw = row[dateKey];
      if (!subject || dateRaw === '' || dateRaw === null || dateRaw === undefined) continue;

      const date = this.excelDateToISO(dateRaw);
      const start = this.excelTimeToHHMM(row[startKey]);
      const end = this.excelTimeToHHMM(row[endKey]);
      if (!date || !start || !end) continue;

      tests.push({
        id: `test-${subject}-${date}-${start}`.replace(/\s+/g, '-'),
        date,
        start,
        end,
        subject: String(subject).trim(),
        description: ''
      });
    }
    return tests;
  },

  normalizeStudentNumber(raw, email) {
    let s = String(raw || '').trim().toLowerCase();
    if (s && !s.startsWith('u')) s = `u${s.replace(/^u?/, '')}`;
    if (!s && email) {
      const m = String(email).match(/^(u\d+)/i);
      if (m) s = m[1].toLowerCase();
    }
    return s;
  },

  excelDateToISO(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return this._localDateStr(value);
    }
    if (typeof value === 'string') {
      const s = value.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dmy) {
        const [, d, m, y] = dmy;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    const ms = Date.UTC(1899, 11, 30) + Math.round(n * 86400000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  },

  excelTimeToHHMM(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
    }
    if (typeof value === 'string') {
      const s = value.trim();
      const hm = s.match(/^(\d{1,2}):(\d{2})/);
      if (hm) return `${String(hm[1]).padStart(2, '0')}:${hm[2]}`;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const totalMins = Math.round(n * 24 * 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  _slotFromHeader(header) {
    const m = String(header).match(/\[(\d{2}:\d{2})\]/);
    return m ? m[1] : null;
  },

  _cell(row, ...keys) {
    for (const key of keys) {
      if (key in row) {
        const v = row[key];
        if (v !== null && v !== undefined && String(v).trim() !== '') {
          return String(v).trim();
        }
      }
    }
    return '';
  }
};

if (typeof window !== 'undefined') {
  window.FormResponseImport = FormResponseImport;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FormResponseImport };
}
