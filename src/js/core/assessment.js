// Phase 10 — Test periods, student test dates, assessment workflow
const AssessmentManager = {
  PERIOD_TEMPLATES: [
    { id: 'midterms', name: 'Midterms', durationDays: 14, notificationDaysBefore: 30 },
    { id: 'finals', name: 'Finals', durationDays: 21, notificationDaysBefore: 30 },
    { id: 'week', name: 'Exam week', durationDays: 7, notificationDaysBefore: 14 }
  ],

  /** Formal examination calendar months (0-indexed: 5 = June, 10 = November) */
  EXAMINATION_MONTHS: [5, 10],
  POST_EXAM_BUFFER_MINS: 60,

  defaultAccess() {
    return {
      canEdit: true,
      status: 'draft',
      submittedAt: null,
      updatedAt: null,
      history: []
    };
  },

  statusIcon(access) {
    if (!access) return '—';
    if (access.status === 'locked' || !access.canEdit) return '🔒';
    if (access.status === 'submitted') return '✅';
    return '📝';
  },

  statusLabel(access) {
    if (!access) return 'Unknown';
    if (access.status === 'locked') return 'Locked';
    if (access.status === 'submitted') return 'Submitted';
    if (access.canEdit) return 'Draft';
    return 'No access';
  },

  normalizePeriod(raw) {
    return {
      id: raw.id || `ap-${raw.startDate}-${raw.endDate}`,
      startDate: raw.startDate,
      endDate: raw.endDate,
      name: raw.name || 'Assessment period',
      notificationDaysBefore: Number(raw.notificationDaysBefore) || 30,
      submissionDeadline: raw.submissionDeadline || raw.endDate,
      status: raw.status || 'open'
    };
  },

  normalizeTestDate(raw) {
    return {
      id: raw.id || String(Date.now()),
      testPeriodId: raw.testPeriodId || null,
      date: raw.date,
      start: raw.start || raw.startTime,
      end: raw.end || raw.endTime,
      subject: raw.subject || '',
      description: raw.description || ''
    };
  },

  templateById(id) {
    return this.PERIOD_TEMPLATES.find(t => t.id === id) || null;
  },

  periodFromTemplate(templateId, startDate) {
    const tpl = this.templateById(templateId);
    if (!tpl || !startDate) throw new Error('Template and start date required');
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + tpl.durationDays - 1);
    return {
      startDate,
      endDate: SchedulerUtils.localDateStr(end),
      name: tpl.name,
      notificationDaysBefore: tpl.notificationDaysBefore,
      submissionDeadline: SchedulerUtils.localDateStr(end),
      status: 'open'
    };
  },

  findTestOverlaps(testDates) {
    const overlaps = [];
    const byDate = {};
    for (const t of testDates || []) {
      if (!t.date) continue;
      if (!byDate[t.date]) byDate[t.date] = [];
      byDate[t.date].push(t);
    }
    for (const [date, blocks] of Object.entries(byDate)) {
      const sorted = [...blocks].sort((a, b) =>
        SchedulerUtils.parseTimeStr(a.start) - SchedulerUtils.parseTimeStr(b.start)
      );
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        if (SchedulerUtils.parseTimeStr(a.end) > SchedulerUtils.parseTimeStr(b.start)) {
          overlaps.push({ date, testA: a, testB: b });
        }
      }
    }
    return overlaps;
  },

  validateTestDates(testDates, period = null) {
    const errors = [];
    const normalized = (testDates || []).map(t => this.normalizeTestDate(t));

    if (!normalized.length) {
      errors.push('Add at least one test date');
    }

    for (const t of normalized) {
      if (!t.date) {
        errors.push('Test date missing date');
        continue;
      }
      if (!t.start || !t.end) {
        errors.push(`Test on ${t.date} missing start/end times`);
        continue;
      }
      if (SchedulerUtils.parseTimeStr(t.end) <= SchedulerUtils.parseTimeStr(t.start)) {
        errors.push(`${t.date}: end time must be after start time`);
      }
      if (period) {
        const d = new Date(t.date + 'T00:00:00');
        const ps = new Date(period.startDate + 'T00:00:00');
        const pe = new Date(period.endDate + 'T00:00:00');
        if (d < ps || d > pe) {
          errors.push(`${t.date} is outside assessment period ${period.name}`);
        }
      }
    }

    for (const o of this.findTestOverlaps(normalized)) {
      errors.push(`${o.date}: overlapping tests (${o.testA.start}–${o.testA.end} and ${o.testB.start}–${o.testB.end})`);
    }

    return { valid: errors.length === 0, errors, normalized };
  },

  getActivePeriod(periods, dateStr = null) {
    const check = dateStr || SchedulerUtils.localDateStr(new Date());
    const d = new Date(check + 'T00:00:00');
    return (periods || []).find(ap => {
      const start = new Date(ap.startDate + 'T00:00:00');
      const end = new Date(ap.endDate + 'T00:00:00');
      return d >= start && d <= end;
    }) || null;
  },

  getUpcomingPeriod(periods, dateStr = null) {
    const check = dateStr || SchedulerUtils.localDateStr(new Date());
    const today = new Date(check + 'T00:00:00');
    return (periods || [])
      .map(ap => this.normalizePeriod(ap))
      .filter(ap => new Date(ap.startDate + 'T00:00:00') > today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] || null;
  },

  getDueNotifications(periods, students, testDateAccess, todayStr = null) {
    const today = todayStr || SchedulerUtils.localDateStr(new Date());
    const messages = [];

    for (const raw of periods || []) {
      const ap = this.normalizePeriod(raw);
      const notifyDate = new Date(ap.startDate + 'T00:00:00');
      notifyDate.setDate(notifyDate.getDate() - ap.notificationDaysBefore);
      const notifyStr = SchedulerUtils.localDateStr(notifyDate);

      if (today >= notifyStr && today < ap.startDate) {
        const missing = students.filter(st => {
          const access = testDateAccess[String(st.id)];
          return !access || access.status !== 'submitted';
        });
        if (missing.length) {
          messages.push({
            type: 'test_reminder',
            periodId: ap.id,
            message: `${ap.name} starts ${ap.startDate}. ${missing.length} student(s) have not submitted test dates.`
          });
        }
      }

      if (today >= ap.submissionDeadline && today <= ap.endDate) {
        const missing = students.filter(st => {
          const access = testDateAccess[String(st.id)];
          return !access || (access.status !== 'submitted' && access.status !== 'locked');
        });
        if (missing.length) {
          messages.push({
            type: 'deadline_warning',
            periodId: ap.id,
            message: `Submission deadline passed for ${ap.name}. ${missing.length} student(s) still pending.`
          });
        }
      }
    }

    return messages;
  },

  isExaminationMonth(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    return this.EXAMINATION_MONTHS.includes(d.getMonth());
  },

  previousDateStr(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() - 1);
    return SchedulerUtils.localDateStr(d);
  },

  /** Canonical exam list: testDates first, then legacy unavailable_dates flagged as exams */
  allExamsForStudent(student) {
    const exams = (student.testDates || []).map(t => this.normalizeTestDate(t));
    const seen = new Set(exams.map(e => `${e.date}|${e.start}|${e.end}`));
    for (const u of student.availability?.unavailable_dates || []) {
      if (!u?.date) continue;
      const isExam = u.isTest || u.reason === 'exam' || u.type === 'exam';
      if (!isExam) continue;
      const key = `${u.date}|${u.start || '00:00'}|${u.end || '00:00'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      exams.push(this.normalizeTestDate({
        date: u.date,
        start: u.start || '00:00',
        end: u.end || '00:00',
        subject: u.reason || u.label || 'Exam'
      }));
    }
    return exams;
  },

  testsForDate(student, dateStr) {
    return this.allExamsForStudent(student).filter(t => t.date === dateStr);
  },

  exportTestDatesCsv(students, accessMap) {
    const header = ['id', 'name', 'status', 'submitted_at', 'test_dates'];
    const rows = [header];
    for (const st of students) {
      const access = accessMap[String(st.id)] || this.defaultAccess();
      const tests = JSON.stringify(st.testDates || []).replace(/"/g, '""');
      rows.push([
        st.id,
        st.name,
        access.status,
        access.submittedAt || '',
        `"${tests}"`
      ]);
    }
    return rows.map(r => r.map(v => SchedulerExport.escapeCsvCell(v)).join(',')).join('\n');
  },

  monthsSpannedByPeriod(period) {
    const months = [];
    const start = new Date(period.startDate + 'T00:00:00');
    const end = new Date(period.endDate + 'T00:00:00');
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= endMonth) {
      months.push({ year: cur.getFullYear(), month: cur.getMonth() });
      cur.setMonth(cur.getMonth() + 1);
    }
    return months;
  },

  filterShiftsInPeriod(shifts, period) {
    return (shifts || []).filter(s =>
      s.date >= period.startDate && s.date <= period.endDate
    );
  },

  buildTestShiftsFromStudents(students, period) {
    const map = new Map();
    for (const st of students) {
      for (const t of st.testDates || []) {
        if (!t.date || t.date < period.startDate || t.date > period.endDate) continue;
        if (t.testPeriodId && t.testPeriodId !== period.id) continue;
        const key = `${t.date}|${t.start}|${t.end}`;
        if (!map.has(key)) {
          map.set(key, { date: t.date, start: t.start, end: t.end, subjects: new Set(), count: 0 });
        }
        const entry = map.get(key);
        entry.count++;
        if (t.subject) entry.subjects.add(t.subject);
      }
    }
    return [...map.values()].map((e, i) => {
      const required = Math.min(10, Math.max(1, Math.ceil(e.count / 2)));
      const subjects = [...e.subjects];
      return {
        id: `gen-${period.id}-${i}`,
        date: e.date,
        start: e.start,
        end: e.end,
        required,
        name: subjects.length ? subjects.slice(0, 2).join(' / ') : `Exam (${e.count} student${e.count > 1 ? 's' : ''})`,
        isLargeTest: e.count >= 5,
        isEarlyOpening: e.start === '06:00',
        maxCapacity: Math.min(10, Math.max(required, e.count))
      };
    });
  },

  mergeTestShifts(existing, generated) {
    const merged = [...(existing || [])];
    for (const gen of generated) {
      const dup = merged.some(ts =>
        ts.date === gen.date && ts.start === gen.start && ts.end === gen.end
      );
      if (!dup) merged.push(gen);
    }
    return merged;
  },

  validateGenerationReadiness(students, testDateAccess, period, { allowPartial = false } = {}) {
    const errors = [];
    const warnings = [];
    const missing = [];

    if (!period) {
      errors.push('Assessment period not found');
      return { ready: false, errors, warnings, missing };
    }

    if (!students.length) {
      errors.push('No students loaded');
      return { ready: false, errors, warnings, missing };
    }

    for (const st of students) {
      const access = testDateAccess[String(st.id)];
      const submitted = access && (access.status === 'submitted' || access.status === 'locked');
      const testsInPeriod = (st.testDates || []).filter(t =>
        t.date >= period.startDate && t.date <= period.endDate
      );
      if (!submitted) missing.push(st.name);
      else if (!testsInPeriod.length) warnings.push(`${st.name} submitted but has no tests in period range`);
    }

    if (missing.length && !allowPartial) {
      errors.push(`${missing.length} student(s) have not submitted test dates: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`);
    }

    const totalTests = students.reduce((n, st) =>
      n + (st.testDates || []).filter(t =>
        t.date >= period.startDate && t.date <= period.endDate
      ).length, 0);

    if (!totalTests) {
      errors.push('No test dates in period — students must submit exams first');
    }

    return {
      ready: errors.length === 0,
      errors,
      warnings,
      missing,
      totalTests
    };
  },

  normalizeSchedule(raw) {
    return {
      id: raw.id || String(Date.now()),
      testPeriodId: raw.testPeriodId,
      periodName: raw.periodName || '',
      version: Number(raw.version) || 1,
      status: raw.status || 'draft',
      shifts: Array.isArray(raw.shifts) ? raw.shifts : [],
      monthSchedules: raw.monthSchedules && typeof raw.monthSchedules === 'object' ? raw.monthSchedules : {},
      stats: raw.stats || {},
      feedback: Array.isArray(raw.feedback) ? raw.feedback : [],
      generatedTestShifts: Array.isArray(raw.generatedTestShifts) ? raw.generatedTestShifts : [],
      createdAt: raw.createdAt || new Date().toISOString(),
      publishedAt: raw.publishedAt || null,
      approvedAt: raw.approvedAt || null,
      approvedBy: raw.approvedBy || null
    };
  },

  scheduleStatusLabel(status) {
    const labels = {
      draft: 'Draft',
      pending_review: 'Pending review',
      approved: 'Approved',
      published: 'Published'
    };
    return labels[status] || status;
  },

  nextVersion(schedules, periodId) {
    const existing = (schedules || []).filter(s => s.testPeriodId === periodId);
    if (!existing.length) return 1;
    return Math.max(...existing.map(s => s.version || 1)) + 1;
  },

  summarizeSchedule(shifts) {
    const list = shifts || [];
    const assignments = list.reduce((n, s) => n + (s.assignees?.length || 0), 0);
    const testShifts = list.filter(s => s.testShiftName).length;
    return {
      shiftCount: list.length,
      assignmentCount: assignments,
      testShiftCount: testShifts,
      uncovered: list.filter(s => (s.assignees?.length || 0) < (s.required || 1)).length
    };
  }
};

window.AssessmentManager = AssessmentManager;
