// Central application state — mirrors monolith state object
class AppStateManager {
  constructor(storage) {
    this.storage = storage;
    this.logger = new SchedulerLogger();

    this.students = [];
    this.templates = [];
    this.year = new Date().getFullYear();
    this.month = new Date().getMonth();
    this.granularity = 60;
    this.testShifts = [];
    this.schedule = {};
    this.operationalHours = {
      defaultStart: '06:00',
      defaultEnd: '19:00',
      publicHolidays: [],
      specialHours: [],
      batchHolidays: []
    };
    this.assessmentPeriods = [];
    this.swapDebts = [];
    this.fairness = {};
    this.patternLocks = {};
    this.threeMonthView = false;
    this.defaultMonthlyTarget = 72;
    this.contractHistory = [];
    this.availabilityAccess = {};
    this.testDateAccess = {};
    this.assessmentSchedules = [];
    this.hoursLedger = { entries: {}, approvedReductions: {}, contractPeriods: null };
    this._nextId = 1;
  }

  _ensureOperationalHoursShape() {
    const oh = this.operationalHours || {};
    this.operationalHours = {
      defaultStart: oh.defaultStart || '06:00',
      defaultEnd: oh.defaultEnd || '19:00',
      publicHolidays: oh.publicHolidays || [],
      specialHours: oh.specialHours || [],
      batchHolidays: oh.batchHolidays || []
    };
  }

  async updateDefaultOperationalHours(start, end) {
    this._ensureOperationalHoursShape();
    this.operationalHours.defaultStart = start;
    this.operationalHours.defaultEnd = end;
    await this.persistMeta();
    this.logger.log(`Operational hours: ${start}–${end}`);
  }

  async addPublicHoliday(date, name) {
    this._ensureOperationalHoursShape();
    if (!date) throw new Error('Date required');
    if (this.operationalHours.publicHolidays.some(h => h.date === date)) {
      throw new Error('Holiday already exists for that date');
    }
    this.operationalHours.publicHolidays.push({ date, name: name || 'Public holiday' });
    await this.persistMeta();
  }

  async removePublicHoliday(date) {
    this._ensureOperationalHoursShape();
    this.operationalHours.publicHolidays =
      this.operationalHours.publicHolidays.filter(h => h.date !== date);
    await this.persistMeta();
  }

