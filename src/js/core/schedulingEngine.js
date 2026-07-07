// Scheduling engine — ported from Scheduler/index.html (Phase 3)
class SchedulingEngine {
  constructor(state, logger) {
    this.state = state;
    this.log = (msg) => logger?.log(msg);
    this.u = SchedulerUtils;
    this._ctx = null;
  }

  parseTimeStr(t) { return this.u.parseTimeStr(t); }
  timeStr(m) { return this.u.timeStr(m); }
  dateISO(y, m, d) { return this.u.dateISO(y, m, d); }

  /** Average weeks per calendar month (52 / 12) — stable weekly target from monthly contract */
  static WEEKS_PER_MONTH = 52 / 12;

  /** Weighted candidate scoring — components normalized to ~0..1 before weighting */
  static SCORE_WEIGHTS = {
    fairness: 40,
    availability: 25,
    consistency: 20,
    chain: 15,
    extension: 10,
    patternLock: 5,
    weeklyBalance: 10,
    contractDeficit: 8,
    conflicts: -50,
    violations: -100
  };

  getWeeklyTargetHours(studentId) {
    const st = this.getStudent(studentId);
    const monthly = st?.contracted_monthly_hours || 72;
    return Math.max(0, monthly / SchedulingEngine.WEEKS_PER_MONTH);
  }

  isExaminationMonth(dateStr) {
    return AssessmentManager.isExaminationMonth(dateStr);
  }

  previousDateStr(dateStr) {
    return AssessmentManager.previousDateStr(dateStr);
  }

  /**
   * Exam scheduling rules:
   * - June & November (examination months): no shifts day-before exam; on exam day only from testEnd+60
   * - Other months: block overlap + 1h post-exam buffer
   */
  shiftConflictsWithStudentTest(shiftDate, shiftStart, shiftEnd, examDate, testStart, testEnd) {
    const post = AssessmentManager.POST_EXAM_BUFFER_MINS;
    const start = typeof shiftStart === 'number' ? shiftStart : this.parseTimeStr(shiftStart);
    const end = typeof shiftEnd === 'number' ? shiftEnd : this.parseTimeStr(shiftEnd);

    if (this.isExaminationMonth(examDate)) {
      const dayBefore = this.previousDateStr(examDate);
      if (shiftDate === dayBefore) return true;
      if (shiftDate !== examDate) return false;
      if (start < testEnd && end > testStart) return true;
      if (start < testEnd + post) return true;
      return false;
    }

    if (shiftDate !== examDate) return false;
    if (start < testEnd && end > testStart) return true;
    if (start < testEnd + post && end > testEnd) return true;
    return false;
  }

  studentShiftConflictsWithExams(student, shiftDate, shiftStart, shiftEnd) {
    if (!student) return false;
    const start = typeof shiftStart === 'number' ? shiftStart : this.parseTimeStr(shiftStart);
    const end = typeof shiftEnd === 'number' ? shiftEnd : this.parseTimeStr(shiftEnd);
    for (const exam of AssessmentManager.allExamsForStudent(student)) {
      const testStart = this.parseTimeStr(exam.start || '00:00');
      const testEnd = this.parseTimeStr(exam.end || '00:00');
      if (this.shiftConflictsWithStudentTest(shiftDate, start, end, exam.date, testStart, testEnd)) {
        return true;
      }
    }
    return false;
  }

  normalizeStudent(raw) {
    const id = String(raw.id || '');
    const weeklyMax = Number(raw.weekly_max_hours ?? raw.weeklyMaxHours ?? 18) || 18;
    const monthlyMax = Number(raw.contracted_monthly_hours ?? raw.monthlyMaxHours ?? 72) || weeklyMax * 4;
    return {
      ...raw,
      id,
      name: raw.name || 'Unknown',
      color: raw.color || this.u.stableColor(raw.name || id),
      weekly_max_hours: weeklyMax,
      contracted_monthly_hours: monthlyMax,
      availability: raw.availability || { weekly: [], unavailable_dates: [] }
    };
  }

  normalizeShiftInPlace(shift) {
    if (!shift.assignees) shift.assignees = [];
    shift.required = shift.required || 1;
    if (shift.maxCapacity == null) shift.maxCapacity = shift.required;
    shift.status = shift.status || 'pending';
    const edge = this.resolveShiftEdgeFlags(shift);
    shift.isOpening = edge.isOpening;
    shift.isClosing = edge.isClosing;
    if (shift.testShiftName == null) shift.testShiftName = null;
    return shift;
  }

  resolveShiftEdgeFlags(shift) {
    let isOpening = !!shift.isOpening;
    let isClosing = !!shift.isClosing;
    if (!isOpening && !isClosing) {
      const tpl = (this.state.templates || []).find(
        t => t.start === shift.start && t.end === shift.end
      );
      if (tpl) {
        isOpening = !!tpl.isOpening;
        isClosing = !!tpl.isClosing;
      }
    }
    if (!isOpening && !isClosing) {
      if (shift.start === '06:30') isOpening = true;
      if (shift.start === '17:30') isClosing = true;
    }
    return { isOpening, isClosing };
  }

  applyTemplateEdgeFlagsToSchedule() {
    this.defaultTemplatesIfEmpty();
    for (const shift of Object.values(this.state.schedule)) {
      const edge = this.resolveShiftEdgeFlags(shift);
      shift.isOpening = edge.isOpening;
      shift.isClosing = edge.isClosing;
    }
  }

  getShiftCapacity(shift) {
    return shift.maxCapacity ?? shift.required ?? 1;
  }

  /** Schedule slot key offsetMinutes before/after start; null if out of day bounds */
  adjacentSlotKey(dateStr, startTime, offsetMinutes = -60) {
    const mins = this.parseTimeStr(startTime) + offsetMinutes;
    if (mins < 0 || mins >= 24 * 60) return null;
    return `${dateStr} ${this.timeStr(mins)}`;
  }

