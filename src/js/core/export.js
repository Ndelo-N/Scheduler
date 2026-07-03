// Phase 7 — Schedule export, state serialization, validation
const SchedulerExport = {
  STATE_VERSION: 1,

  escapeCsvCell(value) {
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  },

  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  },

  shiftsToCsvRows(shifts, { includeMonth = false } = {}) {
    const header = includeMonth
      ? ['month', 'date', 'start', 'end', 'required', 'student_id', 'student_name']
      : ['date', 'start', 'end', 'required', 'student_id', 'student_name'];
    const rows = [header];

    const sorted = [...shifts].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.start.localeCompare(b.start);
    });

    for (const shift of sorted) {
      const monthLabel = shift.date ? shift.date.slice(0, 7) : '';
      const assignees = shift.assignees || [];
      const base = [
        shift.date,
        shift.start,
        shift.end,
        String(shift.required || 1)
      ];

      if (!assignees.length) {
        rows.push(includeMonth ? [monthLabel, ...base, '', ''] : [...base, '', '']);
        continue;
      }

      for (const assignee of assignees) {
        const id = typeof assignee === 'object' ? assignee.id : assignee;
        const name = typeof assignee === 'object' ? assignee.name : '';
        rows.push(includeMonth ? [monthLabel, ...base, id, name] : [...base, id, name]);
      }
    }

    return rows;
  },

  exportCSV(shifts, options = {}) {
    const rows = this.shiftsToCsvRows(shifts, options);
    const csv = rows.map(r => r.map(v => this.escapeCsvCell(v)).join(',')).join('\n');
    const filename = options.filename || 'schedule.csv';
    this.downloadFile(csv, filename, 'text/csv;charset=utf-8;');
    return rows.length - 1;
  },

  complianceToCsvRows(rows) {
    const header = [
      'student_id', 'name', 'contracted_hours', 'assigned_hours',
      'remaining_hours', 'pct', 'status', 'contract_type'
    ];
    const data = [header];
    for (const row of rows || []) {
      data.push([
        row.studentId,
        row.name,
        row.contracted,
        row.assigned,
        row.remaining,
        row.pct,
        row.status,
        row.contractType
      ]);
    }
    return data;
  },

  exportComplianceCSV(rows, options = {}) {
    const data = this.complianceToCsvRows(rows);
    const csv = data.map(r => r.map(v => this.escapeCsvCell(v)).join(',')).join('\n');
    const filename = options.filename || 'contract-compliance.csv';
    this.downloadFile(csv, filename, 'text/csv;charset=utf-8;');
    return data.length - 1;
  },

  toIcsDateTime(dateStr, timeStr) {
    const d = new Date(`${dateStr}T${timeStr}:00`);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  },

  sanitizeFilename(name) {
    return (name || 'student').replace(/[^a-z0-9_-]+/gi, '_') || 'student';
  },

  buildStudentIcs(studentId, events, student) {
    let ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//StudentShiftScheduler//EN',
      'CALSCALE:GREGORIAN'
    ].join('\n') + '\n';

    for (const ev of events) {
      const uid = `${ev.date}-${ev.start}-${studentId}@studentshifts`;
      ics += [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${this.toIcsDateTime(ev.date, ev.start)}`,
        `DTSTART:${this.toIcsDateTime(ev.date, ev.start)}`,
        `DTEND:${this.toIcsDateTime(ev.date, ev.end)}`,
        `SUMMARY:${student.name} shift ${ev.start}-${ev.end}`,
        'DESCRIPTION:Assigned by Student Shift Scheduler PWA',
        'END:VEVENT'
      ].join('\n') + '\n';
    }

    ics += 'END:VCALENDAR';
    return ics;
  },

  exportICSPerStudent(shifts, students) {
    const byStudent = {};
    const studentMap = new Map(students.map(s => [String(s.id), s]));

    for (const shift of shifts) {
      for (const assignee of shift.assignees || []) {
        const id = String(typeof assignee === 'object' ? assignee.id : assignee);
        if (!byStudent[id]) byStudent[id] = [];
        byStudent[id].push(shift);
      }
    }

    let count = 0;
    for (const [id, events] of Object.entries(byStudent)) {
      const student = studentMap.get(id) || { name: 'Student' };
      const ics = this.buildStudentIcs(id, events, student);
      this.downloadFile(
        ics,
        `${this.sanitizeFilename(student.name)}.ics`,
        'text/calendar;charset=utf-8;'
      );
      count++;
    }

    return count;
  },

  normalizeStatePayload(data) {
    if (!data || typeof data !== 'object') return null;
    return {
      version: data.version ?? 1,
      savedAt: data.savedAt || null,
      year: data.year,
      month: data.month,
      threeMonthView: !!data.threeMonthView,
      students: Array.isArray(data.students) ? data.students : [],
      templates: Array.isArray(data.templates) ? data.templates : [],
      testShifts: Array.isArray(data.testShifts) ? data.testShifts : [],
      operationalHours: data.operationalHours || null,
      assessmentPeriods: Array.isArray(data.assessmentPeriods) ? data.assessmentPeriods : [],
      swapDebts: Array.isArray(data.swapDebts) ? data.swapDebts : [],
      fairness: data.fairness && typeof data.fairness === 'object' ? data.fairness : {},
      defaultMonthlyTarget: data.defaultMonthlyTarget,
      contractHistory: Array.isArray(data.contractHistory) ? data.contractHistory : [],
      availabilityAccess: data.availabilityAccess && typeof data.availabilityAccess === 'object'
        ? data.availabilityAccess
        : {},
      testDateAccess: data.testDateAccess && typeof data.testDateAccess === 'object'
        ? data.testDateAccess
        : {},
      assessmentSchedules: Array.isArray(data.assessmentSchedules) ? data.assessmentSchedules : [],
      hoursLedger: data.hoursLedger && typeof data.hoursLedger === 'object'
        ? data.hoursLedger
        : { entries: {}, approvedReductions: {}, contractPeriods: null },
      shifts: Array.isArray(data.shifts) ? data.shifts : [],
      monthSchedules: data.monthSchedules && typeof data.monthSchedules === 'object'
        ? data.monthSchedules
        : null
    };
  },

  validateStatePayload(data) {
    const errors = [];
    if (!data) {
      errors.push('Invalid or empty file');
      return errors;
    }
    if (data.version != null && data.version > this.STATE_VERSION) {
      errors.push(`Unsupported state version ${data.version} (max ${this.STATE_VERSION})`);
    }
    if (!Array.isArray(data.students)) errors.push('Missing students array');
    if (data.year == null || Number.isNaN(Number(data.year))) errors.push('Missing year');
    if (data.month == null || Number.isNaN(Number(data.month))) errors.push('Missing month');
    if (!Array.isArray(data.shifts) && !data.monthSchedules) {
      errors.push('Missing shifts or monthSchedules');
    }
    return errors;
  },

  describeState(data) {
    const shiftCount = data.monthSchedules
      ? Object.values(data.monthSchedules).reduce((n, arr) => n + (arr?.length || 0), 0)
      : (data.shifts?.length || 0);
    const monthLabel = `${data.year}-${String(Number(data.month) + 1).padStart(2, '0')}`;
    return {
      monthLabel,
      studentCount: data.students?.length || 0,
      shiftCount,
      savedAt: data.savedAt
    };
  }
};

window.SchedulerExport = SchedulerExport;