  async importPublicHolidaysJson(jsonText) {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) throw new Error('JSON must be an array');
    this._ensureOperationalHoursShape();
    for (const item of parsed) {
      if (!item.date) throw new Error('Each holiday needs a date');
    }
    this.operationalHours.publicHolidays = parsed.map(h => ({
      date: h.date,
      name: h.name || 'Public holiday'
    }));
    await this.persistMeta();
    return this.operationalHours.publicHolidays.length;
  }

  async addSpecialHours(date, start, end, name) {
    this._ensureOperationalHoursShape();
    if (!date || !start || !end || !name) throw new Error('All special hours fields required');
    if (this.operationalHours.specialHours.some(sh => sh.date === date)) {
      throw new Error('Special hours already exist for that date');
    }
    this.operationalHours.specialHours.push({ date, start, end, name });
    await this.persistMeta();
  }

  async removeSpecialHours(date) {
    this._ensureOperationalHoursShape();
    this.operationalHours.specialHours =
      this.operationalHours.specialHours.filter(sh => sh.date !== date);
    await this.persistMeta();
  }

  async addBatchHoliday(startDate, endDate, name) {
    this._ensureOperationalHoursShape();
    if (!startDate || !endDate) throw new Error('Start and end dates required');
    if (new Date(startDate) > new Date(endDate)) throw new Error('Start must be before end');
    const exists = this.operationalHours.batchHolidays.some(
      b => b.startDate === startDate && b.endDate === endDate
    );
    if (exists) throw new Error('That date range already exists');
    this.operationalHours.batchHolidays.push({ startDate, endDate, name: name || '' });
    await this.persistMeta();
  }

  async removeBatchHoliday(startDate, endDate) {
    this._ensureOperationalHoursShape();
    this.operationalHours.batchHolidays = this.operationalHours.batchHolidays.filter(
      b => !(b.startDate === startDate && b.endDate === endDate)
    );
    await this.persistMeta();
  }

  async addTemplate({ start, end, required = 1, isOpening = false, isClosing = false }) {
    if (!start || !end) throw new Error('Start and end times required');
    this.templates.push({
      id: this.genId(),
      start,
      end,
      required: Number(required) || 1,
      isOpening: !!isOpening,
      isClosing: !!isClosing
    });
    await this.persistMeta();
  }

  async removeTemplate(id) {
    this.templates = this.templates.filter(t => String(t.id) !== String(id));
    await this.persistMeta();
  }

  async loadDefaultTemplates() {
    this.templates = [];
    this.getEngine().defaultTemplatesIfEmpty();
    await this.persistMeta();
    return this.templates.length;
  }

  async clearTemplates() {
    this.templates = [];
    await this.persistMeta();
  }

  assessmentPeriodOverlaps(startDate, endDate, exclude = null) {
    const newStart = new Date(startDate + 'T00:00:00');
    const newEnd = new Date(endDate + 'T00:00:00');
    return this.assessmentPeriods.some(ap => {
      if (exclude && ap.startDate === exclude.startDate && ap.endDate === exclude.endDate) {
        return false;
      }
      const existingStart = new Date(ap.startDate + 'T00:00:00');
      const existingEnd = new Date(ap.endDate + 'T00:00:00');
      return newStart <= existingEnd && newEnd >= existingStart;
    });
  }

  async addAssessmentPeriod(startDate, endDate, name, options = {}) {
    if (!startDate || !endDate || !name) throw new Error('All assessment period fields required');
    if (new Date(startDate) > new Date(endDate)) throw new Error('Start must be before end');
    if (this.assessmentPeriodOverlaps(startDate, endDate)) {
      throw new Error('Dates overlap an existing assessment period');
    }
    const period = AssessmentManager.normalizePeriod({
      id: this.genId(),
      startDate,
      endDate,
      name: name.trim(),
      notificationDaysBefore: options.notificationDaysBefore,
      submissionDeadline: options.submissionDeadline || endDate,
      status: options.status || 'open'
    });
    this.assessmentPeriods.push(period);
    await this.persistMeta();
    return period;
  }

  async applyAssessmentTemplate(templateId, startDate) {
    const payload = AssessmentManager.periodFromTemplate(templateId, startDate);
    return this.addAssessmentPeriod(
      payload.startDate,
      payload.endDate,
      payload.name,
      {
        notificationDaysBefore: payload.notificationDaysBefore,
        submissionDeadline: payload.submissionDeadline
      }
    );
  }

  normalizeAssessmentPeriods() {
    this.assessmentPeriods = (this.assessmentPeriods || []).map(ap =>
      AssessmentManager.normalizePeriod(ap)
    );
  }

  async removeAssessmentPeriod(startDate, endDate) {
    this.assessmentPeriods = this.assessmentPeriods.filter(
      ap => !(ap.startDate === startDate && ap.endDate === endDate)
    );
    await this.persistMeta();
  }

  async addTestShift({ date, start, end, required, name }) {
    if (!date || !start || !end || !name) throw new Error('All test shift fields required');
    const req = Number(required) || 1;
    if (req < 1 || req > 10) throw new Error('Required assistants must be 1–10');
    const exists = this.testShifts.some(ts => ts.date === date && ts.start === start && ts.end === end);
    if (exists) throw new Error('Test shift already exists for that date and time');
    this.testShifts.push({
      id: this.genId(),
      date,
      start,
      end,
      required: req,
      name: name.trim(),
      isLargeTest: req >= 5,
      isEarlyOpening: start === '06:00',
      maxCapacity: Math.min(req * 2, 10)
    });
    await this.persistMeta();
  }

  async removeTestShift(date, start) {
    this.testShifts = this.testShifts.filter(ts => !(ts.date === date && ts.start === start));
    await this.persistMeta();
  }

  async adjustTestShiftCapacity(testShiftId, newRequired) {
    const testShift = this.testShifts.find(ts => String(ts.id) === String(testShiftId));
    if (!testShift) throw new Error('Test shift not found');
    const required = Number(newRequired);
    if (!Number.isFinite(required) || required < 1 || required > 10) {
      throw new Error('Required assistants must be 1–10');
    }
    testShift.required = required;
    testShift.isLargeTest = required >= 5;
    const suggestedMax = Math.min(required * 2, 10);
    if (testShift.maxCapacity < required || testShift.maxCapacity > 10) {
      testShift.maxCapacity = suggestedMax;
    }
    await this.persistMeta();
    this.logger.log(`Test shift ${testShift.name}: required ${required}, max ${testShift.maxCapacity}`);
    return testShift;
  }

  async suggestEarlyOpeningForLargeTests({ autoAdd = false } = {}) {
    const largeTests = this.testShifts.filter(ts => ts.isLargeTest && !ts.isEarlyOpening);
    if (!largeTests.length) {
      return { added: 0, largeTests: [], message: 'No large tests need early opening shifts' };
    }

    let added = 0;
    if (autoAdd) {
      for (const test of largeTests) {
        const exists = this.testShifts.some(ts => ts.date === test.date && ts.start === '06:00');
        if (exists) continue;
        this.testShifts.push({
          id: this.genId(),
          date: test.date,
          start: '06:00',
          end: '06:30',
          required: Math.min(2, test.required),
          name: `${test.name} - Early Opening`,
          isLargeTest: false,
          isEarlyOpening: true,
          maxCapacity: 2
        });
        added++;
        this.logger.log(`Added early opening for ${test.name} on ${test.date}`);
      }
      if (added) await this.persistMeta();
    }

    return {
      added,
      largeTests,
      message: added
        ? `Added ${added} early opening shift(s)`
        : `${largeTests.length} large test(s) could use early opening (06:00–06:30)`
    };
  }

  async applyMonthlyTargetToAll(hours) {
    let val = Number(hours);
    if (!Number.isFinite(val) || val < 1) throw new Error('Enter a valid number of hours');
    if (val > 72) val = 72;
    this.defaultMonthlyTarget = val;
    this.students = this.students.map(st => ({
      ...st,
      contracted_monthly_hours: val,
      monthlyMaxHours: val,
      contractType: ContractManager.resolveType(val)
    }));
    this.logContractChange({
      studentId: '*',
      studentName: 'All students',
      before: null,
      after: val,
      contractType: ContractManager.resolveType(val),
      note: 'Apply to all from Settings'
    });
    await this.saveStudents(this.students);
    await this.persistMeta();
    return val;
  }

  logContractChange({ studentId, studentName, before, after, contractType, note = '' }) {
    if (!this.contractHistory) this.contractHistory = [];
    this.contractHistory.unshift({
      studentId: String(studentId),
      studentName: studentName || this.studentName(studentId),
      before,
      after,
      contractType: contractType || 'custom',
      note,
      changedAt: new Date().toISOString(),
      changedBy: 'admin'
    });
    if (this.contractHistory.length > 200) this.contractHistory.length = 200;
  }

  async setStudentContract(studentId, hours, contractType = 'custom', note = '') {
    const val = ContractManager.validateHours(hours, this.defaultMonthlyTarget > 72 ? this.defaultMonthlyTarget : ContractManager.MAX_HOURS);
    const idx = this.students.findIndex(s => String(s.id) === String(studentId));
    if (idx < 0) throw new Error('Student not found');
    const student = this.students[idx];
    const before = student.contracted_monthly_hours;
    const resolvedType = ContractManager.resolveType(val, contractType);
    this.students[idx] = StudentData.enrich({
      ...student,
      contracted_monthly_hours: val,
      monthlyMaxHours: val,
      contractType: resolvedType
    });
    this.logContractChange({
      studentId,
      studentName: student.name,
      before,
      after: val,
      contractType: resolvedType,
      note
    });
    await this.saveStudents(this.students);
    await this.persistMeta();
    return this.students[idx];
  }

  async applyContractTemplate(templateId, studentIds = null) {
    const tpl = ContractManager.templateById(templateId);
    if (!tpl) throw new Error('Unknown contract template');
    const idSet = studentIds ? new Set(studentIds.map(String)) : null;
    this.students = this.students.map(st => {
      if (idSet && !idSet.has(String(st.id))) return st;
      return StudentData.enrich({
        ...st,
        contracted_monthly_hours: tpl.hours,
        monthlyMaxHours: tpl.hours,
        contractType: tpl.id
      });
    });
    this.logContractChange({
      studentId: idSet ? [...idSet].join(',') : '*',
      studentName: idSet ? `${idSet.size} student(s)` : 'All students',
      before: null,
      after: tpl.hours,
      contractType: tpl.id,
      note: `Applied template ${tpl.name}`
    });
    await this.saveStudents(this.students);
    await this.persistMeta();
    return tpl;
  }

  async getContractComplianceReport(year = null, month = null) {
    const y = year ?? this.year;
    const m = month ?? this.month;
    const shifts = await this.getShiftsForMonth(y, m);
    return this.students.map(st =>
      ContractManager.buildComplianceRow(st, ContractManager.computeAssignedHours(st.id, shifts))
    );
  }

  _logAvailabilityAccess(studentId, action, note = '') {
    const key = String(studentId);
    if (!this.availabilityAccess[key]) {
      this.availabilityAccess[key] = AvailabilityManager.defaultAccess();
    }
    this.availabilityAccess[key].history = this.availabilityAccess[key].history || [];
    this.availabilityAccess[key].history.unshift({
      action,
      note,
      at: new Date().toISOString(),
      by: 'admin'
    });
    this.availabilityAccess[key].history = this.availabilityAccess[key].history.slice(0, 20);
  }

  ensureAvailabilityAccess(studentId) {
    const key = String(studentId);
    if (!this.availabilityAccess[key]) {
      this.availabilityAccess[key] = AvailabilityManager.defaultAccess();
    }
    return this.availabilityAccess[key];
  }

  syncAvailabilityAccessForStudents() {
    for (const st of this.students) {
      this.ensureAvailabilityAccess(st.id);
    }
    this.syncTestDateAccessForStudents();
  }

  getAvailabilityAccess(studentId) {
    return this.ensureAvailabilityAccess(studentId);
  }

  async grantAvailabilityAccess(studentId, canEdit = true) {
    const access = this.ensureAvailabilityAccess(studentId);
    access.canEdit = !!canEdit;
    if (canEdit && access.status === 'locked') access.status = 'draft';
    access.updatedAt = new Date().toISOString();
    this._logAvailabilityAccess(studentId, 'grant', canEdit ? 'Edit access granted' : 'Edit access revoked');
    await this.persistMeta();
    return access;
  }

  async revokeAvailabilityAccess(studentId) {
    const access = this.ensureAvailabilityAccess(studentId);
    access.canEdit = false;
    access.updatedAt = new Date().toISOString();
    this._logAvailabilityAccess(studentId, 'revoke', 'Edit access revoked');
    await this.persistMeta();
    return access;
  }

  async bulkGrantAvailabilityAccess(canEdit = true) {
    for (const st of this.students) {
      await this.grantAvailabilityAccess(st.id, canEdit);
    }
    return this.availabilityAccess;
  }

  async updateStudentAvailability(studentId, availability) {
    const access = this.ensureAvailabilityAccess(studentId);
    if (!access.canEdit || access.status === 'locked') {
      throw new Error('Availability is locked — admin must unlock before editing');
    }
    const result = AvailabilityManager.validate(availability);
    if (!result.valid) throw new Error(result.errors.join('; '));

    const idx = this.students.findIndex(s => String(s.id) === String(studentId));
    if (idx < 0) throw new Error('Student not found');

    this.students[idx] = StudentData.enrich({
      ...this.students[idx],
      availability: result.normalized
    });
    access.status = 'draft';
    access.updatedAt = new Date().toISOString();
    this._logAvailabilityAccess(studentId, 'edit', 'Availability updated');
    await this.saveStudents(this.students);
    await this.persistMeta();
    return this.students[idx];
  }

  async submitStudentAvailability(studentId) {
    const access = this.ensureAvailabilityAccess(studentId);
    if (!access.canEdit) throw new Error('You do not have permission to submit availability');
    const student = this.students.find(s => String(s.id) === String(studentId));
    if (!student) throw new Error('Student not found');

    const result = AvailabilityManager.validate(student.availability);
    if (!result.valid) throw new Error(result.errors.join('; '));

    access.status = 'submitted';
    access.submittedAt = new Date().toISOString();
    access.updatedAt = access.submittedAt;
    this._logAvailabilityAccess(studentId, 'submit', 'Availability submitted');
    await this.persistMeta();
    return access;
  }

  async lockStudentAvailability(studentId) {
    const access = this.ensureAvailabilityAccess(studentId);
    access.status = 'locked';
    access.canEdit = false;
    access.updatedAt = new Date().toISOString();
    this._logAvailabilityAccess(studentId, 'lock', 'Availability locked');
    await this.persistMeta();
    return access;
  }

  async unlockStudentAvailability(studentId) {
    const access = this.ensureAvailabilityAccess(studentId);
    access.status = 'draft';
    access.canEdit = true;
    access.updatedAt = new Date().toISOString();
    this._logAvailabilityAccess(studentId, 'unlock', 'Availability unlocked for editing');
    await this.persistMeta();
    return access;
  }

  async copyAvailabilityFrom(fromStudentId, toStudentId) {
    const from = this.students.find(s => String(s.id) === String(fromStudentId));
    const to = this.students.find(s => String(s.id) === String(toStudentId));
    if (!from || !to) throw new Error('Student not found');
    return this.updateStudentAvailability(
      toStudentId,
      AvailabilityManager.normalizeAvailability(from.availability)
    );
  }

  getAvailabilityStatusReport() {
    this.syncAvailabilityAccessForStudents();
    return this.students.map(st => {
      const access = this.getAvailabilityAccess(st.id);
      const preview = AvailabilityManager.formatPreview(st.availability);
      return {
        studentId: st.id,
        name: st.name,
        color: st.color,
        access,
        icon: AvailabilityManager.statusIcon(access),
        statusLabel: AvailabilityManager.statusLabel(access),
        weeklyBlocks: preview.weekly.length,
        unavailableBlocks: preview.unavailable.length
      };
    });
  }

  async getStudentShiftsForMonth(studentId, year = null, month = null) {
    const y = year ?? this.year;
    const m = month ?? this.month;
    const sid = String(studentId);
    const shifts = await this.getShiftsForMonth(y, m);
    return shifts.filter(s =>
      (s.assignees || []).some(a => String(typeof a === 'object' ? a.id : a) === sid)
    ).map(s => ({
      date: s.date,
      start: s.start,
      end: s.end,
      location: s.location || 'Main Campus'
    }));
  }

  async createSwapRequest(payload) {
    const requester = this.students.find(s => String(s.id) === String(payload.requesterId));
    if (!requester) throw new Error('Requester not found');

    const request = {
      type: payload.type || 'cover',
      status: 'pending',
      requester: { id: requester.id, name: requester.name, color: requester.color },
      requesterId: String(requester.id),
      fromShift: payload.fromShift,
      toShift: payload.toShift || null,
      reason: payload.reason || '',
      offers: [],
      marketplace: payload.type === 'cover',
      createdAt: new Date().toISOString()
    };

    const id = await this.storage.saveSwapRequest(request);
    request.id = id;
    this.logger.log(`Swap request created: ${requester.name} — ${payload.fromShift?.date} ${payload.fromShift?.start}`);
    return request;
  }

  _logTestDateAccess(studentId, action, note = '') {
    const key = String(studentId);
    if (!this.testDateAccess[key]) {
      this.testDateAccess[key] = AssessmentManager.defaultAccess();
    }
    this.testDateAccess[key].history = this.testDateAccess[key].history || [];
    this.testDateAccess[key].history.unshift({
      action,
      note,
      at: new Date().toISOString(),
      by: 'admin'
    });
    this.testDateAccess[key].history = this.testDateAccess[key].history.slice(0, 20);
  }

  ensureTestDateAccess(studentId) {
    const key = String(studentId);
    if (!this.testDateAccess[key]) {
      this.testDateAccess[key] = AssessmentManager.defaultAccess();
    }
    return this.testDateAccess[key];
  }

  syncTestDateAccessForStudents() {
    for (const st of this.students) {
      this.ensureTestDateAccess(st.id);
    }
  }

  getTestDateAccess(studentId) {
    return this.ensureTestDateAccess(studentId);
  }

  getActiveAssessmentPeriod(dateStr = null) {
    return AssessmentManager.getActivePeriod(this.assessmentPeriods, dateStr);
  }

  async updateStudentTestDates(studentId, testDates, testPeriodId = null) {
    const access = this.ensureTestDateAccess(studentId);
    if (!access.canEdit || access.status === 'locked') {
      throw new Error('Test dates are locked — admin must unlock before editing');
    }
    const period = testPeriodId
      ? this.assessmentPeriods.find(p => p.id === testPeriodId)
      : this.getActiveAssessmentPeriod() || AssessmentManager.getUpcomingPeriod(this.assessmentPeriods);

    const result = AssessmentManager.validateTestDates(testDates, period);
    if (!result.valid) throw new Error(result.errors.join('; '));

    const idx = this.students.findIndex(s => String(s.id) === String(studentId));
    if (idx < 0) throw new Error('Student not found');

    this.students[idx] = StudentData.enrich({
      ...this.students[idx],
      testDates: result.normalized.map(t => ({
        ...t,
        testPeriodId: t.testPeriodId || period?.id || null
      }))
    });
    access.status = 'draft';
    access.updatedAt = new Date().toISOString();
    this._logTestDateAccess(studentId, 'edit', 'Test dates updated');
    await this.saveStudents(this.students);
    await this.persistMeta();
    return this.students[idx];
  }

  async submitStudentTestDates(studentId) {
    const access = this.ensureTestDateAccess(studentId);
    if (!access.canEdit) throw new Error('You do not have permission to submit test dates');
    const student = this.students.find(s => String(s.id) === String(studentId));
    if (!student) throw new Error('Student not found');

    const period = this.getActiveAssessmentPeriod() ||
      AssessmentManager.getUpcomingPeriod(this.assessmentPeriods);
    const result = AssessmentManager.validateTestDates(student.testDates, period);
    if (!result.valid) throw new Error(result.errors.join('; '));

    access.status = 'submitted';
    access.submittedAt = new Date().toISOString();
    access.updatedAt = access.submittedAt;
    this._logTestDateAccess(studentId, 'submit', 'Test dates submitted');
    await this.persistMeta();
    return access;
  }

  async lockStudentTestDates(studentId) {
    const access = this.ensureTestDateAccess(studentId);
    access.status = 'locked';
    access.canEdit = false;
    access.updatedAt = new Date().toISOString();
    this._logTestDateAccess(studentId, 'lock', 'Test dates locked');
    await this.persistMeta();
    return access;
  }

  async unlockStudentTestDates(studentId) {
    const access = this.ensureTestDateAccess(studentId);
    access.status = 'draft';
    access.canEdit = true;
    access.updatedAt = new Date().toISOString();
    this._logTestDateAccess(studentId, 'unlock', 'Test dates unlocked');
    await this.persistMeta();
    return access;
  }

  getTestDateStatusReport() {
    this.syncTestDateAccessForStudents();
    const active = this.getActiveAssessmentPeriod();
    return this.students.map(st => {
      const access = this.getTestDateAccess(st.id);
      const tests = (st.testDates || []).filter(t =>
        !active || !t.testPeriodId || t.testPeriodId === active.id
      );
      return {
        studentId: st.id,
        name: st.name,
        color: st.color,
        access,
        icon: AssessmentManager.statusIcon(access),
        statusLabel: AssessmentManager.statusLabel(access),
        testCount: tests.length
      };
    });
  }

  getAssessmentReminders() {
    return AssessmentManager.getDueNotifications(
      this.assessmentPeriods,
      this.students,
      this.testDateAccess
    );
  }

  async executeApprovedSwap(request) {
    if (!request.fromShift) throw new Error('Missing shift details');
    const takerId = request.acceptedOffer?.student?.id || request.takerId;
    if (!takerId) throw new Error('No replacement student selected');

    await this.performShiftSwap(
      this.year,
      this.month,
      request.fromShift.date,
      request.fromShift.start,
      request.requesterId,
      takerId
    );
    await this.persistMeta();
  }

  async setThreeMonthView(enabled) {
    this.threeMonthView = !!enabled;
    await this.persistMeta();
  }

  getEngine() {
    return new SchedulingEngine(this, this.logger);
  }

  async generateSchedule(year, month) {
    if (!this.students.length) {
      throw new Error('No students loaded — import CSV or load sample data first');
    }
    const y = year ?? this.year;
    const m = month ?? this.month;
    const engine = this.getEngine();
    const shifts = engine.runSchedule(y, m);
    await this.saveShiftsForMonth(y, m, shifts);
    this.year = y;
    this.month = m;
    await this.persistMeta();
    return shifts;
  }

  findAssessmentPeriod(periodId) {
    return this.assessmentPeriods.find(p =>
      String(p.id) === String(periodId) ||
      `${p.startDate}|${p.endDate}` === String(periodId)
    ) || null;
  }

  getAssessmentSchedulesForPeriod(periodId) {
    return (this.assessmentSchedules || [])
      .filter(s => String(s.testPeriodId) === String(periodId))
      .sort((a, b) => (b.version || 0) - (a.version || 0));
  }

  getLatestAssessmentSchedule(periodId) {
    return this.getAssessmentSchedulesForPeriod(periodId)[0] || null;
  }

  getPendingReviewSchedule() {
    return (this.assessmentSchedules || []).find(s => s.status === 'pending_review') || null;
  }

  async generateAssessmentSchedule(periodId, options = {}) {
    const period = AssessmentManager.normalizePeriod(this.findAssessmentPeriod(periodId));
    if (!period) throw new Error('Assessment period not found');

    const readiness = AssessmentManager.validateGenerationReadiness(
      this.students,
      this.testDateAccess,
      period,
      { allowPartial: !!options.allowPartial }
    );
    if (!readiness.ready && !options.force) {
      throw new Error(readiness.errors.join('; '));
    }

    const generatedTestShifts = AssessmentManager.buildTestShiftsFromStudents(this.students, period);
    const savedTestShifts = [...this.testShifts];
    this.testShifts = AssessmentManager.mergeTestShifts(this.testShifts, generatedTestShifts);

    const monthSchedules = {};
    const allShifts = [];
    const months = AssessmentManager.monthsSpannedByPeriod(period);

    if (!this.templates.length) {
      this.getEngine().defaultTemplatesIfEmpty();
      await this.persistMeta();
    }

    for (const { year, month } of months) {
      const engine = this.getEngine();
      const monthShifts = engine.runSchedule(year, month);
      const inPeriod = AssessmentManager.filterShiftsInPeriod(monthShifts, period);
      monthSchedules[this.monthKey(year, month)] = inPeriod;
      allShifts.push(...inPeriod);
    }

    this.testShifts = savedTestShifts;

    const stats = AssessmentManager.summarizeSchedule(allShifts);
    const record = AssessmentManager.normalizeSchedule({
      id: this.genId(),
      testPeriodId: period.id,
      periodName: period.name,
      version: AssessmentManager.nextVersion(this.assessmentSchedules, period.id),
      status: 'draft',
      shifts: allShifts,
      monthSchedules,
      stats: { ...stats, ...readiness, generatedAt: new Date().toISOString() },
      generatedTestShifts,
      feedback: [],
      createdAt: new Date().toISOString()
    });

    this.assessmentSchedules.push(record);
    await this.persistMeta();
    this.logger.log(
      `Assessment schedule v${record.version} for ${period.name}: ${stats.shiftCount} shifts, ${stats.assignmentCount} assignments`
    );
    return record;
  }

  async _writeAssessmentShiftsToStorage(monthSchedules) {
    for (const [key, shifts] of Object.entries(monthSchedules || {})) {
      const [yearStr, monthStr] = key.split('-');
      await this.saveShiftsForMonth(Number(yearStr), Number(monthStr), shifts || []);
    }
  }

  async loadAssessmentScheduleIntoEditor(scheduleId) {
    const schedule = this.assessmentSchedules.find(s => String(s.id) === String(scheduleId));
    if (!schedule) throw new Error('Assessment schedule not found');
    await this._writeAssessmentShiftsToStorage(schedule.monthSchedules);
    const firstKey = Object.keys(schedule.monthSchedules || {})[0];
    if (firstKey) {
      const [yearStr, monthStr] = firstKey.split('-');
      this.year = Number(yearStr);
      this.month = Number(monthStr);
    }
    await this.persistMeta();
    return schedule;
  }

  async submitAssessmentScheduleForReview(scheduleId) {
    const schedule = this.assessmentSchedules.find(s => String(s.id) === String(scheduleId));
    if (!schedule) throw new Error('Assessment schedule not found');
    if (schedule.status !== 'draft' && schedule.status !== 'approved') {
      throw new Error('Only draft schedules can be sent for review');
    }
    schedule.status = 'pending_review';
    schedule.submittedForReviewAt = new Date().toISOString();
    await this.persistMeta();
    return schedule;
  }

  async addAssessmentFeedback(scheduleId, studentId, message) {
    const schedule = this.assessmentSchedules.find(s => String(s.id) === String(scheduleId));
    if (!schedule) throw new Error('Assessment schedule not found');
    if (!message?.trim()) throw new Error('Feedback message required');
    if (schedule.status !== 'pending_review') {
      throw new Error('Feedback only accepted while schedule is pending review');
    }
    const student = this.students.find(s => String(s.id) === String(studentId));
    schedule.feedback.push({
      id: this.genId(),
      studentId: String(studentId),
      studentName: student?.name || String(studentId),
      message: message.trim(),
      createdAt: new Date().toISOString(),
      status: 'open'
    });
    await this.persistMeta();
    return schedule;
  }

  async approveAssessmentSchedule(scheduleId) {
    const schedule = this.assessmentSchedules.find(s => String(s.id) === String(scheduleId));
    if (!schedule) throw new Error('Assessment schedule not found');
    schedule.status = 'approved';
    schedule.approvedAt = new Date().toISOString();
    schedule.approvedBy = 'admin';
    await this.persistMeta();
    return schedule;
  }

  async publishAssessmentSchedule(scheduleId) {
    const schedule = this.assessmentSchedules.find(s => String(s.id) === String(scheduleId));
    if (!schedule) throw new Error('Assessment schedule not found');
    if (schedule.status !== 'approved') {
      throw new Error('Approve the schedule before publishing');
    }
    await this._writeAssessmentShiftsToStorage(schedule.monthSchedules);
    schedule.status = 'published';
    schedule.publishedAt = new Date().toISOString();
    const period = this.findAssessmentPeriod(schedule.testPeriodId);
    if (period) period.status = 'published';
    await this.persistMeta();
    this.logger.log(`Published assessment schedule v${schedule.version} (${schedule.periodName})`);
    return schedule;
  }

  async rebalanceSchedule(year, month) {
    const y = year ?? this.year;
    const m = month ?? this.month;
    const engine = this.getEngine();
    const existing = await this.getShiftsForMonth(y, m);
    if (!existing.length) throw new Error('No schedule to rebalance — generate first');
    engine.loadShiftsIntoSchedule(existing);
    this.year = y;
    this.month = m;
    if (!Object.keys(this.fairness).length) {
      this.fairness = {};
      this.students.forEach(s => { this.fairness[s.id] = { openings: 0, closings: 0 }; });
    }
    const shifts = engine.rebalance();
    await this.saveShiftsForMonth(y, m, shifts);
    return shifts;
  }

  async fillOpenClose(year, month) {
    const y = year ?? this.year;
    const m = month ?? this.month;
    const engine = this.getEngine();
    const existing = await this.getShiftsForMonth(y, m);
    if (!existing.length) throw new Error('No schedule — generate first');
    engine.loadShiftsIntoSchedule(existing);
    this.year = y;
    this.month = m;
    const shifts = engine.fillOpenClose();
    await this.saveShiftsForMonth(y, m, shifts);
    return shifts;
  }

  getEditorMonths(year, month) {
    if (!this.threeMonthView) {
      return [{ year, month }];
    }
    const months = [];
    for (let offset = -1; offset <= 1; offset++) {
      const d = new Date(year, month + offset, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return months;
  }

  async _collectShiftsForMonths(months) {
    const all = [];
    for (const { year, month } of months) {
      all.push(...(await this.getShiftsForMonth(year, month)));
    }
    return all;
  }

  async _saveShiftsByMonth(months, shifts) {
    for (const { year, month } of months) {
      const monthShifts = shifts.filter(s => {
        const d = new Date(s.date + 'T00:00:00');
        return d.getFullYear() === year && d.getMonth() === month;
      });
      await this.saveShiftsForMonth(year, month, monthShifts);
    }
  }

  async withScheduleEngine(months, mutateFn) {
    const engine = this.getEngine();
    const all = await this._collectShiftsForMonths(months);
    engine.loadShiftsIntoSchedule(all);
    engine.buildRunContext();
    const result = mutateFn(engine);
    engine.recalculateFairness();
    this.fairness = { ...engine.state.fairness };
    const updated = engine.scheduleToShifts();
    await this._saveShiftsByMonth(months, updated);
    engine.clearRunContext();
    await this.persistMeta();
    return { shifts: updated, result };
  }

  _engineShift(engine, date, start) {
    return engine.state.schedule[`${date} ${start}`] || null;
  }

  async manualDropAssign(year, month, studentId, date, start, adminOverride = false) {
    const months = this.getEditorMonths(year, month);
    const sid = String(studentId);
    const { shifts } = await this.withScheduleEngine(months, engine => {
      const target = this._engineShift(engine, date, start);
      if (!target) throw new Error('No shift at that time — generate schedule first');
      if (target.assignees.includes(sid)) return;

      for (const other of engine.getShiftsByDate(date)) {
        if (other === target || !other.assignees.includes(sid)) continue;
        if (SchedulerUtils.overlap(
          engine.parseTimeStr(other.start), engine.parseTimeStr(other.end),
          engine.parseTimeStr(target.start), engine.parseTimeStr(target.end)
        )) {
          other.assignees = other.assignees.filter(id => id !== sid);
        }
      }

      if (!adminOverride) {
        if (!engine.canAssignStudentToShift(sid, target)) {
          const conflicts = engine.validateAssignment(sid, target);
          throw new Error(conflicts.length ? conflicts.join('; ') : 'Cannot assign student to this shift');
        }
      }

      target.assignees.push(sid);
      if (adminOverride) {
        target.adminOverride = true;
        target.adminOverrideBy = 'admin';
        target.adminOverrideAt = new Date().toISOString();
        this.logger.log(
          `🔧 ADMIN OVERRIDE: ${sid} → ${date} ${start} (restrictions bypassed)`
        );
      }
    });
    return shifts;
  }

  async performShiftSwap(year, month, date, start, fromStudentId, toStudentId) {
    const months = this.getEditorMonths(year, month);
    const fromSid = String(fromStudentId);
    const toSid = String(toStudentId);
    const shiftKey = `${date} ${start}`;

    const { shifts } = await this.withScheduleEngine(months, engine => {
      const shift = this._engineShift(engine, date, start);
      if (!shift) throw new Error('Shift not found');
      if (!shift.assignees.includes(fromSid)) throw new Error('Student not assigned to this shift');
      if (fromSid === toSid) throw new Error('Cannot swap with the same student');

      if (!engine.canAssignStudentToShift(toSid, shift)) {
        throw new Error('Replacement cannot be assigned due to constraints');
      }

      shift.assignees = shift.assignees.filter(id => id !== fromSid);
      shift.assignees.push(toSid);

      this.swapDebts.push({
        from: fromSid,
        to: toSid,
        shift: shiftKey,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
    });

    const fromName = this.students.find(s => String(s.id) === fromSid)?.name || fromSid;
    const toName = this.students.find(s => String(s.id) === toSid)?.name || toSid;
    this.logger.log(`Swap: ${fromName} → ${toName} on ${shiftKey}. Debt recorded.`);
    return shifts;
  }

  async markDebtSettled(index) {
    if (!this.swapDebts[index]) return false;
    this.swapDebts[index].status = 'settled';
    this.swapDebts[index].settledAt = new Date().toISOString();
    await this.persistMeta();
    return true;
  }

  getPendingDebts() {
    return this.swapDebts.filter(d => d.status === 'pending');
  }

  studentName(id) {
    return this.students.find(s => String(s.id) === String(id))?.name || String(id);
  }

  async manualRemoveStudent(year, month, studentId, date, start) {
    const months = this.getEditorMonths(year, month);
    const sid = String(studentId);
    const { shifts } = await this.withScheduleEngine(months, engine => {
      const shift = this._engineShift(engine, date, start);
      if (!shift) return;
      shift.assignees = shift.assignees.filter(id => id !== sid);
    });
    return shifts;
  }

  async setShiftRequired(year, month, date, start, required) {
    const cap = Math.max(1, Math.min(10, Number(required) || 1));
    const months = this.getEditorMonths(year, month);
    const { shifts } = await this.withScheduleEngine(months, engine => {
      const shift = this._engineShift(engine, date, start);
      if (!shift) throw new Error('Shift not found');
      shift.required = cap;
      shift.maxCapacity = cap;
    });
    return shifts;
  }

  async collectExportShifts(year, month) {
    if (this.threeMonthView) {
      const all = [];
      for (const { year: y, month: m } of this.getEditorMonths(year, month)) {
        all.push(...(await this.getShiftsForMonth(y, m)));
      }
      return all;
    }
    return this.getShiftsForMonth(year, month);
  }

  async buildFullStatePayload() {
    const y = this.year;
    const m = this.month;
    let shifts;
    let monthSchedules = null;

    if (this.threeMonthView) {
      monthSchedules = {};
      for (const { year, month } of this.getEditorMonths(y, m)) {
        monthSchedules[this.monthKey(year, month)] = await this.getShiftsForMonth(year, month);
      }
      shifts = Object.values(monthSchedules).flat();
    } else {
      shifts = await this.getShiftsForMonth(y, m);
    }

    return {
      version: SchedulerExport.STATE_VERSION,
      savedAt: new Date().toISOString(),
      year: y,
      month: m,
      threeMonthView: this.threeMonthView,
      students: this.students,
      templates: this.templates,
      testShifts: this.testShifts,
      operationalHours: this.operationalHours,
      assessmentPeriods: this.assessmentPeriods,
      swapDebts: this.swapDebts,
      fairness: this.fairness,
      defaultMonthlyTarget: this.defaultMonthlyTarget,
      shifts,
      monthSchedules,
      contractHistory: this.contractHistory,
      availabilityAccess: this.availabilityAccess,
      testDateAccess: this.testDateAccess,
      assessmentSchedules: this.assessmentSchedules,
      hoursLedger: this.hoursLedger
    };
  }

  async importFullState(rawData) {
    const data = SchedulerExport.normalizeStatePayload(rawData);
    const errors = SchedulerExport.validateStatePayload(data);
    if (errors.length) {
      throw new Error(errors.join('; '));
    }

    await this.saveStudents(data.students);
    this.year = Number(data.year);
    this.month = Number(data.month);
    this.templates = data.templates;
    this.testShifts = data.testShifts;
    if (data.operationalHours) {
      this.operationalHours = data.operationalHours;
      this._ensureOperationalHoursShape();
    }
    this.assessmentPeriods = data.assessmentPeriods;
    this.swapDebts = data.swapDebts;
    this.fairness = data.fairness;
    this.contractHistory = data.contractHistory ?? this.contractHistory;
    this.availabilityAccess = data.availabilityAccess ?? this.availabilityAccess;
    this.testDateAccess = data.testDateAccess ?? this.testDateAccess;
    this.assessmentSchedules = data.assessmentSchedules ?? this.assessmentSchedules;
    this.hoursLedger = data.hoursLedger ?? this.hoursLedger;
    this._ensureHoursLedgerShape();
    this.normalizeAssessmentPeriods();
    this.syncAvailabilityAccessForStudents();
    this.threeMonthView = data.threeMonthView;
    if (data.defaultMonthlyTarget != null) {
      this.defaultMonthlyTarget = data.defaultMonthlyTarget;
    }

    if (data.monthSchedules) {
      for (const [key, monthShifts] of Object.entries(data.monthSchedules)) {
        const [yearStr, monthStr] = key.split('-');
        await this.saveShiftsForMonth(Number(yearStr), Number(monthStr), monthShifts || []);
      }
    } else {
      await this.saveShiftsForMonth(this.year, this.month, data.shifts);
    }

    await this.persistMeta();
    this.logger.log(`Loaded state: ${data.students.length} students, ${data.shifts.length} shifts`);
    return data;
  }

  async autoSaveBackup() {
    try {
      const payload = await this.buildFullStatePayload();
      await this.storage.setSetting('stateAutoBackup', {
        savedAt: payload.savedAt,
        payload
      });
    } catch (err) {
      this.logger.log(`Auto-backup skipped: ${err.message}`);
    }
  }

  async load() {
    this.students = (await this.storage.getStudents()).map(s => StudentData.enrich(s));

    const meta = await this.storage.getSetting('scheduleMeta', null);
    if (meta) {
      this.year = meta.year ?? this.year;
      this.month = meta.month ?? this.month;
      this.templates = meta.templates ?? this.templates;
      this.testShifts = meta.testShifts ?? this.testShifts;
      this.operationalHours = meta.operationalHours ?? this.operationalHours;
      this.assessmentPeriods = meta.assessmentPeriods ?? this.assessmentPeriods;
      this.defaultMonthlyTarget = meta.defaultMonthlyTarget ?? this.defaultMonthlyTarget;
      this.threeMonthView = meta.threeMonthView ?? this.threeMonthView;
      this.fairness = meta.fairness ?? this.fairness;
      this.swapDebts = meta.swapDebts ?? this.swapDebts;
      this.contractHistory = meta.contractHistory ?? this.contractHistory;
      this.availabilityAccess = meta.availabilityAccess ?? this.availabilityAccess;
      this.testDateAccess = meta.testDateAccess ?? this.testDateAccess;
      this.assessmentSchedules = meta.assessmentSchedules ?? this.assessmentSchedules;
      this.hoursLedger = meta.hoursLedger ?? this.hoursLedger;
      this._ensureHoursLedgerShape();
    }

    this.normalizeAssessmentPeriods();
    this.syncAvailabilityAccessForStudents();

    this._ensureOperationalHoursShape();

    const maxId = this.students.reduce((m, s) => Math.max(m, Number(s.id) || 0), 0);
    this._nextId = maxId + 1;

    this.logger.log(`Loaded ${this.students.length} students from storage`);
  }

  async persistMeta() {
    await this.storage.setSetting('scheduleMeta', {
      year: this.year,
      month: this.month,
      templates: this.templates,
      testShifts: this.testShifts,
      operationalHours: this.operationalHours,
      assessmentPeriods: this.assessmentPeriods,
      defaultMonthlyTarget: this.defaultMonthlyTarget,
      threeMonthView: this.threeMonthView,
      fairness: this.fairness,
      swapDebts: this.swapDebts,
      contractHistory: this.contractHistory,
      availabilityAccess: this.availabilityAccess,
      testDateAccess: this.testDateAccess,
      assessmentSchedules: this.assessmentSchedules,
      hoursLedger: this.hoursLedger
    });
    await this.autoSaveBackup();
  }

  genId() {
    return String(this._nextId++);
  }

  async saveStudents(students) {
    this.students = students.map(s => StudentData.enrich(s));
    this.syncAvailabilityAccessForStudents();
    await this.storage.saveStudents(this.students);
    this.logger.log(`Saved ${this.students.length} students`);
  }

  async addStudent({ name, weeklyMaxHours = 18, contractedMonthlyHours = 72, color = null }) {
    if (!name || !String(name).trim()) throw new Error('Student name is required');
    const weekly = ContractManager.validateHours(weeklyMaxHours, ContractManager.MAX_HOURS);
    const monthly = ContractManager.validateHours(contractedMonthlyHours, ContractManager.MAX_HOURS);

    const student = StudentData.enrich({
      id: this.genId(),
      name: String(name).trim(),
      weekly_max_hours: weekly,
      contracted_monthly_hours: monthly,
      color: color || SchedulerUtils.stableColor(name),
      availability: { weekly: [], unavailable_dates: [] },
      testDates: [],
      status: 'active'
    });

    this.students.push(student);
    this.ensureAvailabilityAccess(student.id);
    await this.saveStudents(this.students);
    this.logger.log(`Added student: ${student.name} (${student.id})`);
    return student;
  }

  async importCSV(csvText) {
    const result = CSVParser.parse(csvText);
    const students = result.students.map(s => StudentData.enrich({
      ...s,
      id: s.id || this.genId()
    }));

    await this.saveStudents(students);

    if (result.warnings.length) {
      result.warnings.forEach(w => this.logger.log(`CSV warning: ${w}`));
    }
    this.logger.log(`Imported ${students.length} students (${result.mode} format)`);
    return { ...result, students };
  }

  async loadSample() {
    await this.importCSV(CSVParser.SAMPLE_CSV);
    this.year = 2025;
    this.month = 8;
    await this.persistMeta();
    return this.students;
  }

  monthKey(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  async getShiftsForMonth(year, month) {
    const record = await this.storage.getMonthSchedule(year, month);
    return record?.shifts || [];
  }

  async saveShiftsForMonth(year, month, shifts) {
    await this.storage.saveMonthSchedule(year, month, shifts);
  }

  async getShiftsForDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const shifts = await this.getShiftsForMonth(d.getFullYear(), d.getMonth());
    return shifts.filter(s => s.date === dateStr);
  }

  async getSwapRequests(status = null) {
    const all = await this.storage.getSwapRequests();
    if (!status) return all;
    return all.filter(r => r.status === status);
  }

  async saveSwapRequest(request) {
    if (request.id) {
      await this.storage.updateSwapRequest(request.id, request);
    } else {
      await this.storage.saveSwapRequest(request);
    }
  }

  _ensureHoursLedgerShape() {
    if (!this.hoursLedger || typeof this.hoursLedger !== 'object') {
      this.hoursLedger = { entries: {}, approvedReductions: {}, contractPeriods: null };
    }
    if (!this.hoursLedger.entries) this.hoursLedger.entries = {};
    if (!this.hoursLedger.approvedReductions) this.hoursLedger.approvedReductions = {};
    // v1.3 (E3): per-student per-month accept/reject decisions for the UNROSTERED
    // uncredited pool, and the Stud source switch (assigned ↔ clocked).
    if (!this.hoursLedger.uncreditedDecisions) this.hoursLedger.uncreditedDecisions = {};
    if (this.hoursLedger.studSource !== 'clocked') {
      this.hoursLedger.studSource = this.hoursLedger.studSource || 'assigned';
    }
  }

  async getWorkedHoursByMonth(year) {
    const byStudent = {};
    for (let m = 0; m <= 10; m++) {
      const shifts = await this.getShiftsForMonth(year, m);
      const key = HoursLedger.monthKey(year, m);
      for (const st of this.students) {
        const sid = String(st.id);
        if (!byStudent[sid]) byStudent[sid] = {};
        byStudent[sid][key] = ContractManager.computeAssignedHours(sid, shifts);
      }
    }
    return byStudent;
  }

  /**
   * v1.3 (E3): clocked Stud + uncredited pool per student per academic month,
   * by running the worked-hours reconciliation pipeline against persisted data.
   * Returns {} when the pipeline or storage is unavailable (headless/no payroll)
   * so the ledger falls back to assigned hours rather than throwing.
   * Browser-only path (Reconcile pulls timeEntries/students/swaps from storage).
   */
  async getClockedHoursByMonth(year) {
    const out = {};
    const Recon = (typeof Reconcile !== 'undefined') ? Reconcile
      : (typeof window !== 'undefined' ? window.Reconcile : null);
    if (!Recon || !this.storage) return out;
    for (let m = 0; m <= 10; m++) {
      const monthKey = HoursLedger.monthKey(year, m);
      let result;
      try {
        result = await Recon.run({
          monthKey,
          storage: this.storage,
          swapDebts: this.swapDebts || [],
          operationalHours: this.operationalHours || null,   // F-05: thread per-date window
          assessmentManager: (typeof AssessmentManager !== 'undefined') ? AssessmentManager : null
        });
      } catch (e) {
        this.logger?.log?.(`Reconcile failed for ${monthKey}: ${e.message}`);
        continue;
      }
      const clocked = result.clockedStud.byStudent;
      const pool = result.uncreditedPool ? result.uncreditedPool.byStudent : {};
      for (const sid of Object.keys(clocked)) {
        if (!out[sid]) out[sid] = {};
        out[sid][monthKey] = {
          clockedHours: clocked[sid].workedHours,
          uncreditedHours: pool[sid] ? pool[sid].uncreditedHours : 0
        };
      }
    }
    return out;
  }

  async buildHoursLedgerMonthData(studentId, year) {
    this._ensureHoursLedgerShape();
    const sid = String(studentId);
    const useClocked = this.hoursLedger.studSource === 'clocked';
    // Assigned hours are always needed as the adherence baseline / fallback.
    const assignedByMonth = await this.getWorkedHoursByMonth(year);
    const clockedByMonth = useClocked ? await this.getClockedHoursByMonth(year) : {};
    const stored = this.hoursLedger.entries[sid] || {};
    const decisions = this.hoursLedger.uncreditedDecisions[sid] || {};
    const monthData = {};
    for (let m = 0; m <= 10; m++) {
      const key = HoursLedger.monthKey(year, m);
      const entry = stored[key] || {};
      let stud;
      if (useClocked) {
        const cm = clockedByMonth[sid] && clockedByMonth[sid][key];
        stud = cm ? cm.clockedHours : 0;
        // §4.4: admin-accepted uncredited (UNROSTERED) minutes fold into Stud
        // for that month; default is uncredited until accepted.
        if (cm && decisions[key] === 'accepted') {
          stud = HoursLedger.roundHours(stud + cm.uncreditedHours);
        }
      } else {
        stud = assignedByMonth[sid]?.[key] ?? 0;
      }
      monthData[key] = {
        contr: entry.contr,
        claimed: entry.claimed ?? 0,
        stud,
        reducedContr: entry.reducedContr,
        // Informational, for the UI's separate "uncredited pool" surface:
        uncreditedHours: (clockedByMonth[sid] && clockedByMonth[sid][key])
          ? clockedByMonth[sid][key].uncreditedHours : 0,
        uncreditedDecision: decisions[key] || null
      };
    }
    return monthData;
  }

  async getHoursLedgerReport(studentId, year = null) {
    const y = year ?? this.year;
    const student = this.students.find(s => String(s.id) === String(studentId));
    if (!student) throw new Error('Student not found');
    const monthData = await this.buildHoursLedgerMonthData(studentId, y);
    const report = HoursLedger.buildStudentLedger(student, monthData, {
      year: y,
      contractPeriods: this.hoursLedger?.contractPeriods,
      approvedReductions: this.hoursLedger?.approvedReductions,
      studSource: this.hoursLedger?.studSource || 'assigned'   // v1.3 provenance
    });
    // Surface the UNROSTERED uncredited pool SEPARATELY from Stud (prelude §0):
    // one row per month with a non-zero pool, plus the admin accept/reject state.
    report.uncreditedPool = Object.entries(monthData)
      .filter(([, d]) => (d.uncreditedHours || 0) > 0)
      .map(([monthKey, d]) => ({
        monthKey,
        uncreditedHours: d.uncreditedHours,
        decision: d.uncreditedDecision || 'pending'
      }));
    report.reductionSuggestion = this.suggestReducedContractForStudent(report, student, y);
    return report;
  }

  async getAllHoursLedgerReports(year = null) {
    const y = year ?? this.year;
    const reports = [];
    for (const st of this.students) {
      reports.push(await this.getHoursLedgerReport(st.id, y));
    }
    return reports;
  }

  suggestReducedContractForStudent(report, student, year) {
    const periods = HoursLedger.getPeriods(this.hoursLedger?.contractPeriods);
    for (const period of periods) {
      const endKey = HoursLedger.monthKey(year, period.endMonth);
      const row = report.rows.find(r => r.monthKey === endKey);
      if (!row || row.balance <= HoursLedger.CARRY_TOLERANCE) continue;
      const nextPeriodIdx = periods.indexOf(period) + 1;
      const nextPeriod = periods[nextPeriodIdx];
      if (!nextPeriod) continue;
      const k = nextPeriod.endMonth - nextPeriod.startMonth + 1;
      const capacity = student.weekly_max_hours * 4;
      const suggestion = HoursLedger.suggestReducedContract(
        row.balance,
        capacity,
        student.contracted_monthly_hours,
        k
      );
      if (suggestion) {
        return {
          periodId: nextPeriod.id,
          periodName: nextPeriod.name,
          fromPeriod: period.name,
          B0: row.balance,
          ...suggestion
        };
      }
    }
    return null;
  }

  async updateLedgerClaim(studentId, monthKey, claimed) {
    this._ensureHoursLedgerShape();
    const sid = String(studentId);
    const { year } = HoursLedger.parseMonthKey(monthKey);
    const preview = await this.getHoursLedgerReport(studentId, year);
    const row = preview.rows.find(r => r.monthKey === monthKey);
    if (!row) throw new Error('Invalid month');
    const check = HoursLedger.validateClaim(claimed, row.claimable);
    if (!check.valid) throw new Error(check.error);
    if (!this.hoursLedger.entries[sid]) this.hoursLedger.entries[sid] = {};
    if (!this.hoursLedger.entries[sid][monthKey]) this.hoursLedger.entries[sid][monthKey] = {};
    this.hoursLedger.entries[sid][monthKey].claimed = HoursLedger.roundHours(claimed);
    await this.persistMeta();
    return this.getHoursLedgerReport(studentId, year);
  }

  /**
   * §4.4 — record the admin decision for a month's UNROSTERED uncredited pool.
   * 'accepted' folds those minutes into Stud for that month; 'rejected' (or null
   * = pending) leaves them excluded. Only meaningful when studSource==='clocked'.
   */
  async setUncreditedDecision(studentId, monthKey, decision) {
    this._ensureHoursLedgerShape();
    if (decision !== null && decision !== 'accepted' && decision !== 'rejected') {
      throw new Error('Decision must be "accepted", "rejected", or null');
    }
    const sid = String(studentId);
    if (!/^\d{4}-\d{2}$/.test(String(monthKey))) throw new Error('Invalid monthKey');
    if (!this.hoursLedger.uncreditedDecisions[sid]) this.hoursLedger.uncreditedDecisions[sid] = {};
    if (decision === null) delete this.hoursLedger.uncreditedDecisions[sid][monthKey];
    else this.hoursLedger.uncreditedDecisions[sid][monthKey] = decision;
    await this.persistMeta();
    const { year } = HoursLedger.parseMonthKey(monthKey);
    return this.getHoursLedgerReport(studentId, year);
  }

  async acceptUncredited(studentId, monthKey) {
    return this.setUncreditedDecision(studentId, monthKey, 'accepted');
  }

  async rejectUncredited(studentId, monthKey) {
    return this.setUncreditedDecision(studentId, monthKey, 'rejected');
  }

  /** v1.3 switch: 'clocked' (payroll-owned Stud) or 'assigned' (scheduler baseline). */
  async setLedgerStudSource(source) {
    this._ensureHoursLedgerShape();
    this.hoursLedger.studSource = source === 'clocked' ? 'clocked' : 'assigned';
    await this.persistMeta();
    return this.hoursLedger.studSource;
  }

  /**
   * F-03/F-16 — runtime ingest entry point. Parses a VeraLab .xls(x) ArrayBuffer
   * and idempotently upserts the rows into the timeEntries store. Corrupt-file
   * errors are surfaced as a clean message (F-16), not a raw SheetJS throw.
   */
  async ingestPayrollWorkbook(arrayBuffer) {
    const Parser = (typeof PayrollParser !== 'undefined') ? PayrollParser
      : (typeof window !== 'undefined' ? window.PayrollParser : null);
    if (!Parser) throw new Error('PayrollParser is not loaded');
    let parsed;
    try {
      parsed = Parser.parseWorkbook(arrayBuffer);
    } catch (e) {
      throw new Error(`Could not read payroll workbook (corrupt or unsupported file): ${e.message}`);
    }
    const count = await this.storage.upsertTimeEntries(parsed.entries); // entries carry `id` (F-04)
    this.logger?.log?.(`Ingested ${count} payroll rows (${parsed.warnings.length} warnings)`);
    return { count, warnings: parsed.warnings, sheetName: parsed.sheetName };
  }

  /** F-03 — run the worked-hours reconciliation for a "YYYY-MM" month. */
  async reconcileMonth(monthKey) {
    const Recon = (typeof Reconcile !== 'undefined') ? Reconcile
      : (typeof window !== 'undefined' ? window.Reconcile : null);
    if (!Recon) throw new Error('Reconcile is not loaded');
    return Recon.run({
      monthKey,
      storage: this.storage,
      swapDebts: this.swapDebts || [],
      operationalHours: this.operationalHours || null,
      assessmentManager: (typeof AssessmentManager !== 'undefined') ? AssessmentManager : null
    });
  }

  async approveReducedContract(studentId, plan) {
    this._ensureHoursLedgerShape();
    const sid = String(studentId);
    const months = plan.months || [];
    this.hoursLedger.approvedReductions[sid] = {
      periodId: plan.periodId,
      R: HoursLedger.roundHours(plan.R),
      B0: HoursLedger.roundHours(plan.B0),
      months,
      approvedAt: new Date().toISOString()
    };
    for (const key of months) {
      if (!this.hoursLedger.entries[sid]) this.hoursLedger.entries[sid] = {};
      if (!this.hoursLedger.entries[sid][key]) this.hoursLedger.entries[sid][key] = {};
      this.hoursLedger.entries[sid][key].reducedContr = HoursLedger.roundHours(plan.R);
    }
    await this.persistMeta();
    return this.hoursLedger.approvedReductions[sid];
  }

  getQuickStats(shifts = []) {
    const totalStudents = this.students.length;
    const activeStudents = this.students.filter(s => s.status === 'active').length;
    const weeklyHours = shifts.reduce((sum, shift) => {
      const duration = (SchedulerUtils.parseTimeStr(shift.end) - SchedulerUtils.parseTimeStr(shift.start)) / 60;
      return sum + duration * (shift.assignees?.length || 0);
    }, 0);

    return {
      totalStudents,
      activeStudents,
      activeSchedules: shifts.length > 0 ? 1 : 0,
      weeklyHours: Math.round(weeklyHours)
    };
  }

  async getAnalyticsData(period = 'month') {
    const students = this.students;
    const compliance = await this.getContractComplianceReport();
    const complianceSummary = ContractManager.summarizeCompliance(compliance);
    const swapRequests = await this.getSwapRequests();
    const approved = swapRequests.filter(r => r.status === 'approved').length;
    const rejected = swapRequests.filter(r => r.status === 'rejected').length;
    const totalSwaps = swapRequests.length;

    const hoursDistribution = students.map(s => {
      const row = compliance.find(c => String(c.studentId) === String(s.id));
      return {
        name: s.name.split(' ')[0],
        hours: row?.assigned ?? s.monthlyHours ?? 0,
        contracted: row?.contracted ?? s.contracted_monthly_hours ?? 0,
        color: s.color
      };
    });

    const totalAssigned = compliance.reduce((sum, r) => sum + r.assigned, 0);
    const totalContracted = compliance.reduce((sum, r) => sum + r.contracted, 0);

    return {
      overview: {
        totalShifts: 0,
        totalHours: Math.round(totalAssigned * 10) / 10,
        avgHoursPerStudent: students.length
          ? Math.round((totalAssigned / students.length) * 10) / 10
          : 0,
        utilizationRate: totalContracted
          ? Math.min(100, Math.round((totalAssigned / totalContracted) * 100))
          : 0
      },
      hoursDistribution,
      shiftCoverage: [
        { label: 'Covered', value: 0, color: '#10b981' },
        { label: 'Uncovered', value: 0, color: '#ef4444' }
      ],
      studentPerformance: students.map(s => {
        const row = compliance.find(c => String(c.studentId) === String(s.id));
        return {
          name: s.name,
          color: s.color,
          totalHours: row?.assigned ?? 0,
          contracted: row?.contracted ?? 0,
          pct: row?.pct ?? 0,
          status: row?.status ?? 'unknown',
          totalShifts: (s.recentShifts || []).length,
          avgWeeklyHours: s.weeklyHours || 0,
          reliability: row?.status === 'active' ? 95 : row?.status === 'at-risk' ? 75 : 60
        };
      }),
      contractCompliance: {
        summary: complianceSummary,
        rows: compliance
      },
      availability: {
        draft: Object.values(this.availabilityAccess).filter(a => a.status === 'draft').length,
        submitted: Object.values(this.availabilityAccess).filter(a => a.status === 'submitted').length,
        locked: Object.values(this.availabilityAccess).filter(a => a.status === 'locked').length
      },
      swaps: {
        totalSwaps,
        approvedSwaps: approved,
        rejectedSwaps: rejected,
        successRate: totalSwaps ? Math.round((approved / totalSwaps) * 100) : 0
      },
      trends: [],
      period
    };
  }
}

window.AppStateManager = AppStateManager;