  buildRunContext() {
    const studentMap = new Map();
    const availabilityMap = new Map();
    for (const raw of this.state.students) {
      const student = this.normalizeStudent(raw);
      studentMap.set(String(student.id), student);
      availabilityMap.set(String(student.id), this.buildStudentAvailability(student));
    }

    const shiftList = [];
    const shiftsByDate = new Map();
    for (const shift of Object.values(this.state.schedule)) {
      this.normalizeShiftInPlace(shift);
      shiftList.push(shift);
      if (!shiftsByDate.has(shift.date)) shiftsByDate.set(shift.date, []);
      shiftsByDate.get(shift.date).push(shift);
    }

    if (!this.state.fairness) this.state.fairness = {};
    for (const student of studentMap.values()) {
      if (!this.state.fairness[student.id]) {
        this.state.fairness[student.id] = { openings: 0, closings: 0 };
      }
    }

    this._ctx = { studentMap, availabilityMap, shiftList, shiftsByDate };
    return this._ctx;
  }

  clearRunContext() {
    this._ctx = null;
  }

  getStudent(studentId) {
    const id = String(studentId);
    if (this._ctx?.studentMap) return this._ctx.studentMap.get(id) || null;
    const found = this.state.students.find(s => String(s.id) === id);
    return found ? this.normalizeStudent(found) : null;
  }

  getAvailability(studentId) {
    const id = String(studentId);
    if (this._ctx?.availabilityMap) return this._ctx.availabilityMap.get(id);
    const student = this.getStudent(id);
    return student ? this.buildStudentAvailability(student) : {};
  }

  getShiftsByDate(dateStr) {
    if (this._ctx?.shiftsByDate) return this._ctx.shiftsByDate.get(dateStr) || [];
    const list = [];
    for (const shift of Object.values(this.state.schedule)) {
      if (shift.date === dateStr) list.push(shift);
    }
    return list;
  }

  getShiftList() {
    return this._ctx?.shiftList || Object.values(this.state.schedule);
  }

  buildDayBlocks(studentId, dateStr, extraStart, extraEnd) {
    const sid = String(studentId);
    const blocks = this.getShiftsByDate(dateStr)
      .filter(s => s.assignees.includes(sid))
      .map(s => ({ start: this.parseTimeStr(s.start), end: this.parseTimeStr(s.end) }));
    if (extraStart != null && extraEnd != null) {
      blocks.push({ start: this.parseTimeStr(extraStart), end: this.parseTimeStr(extraEnd) });
    }
    blocks.sort((a, b) => a.start - b.start);
    return blocks;
  }

  maxConsecutiveBlockHours(blocks) {
    let maxBlock = 0;
    let block = 0;
    let lastEnd = -1;
    for (const s of blocks) {
      if (s.start <= lastEnd + 60) block += (s.end - s.start) / 60;
      else block = (s.end - s.start) / 60;
      lastEnd = s.end;
      maxBlock = Math.max(maxBlock, block);
    }
    return maxBlock;
  }

  isAssessmentPeriod(dateStr) {
    const checkDate = new Date(dateStr + 'T00:00:00');
    return (this.state.assessmentPeriods || []).some(ap => {
      const startDate = new Date(ap.startDate + 'T00:00:00');
      const endDate = new Date(ap.endDate + 'T00:00:00');
      return checkDate >= startDate && checkDate <= endDate;
    });
  }

  isOperationalDay(dateStr) {
    const oh = this.state.operationalHours || {};
    const isHoliday = (oh.publicHolidays || []).some(h => h.date === dateStr);
    if (isHoliday) return false;

    const isInBatchHoliday = (oh.batchHolidays || []).some(bh => {
      const startDate = new Date(bh.startDate + 'T00:00:00');
      const endDate = new Date(bh.endDate + 'T00:00:00');
      const checkDate = new Date(dateStr + 'T00:00:00');
      return checkDate >= startDate && checkDate <= endDate;
    });
    if (isInBatchHoliday) return false;

    const date = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0) return false;
    if (dayOfWeek === 6) {
      const hasTestShifts = (this.state.testShifts || []).some(ts => ts.date === dateStr);
      const inAssessmentPeriod = this.isAssessmentPeriod(dateStr);
      if (hasTestShifts || inAssessmentPeriod) {
        this.log(`Saturday operations enabled for ${dateStr}`);
        return true;
      }
      return false;
    }
    return true;
  }

  getOperationalHours(dateStr) {
    const oh = this.state.operationalHours || {};
    const special = (oh.specialHours || []).find(s => s.date === dateStr);
    if (special) {
      return { start: special.start, end: special.end, name: special.name };
    }
    return {
      start: oh.defaultStart || '06:00',
      end: oh.defaultEnd || '19:00',
      name: 'Normal hours'
    };
  }

  defaultTemplatesIfEmpty() {
    if (this.state.templates.length) return;
    const templates = [];
    for (let hour = 6; hour < 18; hour++) {
      const start = `${hour.toString().padStart(2, '0')}:30`;
      const end = `${(hour + 1).toString().padStart(2, '0')}:30`;
      templates.push({
        id: this.state.genId ? this.state.genId() : String(hour),
        start,
        end,
        required: 1,
        isOpening: hour === 6,
        isClosing: hour === 17
      });
    }
    this.state.templates = templates;
    this.log(`Created ${templates.length} default hourly templates (06:30–18:30)`);
  }

  buildStudentAvailability(student) {
    const availability = {};
    if (student.availability && student.availability.weekly) {
      student.availability.weekly.forEach(block => {
        const dayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
        const dayNum = dayMap[block.day];
        if (dayNum !== undefined) {
          if (!availability[dayNum]) availability[dayNum] = [];
          availability[dayNum].push({
            start: this.parseTimeStr(block.start),
            end: this.parseTimeStr(block.end)
          });
        }
      });
    }
    return availability;
  }

  isStudentAvailable(studentId, dateStr, startTime, endTime, availability) {
    const date = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = date.getDay();
    const start = this.parseTimeStr(startTime);
    const end = this.parseTimeStr(endTime);
    const student = this.getStudent(studentId);
    if (!student) return false;

    if (this.studentShiftConflictsWithExams(student, dateStr, start, end)) {
      return false;
    }

    if (this.isAssessmentPeriod(dateStr)) {
      return true;
    }

    const avail = availability || this.getAvailability(studentId);
    const perStudentBlocks = (student.availability?.unavailable_dates || []).filter(u => {
      if (u.date !== dateStr) return false;
      return !(u.isTest || u.reason === 'exam' || u.type === 'exam');
    });
    for (const u of perStudentBlocks) {
      const blockStart = this.parseTimeStr(u.start || '00:00');
      const blockEnd = this.parseTimeStr(u.end || '23:59');
      if (start < blockEnd && end > blockStart) return false;
    }

    if (!avail[dayOfWeek]) return false;
    return avail[dayOfWeek].some(block => start < block.end && end > block.start);
  }

  getStudentName(studentId) {
    return this.getStudent(studentId)?.name || 'Unknown';
  }

  getWeekStart(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    return weekStart;
  }

  getWeeklyAssignedHours(studentId, dateStr) {
    const sid = String(studentId);
    const weekStart = this.getWeekStart(dateStr);
    let totalHours = 0;
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(weekStart);
      checkDate.setDate(checkDate.getDate() + i);
      const dateKey = this.u.localDateStr(checkDate);
      for (const shift of this.getShiftsByDate(dateKey)) {
        if (shift.assignees.includes(sid)) {
          totalHours += (this.parseTimeStr(shift.end) - this.parseTimeStr(shift.start)) / 60;
        }
      }
    }
    return totalHours;
  }

  getTotalMonthlyHours(studentId, dateStr) {
    const sid = String(studentId);
    let year, month;
    if (dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      year = d.getFullYear();
      month = d.getMonth();
    } else {
      year = this.state.year;
      month = this.state.month;
    }
    let totalHours = 0;
    for (const shift of this.getShiftList()) {
      if (!shift.assignees.includes(sid)) continue;
      const sd = new Date(shift.date + 'T00:00:00');
      if (sd.getFullYear() === year && sd.getMonth() === month) {
        totalHours += (this.parseTimeStr(shift.end) - this.parseTimeStr(shift.start)) / 60;
      }
    }
    return totalHours;
  }

  validateAssignment(studentId, slot) {
    const st = this.getStudent(studentId);
    const errs = [];
    const sid = String(studentId);

    for (const existingShift of this.getShiftsByDate(slot.date)) {
      if (existingShift.assignees.includes(sid) && existingShift !== slot) {
        const existingStart = this.parseTimeStr(existingShift.start);
        const existingEnd = this.parseTimeStr(existingShift.end);
        const newStart = this.parseTimeStr(slot.start);
        const newEnd = this.parseTimeStr(slot.end);
        if (newStart < existingEnd && newEnd > existingStart) {
          errs.push(`Overlaps with ${existingShift.start}-${existingShift.end}`);
        }
      }
    }

    const isAssessmentDay = this.isAssessmentPeriod(slot.date);
    const slotStart = this.parseTimeStr(slot.start);
    const slotEnd = this.parseTimeStr(slot.end);

    if (st && this.studentShiftConflictsWithExams(st, slot.date, slotStart, slotEnd)) {
      errs.push('Conflicts with student exam (examination-period rules apply in Jun/Nov)');
    }

    if (!isAssessmentDay && st) {
      const perStudentBlocks = (st.availability?.unavailable_dates || []).filter(u => {
        if (u.date !== slot.date) return false;
        return !(u.isTest || u.reason === 'exam' || u.type === 'exam');
      });
      if (perStudentBlocks.length) {
        for (const u of perStudentBlocks) {
          const blockStart = this.parseTimeStr(u.start || '00:00');
          const blockEnd = this.parseTimeStr(u.end || '23:59');
          if (slotStart < blockEnd && slotEnd > blockStart) {
            errs.push('Conflicts with student unavailable period');
            break;
          }
        }
      }
    }
    return errs;
  }

  getConsecutiveHours(studentId, dateStr, startTime, endTime) {
    return this.maxConsecutiveBlockHours(
      this.buildDayBlocks(studentId, dateStr, startTime, endTime)
    );
  }

  canAssignStudentToShift(studentId, shift, skipExtension = false) {
    const sid = String(studentId);
    const maxCapacity = this.getShiftCapacity(shift);
    if ((shift.assignees?.length || 0) >= maxCapacity) return false;
    if (shift.assignees.includes(sid)) return false;

    const student = this.getStudent(sid);
    if (!student) return false;

    if (!this.isStudentAvailable(sid, shift.date, shift.start, shift.end, this.getAvailability(sid))) {
      return false;
    }

    const weeklyHours = this.getWeeklyAssignedHours(sid, shift.date);
    const shiftHours = (this.parseTimeStr(shift.end) - this.parseTimeStr(shift.start)) / 60;
    if (weeklyHours + shiftHours > student.weekly_max_hours) return false;

    const monthlyHours = this.getTotalMonthlyHours(sid, shift.date);
    if (monthlyHours + shiftHours > student.contracted_monthly_hours) return false;

    if (this.validateAssignment(sid, shift).length > 0) return false;

    if (!skipExtension &&
        (shift.isOpening || shift.isClosing) &&
        !this.canExtendTwoHours(sid, shift)) {
      return false;
    }

    return true;
  }

  getTotalAssignedHours(studentId) {
    const sid = String(studentId);
    let totalMinutes = 0;
    for (const shift of this.getShiftList()) {
      if (shift.assignees.includes(sid)) {
        totalMinutes += this.parseTimeStr(shift.end) - this.parseTimeStr(shift.start);
      }
    }
    return totalMinutes;
  }

  getConsistencyScore(studentId, dayOfWeek, startTime) {
    const sid = String(studentId);
    let consistencyCount = 0;
    for (const shift of this.getShiftList()) {
      if (shift.assignees.includes(sid)) {
        const shiftDay = new Date(`${shift.date}T00:00:00`).getDay();
        if (shiftDay === dayOfWeek && shift.start === startTime) consistencyCount++;
      }
    }
    return consistencyCount;
  }

  getWeeklyRemainingHours(studentId, dateStr) {
    const student = this.getStudent(studentId);
    if (!student) return 0;
    const weeklyHours = this.getWeeklyAssignedHours(studentId, dateStr);
    return Math.max(0, student.weekly_max_hours - weeklyHours);
  }

  getFairnessScore(studentId) {
    const fairness = this.state.fairness[studentId] || { openings: 0, closings: 0 };
    return fairness.openings + fairness.closings;
  }

  recalculateFairness() {
    this.state.fairness = {};
    for (const student of this.state.students) {
      this.state.fairness[student.id] = { openings: 0, closings: 0 };
    }
    for (const shift of this.getShiftList()) {
      if (!shift.assignees?.length) continue;
      shift.assignees.forEach(sid => {
        if (!this.state.fairness[sid]) {
          this.state.fairness[sid] = { openings: 0, closings: 0 };
        }
        if (shift.isOpening) this.state.fairness[sid].openings++;
        if (shift.isClosing) this.state.fairness[sid].closings++;
      });
    }
  }

  getChainPreferenceScore(studentId, dateStr, startTime, endTime) {
    const maxBlock = this.maxConsecutiveBlockHours(
      this.buildDayBlocks(studentId, dateStr, startTime, endTime)
    );
    if (maxBlock > 5) return -100;
    if (maxBlock >= 2 && maxBlock <= 5) return 10 + maxBlock;
    if (maxBlock === 1) return -5;
    return 1;
  }

  /** 0..1 — fewer edge assignments and lower monthly hours vs peers score higher */
  getFairnessComponent(studentId, shift) {
    const sid = String(studentId);
    const students = this._ctx
      ? [...this._ctx.studentMap.values()]
      : this.state.students.map(s => this.normalizeStudent(s));

    const edgeTotals = students.map(s => {
      const f = this.state.fairness[s.id] || { openings: 0, closings: 0 };
      return f.openings + f.closings;
    });
    const minEdge = Math.min(...edgeTotals, 0);
    const maxEdge = Math.max(...edgeTotals, 1);
    const mine = this.state.fairness[sid] || { openings: 0, closings: 0 };
    const myEdge = mine.openings + mine.closings;
    const edgeNorm = maxEdge > minEdge ? 1 - (myEdge - minEdge) / (maxEdge - minEdge) : 1;

    const monthHours = students.map(s => this.getTotalMonthlyHours(s.id));
    const myHours = this.getTotalMonthlyHours(sid);
    const avgHours = monthHours.reduce((a, b) => a + b, 0) / Math.max(students.length, 1);
    const student = this.getStudent(sid);
    const cap = student?.contracted_monthly_hours || 72;
    const hourNorm = myHours <= avgHours
      ? 1
      : Math.max(0, 1 - (myHours - avgHours) / Math.max(cap - avgHours, 1));

    let edgeTypeNorm = 0.5;
    if (shift.isOpening || shift.isClosing) {
      const avgOpen = students.reduce((sum, s) => sum + (this.state.fairness[s.id]?.openings || 0), 0) / students.length;
      const avgClose = students.reduce((sum, s) => sum + (this.state.fairness[s.id]?.closings || 0), 0) / students.length;
      const myVal = shift.isOpening ? mine.openings : mine.closings;
      const avgVal = shift.isOpening ? avgOpen : avgClose;
      const spread = Math.max(students.length, 2);
      edgeTypeNorm = Math.max(0, Math.min(1, 1 - (myVal - avgVal) / spread));
    }

    return edgeNorm * 0.35 + hourNorm * 0.45 + edgeTypeNorm * 0.2;
  }

  /** 0..1 — how comfortably the shift fits inside a weekly availability block */
  getAvailabilityComponent(studentId, shift) {
    const avail = this.getAvailability(studentId);
    const day = new Date(`${shift.date}T00:00:00`).getDay();
    const start = this.parseTimeStr(shift.start);
    const end = this.parseTimeStr(shift.end);
    const blocks = avail[day] || [];
    let best = 0;
    for (const block of blocks) {
      if (start < block.start || end > block.end) continue;
      const shiftDur = end - start;
      const slack = (start - block.start) + (block.end - end);
      const blockDur = block.end - block.start;
      best = Math.max(best, Math.min(1, 0.65 + 0.35 * (slack / Math.max(blockDur - shiftDur, 60))));
    }
    return best;
  }

  /** 0..1 */
  getConsistencyComponent(studentId, shift) {
    const dayKey = new Date(`${shift.date}T00:00:00`).getDay();
    return Math.min(this.getConsistencyScore(studentId, dayKey, shift.start) / 3, 1);
  }

  /** 0..1 from chain preference raw score */
  getChainComponent(studentId, shift) {
    const raw = this.getChainPreferenceScore(studentId, shift.date, shift.start, shift.end);
    return Math.max(0, Math.min(1, (raw + 100) / 115));
  }

  countCandidateViolations(studentId, shift) {
    const sid = String(studentId);
    const student = this.getStudent(sid);
    const shiftHours = (this.parseTimeStr(shift.end) - this.parseTimeStr(shift.start)) / 60;
    let violations = 0;

    if (this.getConsecutiveHours(sid, shift.date, shift.start, shift.end) > 5) violations++;
    if (shift.isOpening || shift.isClosing) {
      const prev = new Date(shift.date + 'T00:00:00');
      prev.setDate(prev.getDate() - 1);
      if (this.didEdge(this.u.localDateStr(prev), sid, shift.isOpening ? 'open' : 'close')) violations++;
    }
    if (student) {
      const weeklyHours = this.getWeeklyAssignedHours(sid, shift.date);
      if (weeklyHours + shiftHours > student.weekly_max_hours) violations++;
      const monthHours = this.getTotalMonthlyHours(sid, shift.date);
      if (monthHours + shiftHours > student.contracted_monthly_hours) violations++;
    }
    return violations;
  }

  scoreCandidate(studentId, shift) {
    const sid = String(studentId);
    const w = SchedulingEngine.SCORE_WEIGHTS;
    const dayKey = new Date(`${shift.date}T00:00:00`).getDay();

    const fairness = this.getFairnessComponent(sid, shift);
    const availability = this.getAvailabilityComponent(sid, shift);
    const consistency = this.getConsistencyComponent(sid, shift);
    const chain = this.getChainComponent(sid, shift);
    const extension = (shift.isOpening || shift.isClosing)
      ? this.getExtendStrength(sid, shift) / 2
      : 0.5;
    const patternLock = (this.state.patternLocks?.[sid]?.[dayKey] || []).includes(shift.start) ? 1 : 0;
    const weeklyTarget = this.getWeeklyTargetHours(sid);
    const weeklyRem = this.getWeeklyRemainingHours(sid, shift.date);
    const weeklyBalance = weeklyTarget > 0 ? Math.min(weeklyRem / weeklyTarget, 1) : 0.5;
    const monthHours = this.getTotalMonthlyHours(sid, shift.date);
    const cap = this.getStudent(sid)?.contracted_monthly_hours || 72;
    const contractDeficit = ContractManager.getContractDeficitNorm(monthHours, cap);
    const conflicts = this.validateAssignment(sid, shift).length;
    const violations = this.countCandidateViolations(sid, shift);

    return (
      w.fairness * fairness +
      w.availability * availability +
      w.consistency * consistency +
      w.chain * chain +
      w.extension * extension +
      w.patternLock * patternLock +
      w.weeklyBalance * weeklyBalance +
      w.contractDeficit * contractDeficit +
      w.conflicts * conflicts +
      w.violations * violations
    );
  }

  rankCandidates(candidates, shift) {
    return candidates
      .map(student => ({ student, score: this.scoreCandidate(student.id, shift) }))
      .sort((a, b) => b.score - a.score || String(a.student.id).localeCompare(String(b.student.id)))
      .map(entry => entry.student);
  }

  canExtendTwoHours(studentId, dateStrOrShift, startMaybe, endMaybe) {
    let dateStr, startTime, endTime;
    if (typeof dateStrOrShift === 'object' && dateStrOrShift.date) {
      dateStr = dateStrOrShift.date;
      startTime = dateStrOrShift.start;
      endTime = dateStrOrShift.end;
    } else {
      dateStr = dateStrOrShift;
      startTime = startMaybe;
      endTime = endMaybe;
    }
    const duration = (this.parseTimeStr(endTime) - this.parseTimeStr(startTime)) / 60;
    const beforeKey = this.adjacentSlotKey(dateStr, startTime, -60);
    const afterKey = `${dateStr} ${endTime}`;
    const before = beforeKey ? this.state.schedule[beforeKey] : null;
    const after = this.state.schedule[afterKey];
    const sid = String(studentId);
    const canBefore = before &&
      this.validateAssignment(sid, before).length === 0 &&
      this.canAssignStudentToShift(sid, before, true);
    const canAfter = after &&
      this.validateAssignment(sid, after).length === 0 &&
      this.canAssignStudentToShift(sid, after, true);
    return duration >= 2 || canBefore || canAfter;
  }

  getExtendStrength(studentId, shift) {
    const beforeKey = this.adjacentSlotKey(shift.date, shift.start, -60);
    const afterKey = `${shift.date} ${shift.end}`;
    const before = beforeKey ? this.state.schedule[beforeKey] : null;
    const after = this.state.schedule[afterKey];
    const sid = String(studentId);
    const canBefore = before &&
      this.validateAssignment(sid, before).length === 0 &&
      this.canAssignStudentToShift(sid, before, true) ? 1 : 0;
    const canAfter = after &&
      this.validateAssignment(sid, after).length === 0 &&
      this.canAssignStudentToShift(sid, after, true) ? 1 : 0;
    return canBefore + canAfter;
  }

  didEdge(dateStr, studentId, kind) {
    const sid = String(studentId);
    for (const s of this.getShiftsByDate(dateStr)) {
      if (kind === 'open' && !s.isOpening) continue;
      if (kind === 'close' && !s.isClosing) continue;
      if (s.assignees?.includes(sid)) return true;
    }
    return false;
  }

  assignAdjacentIfPossible(studentId, shift) {
    if (!(shift.isOpening || shift.isClosing)) return;
    const sid = String(studentId);
    const nextKey = `${shift.date} ${shift.end}`;
    const prevKey = this.adjacentSlotKey(shift.date, shift.start, -60);
    const tryKeys = shift.isOpening ? [nextKey] : (prevKey ? [prevKey] : []);
    for (const k of tryKeys) {
      const s2 = this.state.schedule[k];
      if (!s2 || s2.assignees.includes(sid)) continue;
      if (!this.canAssignStudentToShift(sid, s2)) continue;
      if (this.validateAssignment(sid, s2).length > 0) continue;
      if ((s2.assignees?.length || 0) >= this.getShiftCapacity(s2)) continue;
      s2.assignees.push(sid);
      this.log(`Auto-extend: ${this.getStudentName(sid)} → ${s2.date} ${s2.start}-${s2.end}`);
      break;
    }
  }

  buildWeeklyPatternLocks() {
    const y = this.state.year;
    const m = this.state.month;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    let weekDates = null;

    for (let d = 1; d <= daysInMonth - 4; d++) {
      if (new Date(y, m, d).getDay() !== 1) continue;
      const candidate = [];
      let complete = true;
      for (let i = 0; i < 5; i++) {
        const dateStr = this.dateISO(y, m, d + i);
        const dow = new Date(dateStr + 'T00:00:00').getDay();
        if (dow === 0 || dow === 6 || !this.isOperationalDay(dateStr)) {
          complete = false;
          break;
        }
        candidate.push(dateStr);
      }
      if (complete) {
        weekDates = candidate;
        break;
      }
    }

    if (!weekDates) {
      this.log('No complete operational Mon–Fri week found for pattern locks');
      return {};
    }

    const locks = {};
    for (const s of this.getShiftList()) {
      if (!weekDates.includes(s.date)) continue;
      s.assignees.forEach(sid => {
        if (!locks[sid]) locks[sid] = {};
        const dow = new Date(s.date + 'T00:00:00').getDay();
        if (dow === 0 || dow === 6) return;
        if (!locks[sid][dow]) locks[sid][dow] = new Set();
        locks[sid][dow].add(s.start);
      });
    }
    Object.keys(locks).forEach(sid => {
      Object.keys(locks[sid]).forEach(d => {
        locks[sid][d] = Array.from(locks[sid][d]);
      });
    });
    this.log(`Pattern locks captured from operational week ${weekDates[0]} – ${weekDates[4]}`);
    return locks;
  }

  runSchedule(year, month) {
    if (year !== undefined) this.state.year = year;
    if (month !== undefined) this.state.month = month;

    this.log('Building shifts for the selected month from templates');
    this.state.schedule = {};

    const y = this.state.year;
    const m = this.state.month;
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    this.defaultTemplatesIfEmpty();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = this.dateISO(y, m, day);
      if (!this.isOperationalDay(dateStr)) continue;
      const op = this.getOperationalHours(dateStr);
      const opStart = this.parseTimeStr(op.start);
      const opEnd = this.parseTimeStr(op.end);

      for (const t of this.state.templates) {
        const ts = this.parseTimeStr(t.start);
        const te = this.parseTimeStr(t.end);
        if (ts < opStart || te > opEnd) continue;
        const key = `${dateStr} ${t.start}`;
        this.state.schedule[key] = this.normalizeShiftInPlace({
          date: dateStr,
          start: t.start,
          end: t.end,
          required: t.required || 1,
          assignees: [],
          status: 'pending',
          isOpening: !!t.isOpening,
          isClosing: !!t.isClosing,
          testShiftName: null
        });
      }

      const tests = (this.state.testShifts || []).filter(ts => ts.date === dateStr);
      for (const test of tests) {
        let foundOverlapping = false;
        for (const [, shift] of Object.entries(this.state.schedule)) {
          if (shift.date !== dateStr) continue;
          const shiftStart = this.parseTimeStr(shift.start);
          const shiftEnd = this.parseTimeStr(shift.end);
          const testStart = this.parseTimeStr(test.start);
          const testEnd = this.parseTimeStr(test.end);
          if (shiftStart < testEnd && shiftEnd > testStart) {
            foundOverlapping = true;
            const newReq = Math.max(shift.required || 1, test.required || 1);
            shift.required = newReq;
            shift.maxCapacity = Math.max(newReq, Math.min(test.maxCapacity || newReq, this.state.students.length || newReq));
            shift.testShiftName = test.name || shift.testShiftName;
            this.normalizeShiftInPlace(shift);
          }
        }
        if (!foundOverlapping) {
          const k = `${dateStr} ${test.start}`;
          this.state.schedule[k] = this.normalizeShiftInPlace({
            date: dateStr,
            start: test.start,
            end: test.end,
            required: test.required || 1,
            assignees: [],
            status: 'pending',
            testShiftName: test.name,
            maxCapacity: Math.min(test.maxCapacity || test.required || 1, this.state.students.length || 1)
          });
        }
      }
    }

    this.state.fairness = {};
    this.state.students.forEach(student => {
      this.state.fairness[student.id] = { openings: 0, closings: 0 };
    });

    this.state.patternLocks = this.buildWeeklyPatternLocks();
    this.runSchedulingAlgorithm();

    const shifts = this.scheduleToShifts();
    this.log(`Month generated: ${shifts.length} shifts, ${this.countAssignments()} assignments`);
    return shifts;
  }

  runSchedulingAlgorithm() {
    this.buildRunContext();
    try {
      const students = [...this._ctx.studentMap.values()];
      this.log(`Computing candidates for ${this._ctx.shiftList.length} shifts...`);

      const shifts = Object.entries(this.state.schedule)
        .map(([key, shift]) => ({ key, ...shift }))
        .sort((a, b) => {
          const aPriority = (a.isOpening || a.isClosing) ? 0 : 1;
          const bPriority = (b.isOpening || b.isClosing) ? 0 : 1;
          if (aPriority !== bPriority) return aPriority - bPriority;
          if (a.required !== b.required) return b.required - a.required;
          return a.date.localeCompare(b.date);
        });

      let totalCandidates = 0;
      shifts.forEach(shift => {
        shift.candidates = students.filter(student => this.canAssignStudentToShift(student.id, shift));
        totalCandidates += shift.candidates.length;
      });
      this.log(`Found ${totalCandidates} total candidates`);

      let assignedCount = 0;
      shifts.forEach(shift => {
        const needed = shift.required - shift.assignees.length;
        if (needed <= 0) return;

        let baseCandidates = shift.candidates.filter(c => !shift.assignees.includes(c.id));
        if (shift.isOpening || shift.isClosing) {
          baseCandidates = baseCandidates.filter(c => this.canExtendTwoHours(c.id, shift));
        }

        const sortedCandidates = this.rankCandidates(baseCandidates, shift);

        let slotsToFill = needed;
      const shiftMinutes = this.parseTimeStr(shift.end) - this.parseTimeStr(shift.start);
      for (let i = 0; i < sortedCandidates.length && slotsToFill > 0; i++) {
        const student = sortedCandidates[i];
        const weeklyHours = this.getWeeklyAssignedHours(student.id, shift.date);
        const addHours = shiftMinutes / 60;
        const studentRec = this.getStudent(student.id);
        if (studentRec && weeklyHours + addHours > studentRec.weekly_max_hours) continue;
        const monthHours = this.getTotalMonthlyHours(student.id, shift.date);
        if (studentRec && monthHours + addHours > studentRec.contracted_monthly_hours) continue;
        if (this.validateAssignment(student.id, shift).length > 0) continue;
        if (shift.isOpening || shift.isClosing) {
          const prev = new Date(shift.date + 'T00:00:00');
          prev.setDate(prev.getDate() - 1);
          if (this.didEdge(this.u.localDateStr(prev), student.id, shift.isOpening ? 'open' : 'close')) continue;
        }
        const consecHoursIfAdded = this.getConsecutiveHours(student.id, shift.date, shift.start, shift.end);
        if (consecHoursIfAdded > 5) continue;

        shift.assignees.push(student.id);
        assignedCount++;
        slotsToFill--;

        this.assignAdjacentIfPossible(student.id, shift);
        this.log(`Assign ${student.name} → ${shift.date} ${shift.start}-${shift.end}`);
      }
    });

      this.recalculateFairness();
      this.log(`Scheduling complete: ${assignedCount} assignments across ${shifts.length} shifts`);
    } finally {
      this.clearRunContext();
    }
  }

  rebalance() {
    return this.rebalanceSSD();
  }

  _shiftHours(s) {
    return (this.parseTimeStr(s.end) - this.parseTimeStr(s.start)) / 60;
  }

  _ssdFeasible(sid, s) {
    return this.canAssignStudentToShift(sid, s)
      && this.validateAssignment(sid, s).length === 0
      && this.getChainPreferenceScore(sid, s.date, s.start, s.end) >= 0
      && this.getConsecutiveHours(sid, s.date, s.start, s.end) <= 5;
  }

  _canReceiveShift(sid, s, addH, capOf) {
    const loRec = this.getStudent(sid);
    const loWeek = this.getWeeklyAssignedHours(sid, s.date);
    if (loRec && loWeek + addH > loRec.weekly_max_hours) return false;
    if (this.getTotalMonthlyHours(sid) + addH > capOf(sid)) return false;
    return true;
  }

  rebalanceSSD() {
    this.log('Rebalance (SSD): equalizing monthly hours...');
    this.buildRunContext();
    try {
      const getH = (sid) => this.getTotalMonthlyHours(sid);
      const capOf = (sid) => this.getStudent(sid)?.contracted_monthly_hours || Infinity;
      const shiftList = this._ctx.shiftList.filter(s => {
        const d = new Date(s.date + 'T00:00:00');
        return d.getFullYear() === this.state.year && d.getMonth() === this.state.month;
      });

      let improved = true;
      let guard = 0;
      while (improved && guard++ < 10000) {
        improved = false;
        const order = [...this._ctx.studentMap.keys()].sort((a, b) => getH(b) - getH(a));
        outer:
        for (const donorId of order) {
          for (const receiverId of [...order].reverse()) {
            if (donorId === receiverId) break;
            for (const s of shiftList) {
              if (!s.assignees?.includes(donorId) || s.assignees.includes(receiverId)) continue;
              const h = this._shiftHours(s);
              if (getH(donorId) - getH(receiverId) <= h) continue;
              if (!this._canReceiveShift(receiverId, s, h, capOf)) continue;

              s.assignees = s.assignees.filter(id => id !== donorId);
              if (this._ssdFeasible(receiverId, s)) {
                s.assignees.push(receiverId);
                improved = true;
                this.log(`SSD swap: ${this.getStudentName(donorId)} → ${this.getStudentName(receiverId)} on ${s.date} ${s.start}`);
                break outer;
              }
              s.assignees.push(donorId);
            }
          }
        }
      }

      this._rebalancePairsSSD(getH, capOf, shiftList);
      this._rebalanceConsistencySSD(getH, capOf, shiftList);

      this.recalculateFairness();
      this.log('SSD rebalance complete');
      return this.scheduleToShifts();
    } finally {
      this.clearRunContext();
    }
  }

  _rebalancePairsSSD(getH, capOf, shiftList) {
    let moved = true;
    let guard = 0;
    while (moved && guard++ < 500) {
      moved = false;
      const order = [...this._ctx.studentMap.keys()].sort((a, b) => getH(b) - getH(a));
      for (const donorId of order) {
        for (const receiverId of [...order].reverse()) {
          if (donorId === receiverId) break;
          for (let i = 0; i < shiftList.length - 1; i++) {
            const s1 = shiftList[i];
            const s2 = shiftList[i + 1];
            if (s1.date !== s2.date) continue;
            if (!s1.assignees?.includes(donorId) || !s2.assignees?.includes(donorId)) continue;
            if (s1.assignees.includes(receiverId) || s2.assignees.includes(receiverId)) continue;
            const h = this._shiftHours(s1) + this._shiftHours(s2);
            if (getH(donorId) - getH(receiverId) <= h) continue;
            if (!this._canReceiveShift(receiverId, s1, this._shiftHours(s1), capOf)) continue;
            if (!this._canReceiveShift(receiverId, s2, this._shiftHours(s2), capOf)) continue;

            s1.assignees = s1.assignees.filter(id => id !== donorId);
            s2.assignees = s2.assignees.filter(id => id !== donorId);
            const ok1 = this._ssdFeasible(receiverId, s1);
            const ok2 = ok1 && this._ssdFeasible(receiverId, s2);
            if (ok2) {
              s1.assignees.push(receiverId);
              s2.assignees.push(receiverId);
              moved = true;
              this.log(`SSD pair: ${this.getStudentName(donorId)} → ${this.getStudentName(receiverId)} on ${s1.date}`);
              break;
            }
            s1.assignees.push(donorId);
            s2.assignees.push(donorId);
          }
          if (moved) break;
        }
        if (moved) break;
      }
    }
  }

  _rebalanceConsistencySSD(getH, capOf, shiftList) {
    let moved = true;
    let guard = 0;
    while (moved && guard++ < 200) {
      moved = false;
      const order = [...this._ctx.studentMap.keys()].sort((a, b) => getH(b) - getH(a));
      outer:
      for (const donorId of order) {
        for (const receiverId of [...order].reverse()) {
          if (donorId === receiverId) break;
          for (const s of shiftList) {
            if (s.isOpening || s.isClosing) continue;
            if (!s.assignees?.includes(donorId) || s.assignees.includes(receiverId)) continue;
            const h = this._shiftHours(s);
            if (getH(donorId) - getH(receiverId) <= h) continue;
            if (!this._canReceiveShift(receiverId, s, h, capOf)) continue;

            const donorConsBefore = this.getConsistencyScore(donorId, s.date, s.start);
            const recvConsBefore = this.getConsistencyScore(receiverId, s.date, s.start);

            s.assignees = s.assignees.filter(id => id !== donorId);
            if (this._ssdFeasible(receiverId, s)) {
              const donorConsAfter = this.getConsistencyScore(donorId, s.date, s.start);
              const recvConsAfter = this.getConsistencyScore(receiverId, s.date, s.start);
              if (recvConsAfter >= recvConsBefore && donorConsAfter >= donorConsBefore - 1) {
                s.assignees.push(receiverId);
                moved = true;
                this.log(`SSD consistency swap on ${s.date} ${s.start}`);
                break outer;
              }
            }
            s.assignees.push(donorId);
          }
        }
      }
    }
  }

  fillOpenClose() {
    this.buildRunContext();
    try {
      this.applyTemplateEdgeFlagsToSchedule();

      const shifts = Object.values(this.state.schedule)
        .filter(s => s.isOpening || s.isClosing)
        .sort((a, b) =>
          a.date.localeCompare(b.date) ||
          this.parseTimeStr(a.start) - this.parseTimeStr(b.start)
        );

      let assigns = 0;
      for (const shift of shifts) {
        const target = Math.min(this.getShiftCapacity(shift), this.state.students.length);
        let slotsToFill = target - (shift.assignees?.length || 0);
        if (slotsToFill <= 0) continue;

        const students = [...this._ctx.studentMap.values()];
        let baseCandidates = students.filter(c =>
          !shift.assignees.includes(c.id) &&
          this.canAssignStudentToShift(c.id, shift)
        );
        if (shift.isOpening || shift.isClosing) {
          baseCandidates = baseCandidates.filter(c => this.canExtendTwoHours(c.id, shift));
        }
        const sortedCandidates = this.rankCandidates(baseCandidates, shift);
        const shiftMinutes = this.parseTimeStr(shift.end) - this.parseTimeStr(shift.start);

        for (let i = 0; i < sortedCandidates.length && slotsToFill > 0; i++) {
          const student = sortedCandidates[i];
          const sid = String(student.id);
          const addHours = shiftMinutes / 60;
          const studentRec = this.getStudent(sid);
          if (studentRec && this.getWeeklyAssignedHours(sid, shift.date) + addHours > studentRec.weekly_max_hours) {
            continue;
          }
          if (studentRec && this.getTotalMonthlyHours(sid, shift.date) + addHours > studentRec.contracted_monthly_hours) {
            continue;
          }
          if (this.validateAssignment(sid, shift).length > 0) continue;
          if (shift.isOpening || shift.isClosing) {
            const prev = new Date(shift.date + 'T00:00:00');
            prev.setDate(prev.getDate() - 1);
            if (this.didEdge(this.u.localDateStr(prev), sid, shift.isOpening ? 'open' : 'close')) continue;
          }
          if (this.getConsecutiveHours(sid, shift.date, shift.start, shift.end) > 5) continue;

          shift.assignees.push(sid);
          this.assignAdjacentIfPossible(sid, shift);
          assigns++;
          slotsToFill--;
        }
      }

      this.recalculateFairness();
      this.log(`Fill openings/closings: assigned ${assigns} slot(s)`);
      return this.scheduleToShifts();
    } finally {
      this.clearRunContext();
    }
  }

  countAssignments() {
    let n = 0;
    for (const s of this.getShiftList()) { n += s.assignees?.length || 0; }
    return n;
  }

  validateSchedule() {
    this.buildRunContext();
    const issues = [];
    const perStudentWeekMinutes = {};
    const perStudentMonthMinutes = {};
    const getOr = (obj, key, d = 0) => (obj[key] ?? (obj[key] = d));
    const minsBetween = (s, e) => this.parseTimeStr(e) - this.parseTimeStr(s);

    for (const slot of this.getShiftList()) {
      const required = slot.required || 1;
      const maxCap = this.getShiftCapacity(slot);
      const count = (slot.assignees || []).length;
      if (count > maxCap) {
        issues.push(`Over capacity ${count}/${maxCap} at ${slot.date} ${slot.start}-${slot.end}`);
      }
      const need = required - count;
      if (need > 0) issues.push(`Under-filled ${need} at ${slot.date} ${slot.start}-${slot.end}`);
    }

    const assignmentsByStudent = {};
    for (const slot of this.getShiftList()) {
      (slot.assignees || []).forEach(sid => {
        (assignmentsByStudent[sid] || (assignmentsByStudent[sid] = [])).push(slot);
      });
    }

    Object.entries(assignmentsByStudent).forEach(([sid, slots]) => {
      slots.sort((a, b) =>
        a.date === b.date
          ? this.parseTimeStr(a.start) - this.parseTimeStr(b.start)
          : a.date.localeCompare(b.date)
      );
      let last = null;
      let consec = 0;
      slots.forEach(slot => {
        const mins = minsBetween(slot.start, slot.end);
        const wk = SchedulerUtils.weekIndexInMonth(slot.date);
        getOr(perStudentWeekMinutes, sid + ':' + wk);
        perStudentWeekMinutes[sid + ':' + wk] += mins;
        getOr(perStudentMonthMinutes, sid);
        perStudentMonthMinutes[sid] += mins;

        if (last && last.date === slot.date && this.parseTimeStr(last.end) === this.parseTimeStr(slot.start)) {
          consec += 1;
        } else {
          consec = 1;
        }
        if (consec > 5) {
          issues.push(`>5 consecutive hours for ${this.getStudent(sid)?.name || sid} on ${slot.date}`);
        }
        if (this.validateAssignment(sid, slot).length) {
          issues.push(`Assignment conflict for ${this.getStudent(sid)?.name || sid} at ${slot.date} ${slot.start}`);
        }
        last = slot;
      });
    });

    for (const st of this.state.students) {
      const student = this.normalizeStudent(st);
      Object.keys(perStudentWeekMinutes)
        .filter(k => k.startsWith(String(student.id) + ':'))
        .forEach(k => {
          const mins = perStudentWeekMinutes[k] || 0;
          const limit = (student.weekly_max_hours || 18) * 60;
          if (mins > limit) {
            issues.push(`Weekly limit exceeded for ${student.name} (${Math.round(mins / 60)}h)`);
          }
        });
      const m = perStudentMonthMinutes[student.id] || 0;
      if (student.contracted_monthly_hours && m > student.contracted_monthly_hours * 60) {
        issues.push(`Monthly contract exceeded for ${student.name}`);
      }
    }

    return issues;
  }

  scheduleToShifts() {
    const studentMap = new Map(
      this.state.students.map(s => [String(s.id), this.normalizeStudent(s)])
    );
    return this.getShiftList().map(shift => ({
      id: `${shift.date}-${shift.start}`,
      date: shift.date,
      start: shift.start,
      end: shift.end,
      required: shift.required || 1,
      maxCapacity: this.getShiftCapacity(shift),
      testShiftName: shift.testShiftName || null,
      assignees: (shift.assignees || []).map(sid => {
        const st = studentMap.get(String(sid));
        return st
          ? { id: st.id, name: st.name, color: st.color }
          : { id: sid, name: 'Unknown', color: '#999' };
      }),
      isOpening: !!shift.isOpening,
      isClosing: !!shift.isClosing,
      status: shift.status || 'pending',
      adminOverride: !!shift.adminOverride,
      adminOverrideBy: shift.adminOverrideBy || null,
      adminOverrideAt: shift.adminOverrideAt || null
    }));
  }

  loadShiftsIntoSchedule(shifts) {
    this.state.schedule = {};
    for (const raw of shifts || []) {
      const key = `${raw.date} ${raw.start}`;
      this.state.schedule[key] = this.normalizeShiftInPlace({
        date: raw.date,
        start: raw.start,
        end: raw.end,
        required: raw.required || 1,
        maxCapacity: raw.maxCapacity,
        assignees: (raw.assignees || []).map(a => (typeof a === 'object' ? a.id : a)),
        isOpening: !!raw.isOpening,
        isClosing: !!raw.isClosing,
        status: raw.status || 'pending',
        testShiftName: raw.testShiftName || null,
        adminOverride: !!raw.adminOverride,
        adminOverrideBy: raw.adminOverrideBy || null,
        adminOverrideAt: raw.adminOverrideAt || null
      });
    }
  }
}

window.SchedulingEngine = SchedulingEngine;
