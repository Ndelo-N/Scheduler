// Student Shift Scheduler PWA - Schedule View
// Calendar grid with shift management and drag-and-drop functionality

class ScheduleView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.currentMonth = new Date().getMonth();
    this.currentYear = new Date().getFullYear();
    this.selectedDate = null;
    this.shifts = [];
    this.students = [];
    this.templates = [];
    this.selectedShift = null;
    this._modalShift = null;
    this._swapContext = { date: null, start: null, fromStudentId: null };
  }

  async init() {
    await this.render();
  }

  async render() {
    this.container = document.getElementById('schedule-view');
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="schedule-header">
        <div class="schedule-controls">
          <button class="btn btn-icon" id="prev-month-btn">
            <i class="icon-chevron-left"></i>
          </button>
          <h1 id="month-year-display">${this.getMonthYearDisplay()}</h1>
          <button class="btn btn-icon" id="next-month-btn">
            <i class="icon-chevron-right"></i>
          </button>
        </div>
        <div class="schedule-actions">
          <button class="btn btn-primary" id="add-shift-btn">
            <i class="icon-plus"></i>
            Add Shift
          </button>
          <button class="btn btn-secondary" id="generate-schedule-btn">
            <i class="icon-magic"></i>
            Generate Schedule
          </button>
          <button class="btn btn-secondary" id="rebalance-btn">
            <i class="icon-balance"></i>
            Rebalance
          </button>
          <button class="btn btn-secondary" id="fill-open-close-btn">
            Fill Open/Close
          </button>
          <button class="btn btn-secondary" id="export-csv-btn" title="Ctrl+E">
            Export CSV
          </button>
          <button class="btn btn-secondary" id="export-ics-btn" title="Ctrl+I">
            Export ICS
          </button>
          <button class="btn btn-secondary" id="print-schedule-btn" title="Ctrl+P">
            Print
          </button>
          <button class="btn btn-secondary" id="save-state-btn" title="Ctrl+S">
            Save
          </button>
          <button class="btn btn-secondary" id="load-state-btn" title="Ctrl+O">
            Load
          </button>
          <button class="btn btn-secondary" id="toggle-three-month-btn" title="Ctrl+T">
            <i class="icon-calendar"></i>
            <span id="three-month-label">3-Month View</span>
          </button>
          <button class="btn btn-warning" id="admin-mode-btn">
            <i class="icon-shield"></i>
            <span id="admin-mode-text">Enable Admin Mode</span>
          </button>
        </div>
      </div>

      <div id="assessment-review-banner" class="assessment-review-banner" style="display:none"></div>

      <div class="schedule-content">
        <div class="schedule-sidebar">
          <div class="sidebar-section">
            <h3>Students</h3>
            <div class="student-list" id="student-list">
              <div class="loading">Loading...</div>
            </div>
          </div>
          
          <div class="sidebar-section">
            <h3>Shift Templates</h3>
            <div class="template-list" id="template-list">
              <div class="loading">Loading...</div>
            </div>
          </div>
        </div>

        <div class="schedule-calendar">
          <div class="calendar-grid" id="calendar-grid">
            <div class="loading">Loading...</div>
          </div>
        </div>
      </div>

      <div class="schedule-footer">
        <div class="schedule-stats">
          <div class="stat-item">
            <span class="stat-label">Total Shifts:</span>
            <span class="stat-value" id="total-shifts">0</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Assigned:</span>
            <span class="stat-value" id="assigned-shifts">0</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Unassigned:</span>
            <span class="stat-value" id="unassigned-shifts">0</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Conflicts:</span>
            <span class="stat-value danger-txt" id="conflict-count">0</span>
          </div>
        </div>
        <div class="schedule-summary">
          <h3>Hours summary</h3>
          <div class="summary-table-wrap">
            <table class="summary-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Weekly breakdown</th>
                  <th>Month hrs</th>
                  <th>Open</th>
                  <th>Close</th>
                  <th>Issues</th>
                </tr>
              </thead>
              <tbody id="summary-table-body"></tbody>
            </table>
          </div>
          <div class="summary-warnings" id="summary-warnings"></div>
        </div>
      </div>

      <div id="student-selection-modal" class="modal-overlay" style="display:none">
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h2>Add student to shift</h2>
            <button type="button" class="btn btn-icon modal-close" id="close-student-modal">×</button>
          </div>
          <div class="modal-body">
            <div class="shift-info-panel" id="modal-shift-info"></div>
            <div class="student-picker-list" id="modal-student-list"></div>
          </div>
        </div>
      </div>

      <div id="shift-context-menu" class="context-menu" style="display:none"></div>

      <div id="swap-modal" class="modal-overlay" style="display:none">
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h2>Swap shift</h2>
            <button type="button" class="btn btn-icon modal-close" id="close-swap-modal">×</button>
          </div>
          <div class="modal-body">
            <div class="shift-info-panel" id="swap-shift-info"></div>
            <p class="config-help">Select a replacement. A swap debt will be recorded (original student owes replacement).</p>
            <div class="student-picker-list" id="swap-student-list"></div>
          </div>
        </div>
      </div>
    `;

    await this.loadData();
    this.setupEventListeners();
    this.syncThreeMonthUi();
    this.renderCalendar();
    this.renderSummary();
  }

  isThreeMonthView() {
    return !!this.app.state.threeMonthView;
  }

  getThreeMonthRange() {
    const months = [];
    for (let offset = -1; offset <= 1; offset++) {
      const d = new Date(this.currentYear, this.currentMonth + offset, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        name: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      });
    }
    return months;
  }

  syncThreeMonthUi() {
    const btn = document.getElementById('toggle-three-month-btn');
    const label = document.getElementById('three-month-label');
    if (!btn || !label) return;
    if (this.isThreeMonthView()) {
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-secondary');
      label.textContent = '3-Month: ON';
    } else {
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-secondary');
      label.textContent = '3-Month View';
    }
  }

  async loadData() {
    try {
      this.currentYear = this.app.state.year;
      this.currentMonth = this.app.state.month;
      document.getElementById('month-year-display').textContent = this.getMonthYearDisplay();

      await this.loadStudents();
      
      // Load shifts for current month
      await this.loadShifts();
      
      // Load shift templates
      await this.loadTemplates();
      this.renderAssessmentReviewBanner();
      
    } catch (error) {
      console.error('❌ Failed to load schedule data:', error);
      this.showError('Failed to load schedule data');
    }
  }

  async loadStudents() {
    try {
      this.students = await this.getStudents();
      this.renderStudentList();
    } catch (error) {
      console.error('❌ Failed to load students:', error);
    }
  }

  renderAssessmentReviewBanner() {
    const el = document.getElementById('assessment-review-banner');
    if (!el) return;

    const pending = this.app.state.getPendingReviewSchedule();
    if (!pending) {
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }

    el.style.display = 'block';
    el.innerHTML = `
      <div class="banner-content">
        <strong>Assessment schedule v${pending.version} — ${this.escapeHtml(pending.periodName)}</strong>
        <span class="config-help">Pending student review · ${pending.stats?.shiftCount || 0} shifts</span>
        <button type="button" class="btn btn-sm btn-secondary" id="assessment-feedback-btn">Submit feedback</button>
      </div>`;

    document.getElementById('assessment-feedback-btn')?.addEventListener('click', () => {
      this.showAssessmentFeedbackDialog(pending.id);
    });
  }

  showAssessmentFeedbackDialog(scheduleId) {
    if (!this.students.length) {
      window.app.showToast('Load students first', 'warning');
      return;
    }
    const names = this.students.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
    const pick = window.prompt(`Who is submitting feedback? Enter number:\n${names}`);
    if (pick === null) return;
    const student = this.students[Number(pick) - 1];
    if (!student) {
      window.app.showToast('Invalid selection', 'error');
      return;
    }
    const message = window.prompt(`Feedback for ${student.name}:`);
    if (message === null || !message.trim()) return;
    this.app.state.addAssessmentFeedback(scheduleId, student.id, message.trim())
      .then(() => {
        window.app.showToast('Feedback submitted — see Settings for review', 'success');
        this.renderAssessmentReviewBanner();
      })
      .catch(err => window.app.showToast(err.message || 'Failed', 'error'));
  }

  async loadShifts() {
    try {
      if (this.isThreeMonthView()) {
        this.shifts = [];
        for (const { year, month } of this.getThreeMonthRange()) {
          const monthShifts = await this.getShiftsForMonth(month, year);
          this.shifts.push(...monthShifts);
        }
      } else {
        this.shifts = await this.getShiftsForMonth(this.currentMonth, this.currentYear);
      }
      this.updateStats();
    } catch (error) {
      console.error('❌ Failed to load shifts:', error);
    }
  }

  async loadTemplates() {
    try {
      this.templates = await this.getShiftTemplates();
      this.renderTemplateList();
    } catch (error) {
      console.error('❌ Failed to load templates:', error);
    }
  }

  renderStudentList() {
    const studentList = document.getElementById('student-list');
    
    if (this.students.length === 0) {
      studentList.innerHTML = '<div class="empty-state">No students found</div>';
      return;
    }

    const engine = this.buildEngineContext();

    studentList.innerHTML = this.students.map(student => {
      let indicator = '';
      if (this.selectedShift && engine) {
        const can = engine.canAssignStudentToShift(student.id, this.selectedShift);
        const avail = engine.isStudentAvailable(
          student.id,
          this.selectedShift.date,
          this.selectedShift.start,
          this.selectedShift.end,
          engine.getAvailability(student.id)
        );
        indicator = can ? ' ✅' : (avail ? ' 🔒' : ' 🔒');
      }
      return `
      <div class="student-item" data-student-id="${student.id}" draggable="true">
        <div class="student-avatar" style="background-color: ${student.color}">
          ${student.name.charAt(0).toUpperCase()}
        </div>
        <div class="student-info">
          <div class="student-name">${this.escapeHtml(student.name)}${indicator}</div>
          <div class="student-hours">${student.weeklyHours || student.weekly_max_hours || 0}h/week max</div>
        </div>
      </div>`;
    }).join('');
  }

  buildEngineContext() {
    if (!this.shifts.length && !this.selectedShift) return null;
    const engine = this.app.state.getEngine();
    engine.loadShiftsIntoSchedule(this.shifts);
    engine.buildRunContext();
    return engine;
  }

  getEngineShift(date, start) {
    const engine = this.buildEngineContext();
    if (!engine) return null;
    return engine.state.schedule[`${date} ${start}`] || null;
  }

  renderTemplateList() {
    const templateList = document.getElementById('template-list');
    
    if (this.templates.length === 0) {
      templateList.innerHTML = `
        <div class="empty-state">
          No templates configured.
          <button class="btn btn-sm btn-secondary" type="button" id="goto-settings-templates">Open Settings</button>
        </div>`;
      const btn = document.getElementById('goto-settings-templates');
      if (btn) {
        btn.addEventListener('click', () => window.app.navigateToView('settings'));
      }
      return;
    }

    templateList.innerHTML = this.templates.map(template => `
      <div class="template-item" data-template-id="${template.id}">
        <div class="template-time">${template.start} - ${template.end}</div>
        <div class="template-capacity">${template.required || 1} required${template.isOpening ? ' · Open' : ''}${template.isClosing ? ' · Close' : ''}</div>
      </div>
    `).join('');
  }

  renderCalendar() {
    const calendarGrid = document.getElementById('calendar-grid');
    if (!calendarGrid) return;

    if (this.isThreeMonthView()) {
      this.renderThreeMonthCalendar(calendarGrid);
    } else {
      this.renderWeekGridCalendar(calendarGrid);
    }

    this.setupDragAndDrop();
    this.setupShiftInteractions();
    this.renderSummary();
  }

  renderWeekGridCalendar(calendarGrid) {
    const headerRow = document.createElement('div');
    headerRow.className = 'calendar-header';
    headerRow.innerHTML = `
      <div class="time-column">Time</div>
      ${this.getDaysOfWeek().map((day, dayIndex) => {
        const date = this.getDateForDay(dayIndex);
        const classes = ['day-header'];
        if (this.isAssessmentDay(date)) classes.push('assessment-day-header');
        return `<div class="${classes.join(' ')}" data-date="${date}" title="${this.getDayTooltip(date)}">${day}<span class="day-date">${date.slice(8)}</span></div>`;
      }).join('')}
    `;

    const timeSlots = this.getTimeSlots();
    const calendarRows = timeSlots.map(timeSlot => {
      const row = document.createElement('div');
      row.className = 'calendar-row';
      row.innerHTML = `
        <div class="time-slot">${timeSlot}</div>
        ${this.getDaysOfWeek().map((day, dayIndex) => {
          const date = this.getDateForDay(dayIndex);
          const shifts = this.getShiftsForDateAndTime(date, timeSlot);
          const cellClasses = ['shift-cell'];
          if (this.isAssessmentDay(date)) cellClasses.push('assessment-day');
          
          return `
            <div class="${cellClasses.join(' ')}" data-date="${date}" data-time="${timeSlot}" title="${this.getDayTooltip(date)}">
              ${shifts.map(shift => this.renderShift(shift)).join('')}
            </div>
          `;
        }).join('')}
      `;
      return row;
    });

    calendarGrid.innerHTML = '';
    calendarGrid.className = 'calendar-grid calendar-grid-week';
    calendarGrid.appendChild(headerRow);
    calendarRows.forEach(row => calendarGrid.appendChild(row));
  }

  renderThreeMonthCalendar(calendarGrid) {
    const container = document.createElement('div');
    container.className = 'three-month-container';

    for (const monthInfo of this.getThreeMonthRange()) {
      const monthDiv = document.createElement('div');
      monthDiv.className = 'three-month-month';
      monthDiv.innerHTML = `<div class="three-month-header"><h3>${monthInfo.name}</h3></div>`;
      const cal = document.createElement('div');
      cal.className = 'three-month-calendar';
      this.renderMonthDayGrid(cal, monthInfo.year, monthInfo.month);
      monthDiv.appendChild(cal);
      container.appendChild(monthDiv);
    }

    calendarGrid.innerHTML = '';
    calendarGrid.className = 'calendar-grid calendar-grid-three';
    calendarGrid.appendChild(container);
  }

  renderMonthDayGrid(container, year, month) {
    const calDiv = document.createElement('div');
    calDiv.className = 'month-cal';
    const head = document.createElement('div');
    head.className = 'month-cal-head';
    head.innerHTML = this.getDaysOfWeek().map(d => `<div>${d}</div>`).join('');
    calDiv.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'month-cal-grid';
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
      grid.appendChild(document.createElement('div'));
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = SchedulerUtils.dateISO(year, month, d);
      const dayEl = document.createElement('div');
      const engine = this.app.state.getEngine();
      const op = engine.isOperationalDay(dateStr);
      dayEl.className = op ? 'month-day' : 'month-day non-operational';
      if (op && this.isAssessmentDay(dateStr)) dayEl.classList.add('assessment-day');

      const dayShifts = this.shifts.filter(s => s.date === dateStr);
      dayEl.innerHTML = `
        <div class="month-day-num">${d}</div>
        <div class="month-day-shifts" data-date="${dateStr}">
          ${dayShifts.map(s => this.renderShift(s, true)).join('')}
        </div>
      `;
      grid.appendChild(dayEl);
    }

    calDiv.appendChild(grid);
    container.appendChild(calDiv);
  }

  renderShift(shift, compact = false) {
    const adminOverrideClass = shift.adminOverride ? 'admin-override' : '';
    const testClass = shift.testShiftName ? 'test-shift' : '';
    const conflictCount = this.countShiftConflicts(shift);
    const conflictClass = conflictCount ? 'shift-conflict' : '';
    const unfilledClass = (shift.assignees?.length || 0) < (shift.required || 1) ? 'shift-unfilled' : '';
    const adminOverrideBadge = shift.adminOverride ? 
      `<div class="admin-override-badge" title="Admin Override - Restrictions Bypassed">🔧</div>` : '';
    const testBadge = shift.testShiftName ?
      `<div class="test-shift-badge" title="Test: ${this.escapeHtml(shift.testShiftName)}">📝</div>` : '';
    const required = shift.required || shift.maxCapacity || 1;
    const engine = this.buildEngineContext();
    const rawShift = engine?.state.schedule[`${shift.date} ${shift.start}`];

    const assigneeHtml = (shift.assignees || []).map(assignee => {
      const hasConflict = rawShift && engine
        ? engine.validateAssignment(assignee.id, rawShift).length > 0
        : false;
      const conflictCls = hasConflict ? ' assignee-conflict' : '';
      return `
      <span class="assignee-chip${conflictCls}" draggable="true"
        data-student-id="${assignee.id}"
        data-from-date="${shift.date}"
        data-from-start="${shift.start}"
        style="background-color: ${assignee.color}"
        title="${this.escapeHtml(assignee.name)}">
        ${compact ? assignee.name.split(' ')[0] : assignee.name}
      </span>`;
    }).join('');

    if (compact) {
      return `
        <div class="shift-item shift-item-compact ${adminOverrideClass} ${testClass} ${conflictClass} ${unfilledClass}"
          data-date="${shift.date}" data-start="${shift.start}">
          ${adminOverrideBadge}${testBadge}
          <div class="shift-time">${shift.start}–${shift.end}</div>
          <div class="shift-assignees" data-date="${shift.date}" data-start="${shift.start}">${assigneeHtml || '<span class="shift-placeholder">+</span>'}</div>
          <div class="shift-capacity">${(shift.assignees?.length || 0)}/${required}</div>
        </div>`;
    }

    return `
      <div class="shift-item ${adminOverrideClass} ${testClass} ${conflictClass} ${unfilledClass}"
        data-date="${shift.date}" data-start="${shift.start}">
        ${adminOverrideBadge}
        ${testBadge}
        <div class="shift-time">${shift.start} - ${shift.end}</div>
        <div class="shift-capacity-label">${(shift.assignees?.length || 0)}/${required} assistants</div>
        <div class="shift-assignees drop-zone" data-date="${shift.date}" data-start="${shift.start}">
          ${assigneeHtml || '<span class="shift-placeholder">Click or drop to assign</span>'}
        </div>
        <div class="shift-actions">
          <button class="btn btn-sm btn-icon shift-edit-btn" type="button" title="Edit capacity">
            <i class="icon-edit"></i>
          </button>
          <button class="btn btn-sm btn-icon shift-delete-btn" type="button" title="Clear assignees">
            <i class="icon-trash"></i>
          </button>
        </div>
      </div>
    `;
  }

  countShiftConflicts(shift) {
    const engine = this.buildEngineContext();
    if (!engine) return 0;
    const raw = engine.state.schedule[`${shift.date} ${shift.start}`];
    if (!raw) return 0;
    let count = 0;
    for (const sid of raw.assignees || []) {
      if (engine.validateAssignment(sid, raw).length) count++;
      if (!engine.isStudentAvailable(sid, raw.date, raw.start, raw.end, engine.getAvailability(sid))) count++;
    }
    if ((raw.assignees?.length || 0) > engine.getShiftCapacity(raw)) count++;
    return count;
  }

  countStudentConflicts(studentId) {
    const engine = this.buildEngineContext();
    if (!engine) return 0;
    const sid = String(studentId);
    let c = 0;
    for (const shift of engine.getShiftList()) {
      if (!shift.assignees.includes(sid)) continue;
      if (engine.validateAssignment(sid, shift).length) c++;
    }
    return c;
  }

  getMonthYearDisplay() {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${monthNames[this.currentMonth]} ${this.currentYear}`;
  }

  getDaysOfWeek() {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  }

  getTimeSlots() {
    const slots = [];
    for (let hour = 6; hour < 19; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:30`);
    }
    return slots;
  }

  getDateForDay(dayIndex) {
    const firstDay = new Date(this.currentYear, this.currentMonth, 1);
    const firstDayOfWeek = firstDay.getDay();
    const date = new Date(firstDay);
    date.setDate(date.getDate() + (dayIndex - firstDayOfWeek));
    return SchedulerUtils.localDateStr(date);
  }

  getShiftsForDateAndTime(date, timeSlot) {
    return this.shifts.filter(shift => 
      shift.date === date && shift.start === timeSlot
    );
  }

  isAssessmentDay(dateStr) {
    const periods = this.app.state.assessmentPeriods || [];
    const d = new Date(dateStr + 'T00:00:00');
    return periods.some(ap => {
      const start = new Date(ap.startDate + 'T00:00:00');
      const end = new Date(ap.endDate + 'T00:00:00');
      return d >= start && d <= end;
    });
  }

  getDayTooltip(dateStr) {
    const parts = [];
    const ap = (this.app.state.assessmentPeriods || []).find(p => this.isAssessmentDay(dateStr) &&
      dateStr >= p.startDate && dateStr <= p.endDate);
    if (ap) parts.push(`Assessment: ${ap.name}`);
    const tests = (this.app.state.testShifts || []).filter(t => t.date === dateStr);
    if (tests.length) parts.push(`${tests.length} test shift(s)`);
    return parts.join(' · ') || '';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  updateStats() {
    const totalShifts = this.shifts.length;
    const assignedShifts = this.shifts.filter(shift => (shift.assignees?.length || 0) > 0).length;
    const unassignedShifts = totalShifts - assignedShifts;
    let conflicts = 0;
    this.shifts.forEach(s => { conflicts += this.countShiftConflicts(s); });

    document.getElementById('total-shifts').textContent = totalShifts;
    document.getElementById('assigned-shifts').textContent = assignedShifts;
    document.getElementById('unassigned-shifts').textContent = unassignedShifts;
    const conflictEl = document.getElementById('conflict-count');
    if (conflictEl) conflictEl.textContent = conflicts;
  }

  renderSummary() {
    const tbody = document.getElementById('summary-table-body');
    if (!tbody) return;

    const engine = this.buildEngineContext();
    const byWeek = {};
    for (const st of this.students) {
      const weeks = {};
      for (const shift of this.shifts) {
        const sid = String(st.id);
        const raw = shift.assignees?.some(a => String(a.id) === sid);
        if (!raw) continue;
        const wk = SchedulerUtils.weekIndexInMonth(shift.date);
        const hrs = (SchedulerUtils.parseTimeStr(shift.end) - SchedulerUtils.parseTimeStr(shift.start)) / 60;
        weeks[wk] = (weeks[wk] || 0) + hrs;
      }
      byWeek[st.id] = weeks;
    }

    tbody.innerHTML = this.students.map(st => {
      const weeks = byWeek[st.id] || {};
      const wkStr = Object.keys(weeks).sort().map(k => `W${Number(k) + 1}:${weeks[k].toFixed(1)}`).join(' | ') || '—';
      let monthHrs = 0;
      for (const shift of this.shifts) {
        if (shift.assignees?.some(a => String(a.id) === String(st.id))) {
          monthHrs += (SchedulerUtils.parseTimeStr(shift.end) - SchedulerUtils.parseTimeStr(shift.start)) / 60;
        }
      }
      const fairness = this.app.state.fairness[st.id] || { openings: 0, closings: 0 };
      const conf = this.countStudentConflicts(st.id);
      const contract = st.contracted_monthly_hours || st.monthlyMaxHours || '';
      return `
        <tr>
          <td><span class="sq" style="background:${st.color}"></span> ${this.escapeHtml(st.name)}</td>
          <td>${wkStr}</td>
          <td>${monthHrs.toFixed(1)}${contract ? `/${contract}` : ''}</td>
          <td>${fairness.openings || 0}</td>
          <td>${fairness.closings || 0}</td>
          <td>${conf ? `<span class="danger-txt">${conf}</span>` : '0'}</td>
        </tr>`;
    }).join('');
  }

  setupEventListeners() {
    // Month navigation
    document.getElementById('prev-month-btn').addEventListener('click', () => {
      this.previousMonth();
    });

    document.getElementById('next-month-btn').addEventListener('click', () => {
      this.nextMonth();
    });

    // Action buttons
    document.getElementById('add-shift-btn').addEventListener('click', () => {
      this.showAddShiftModal();
    });

    document.getElementById('generate-schedule-btn').addEventListener('click', () => {
      this.generateSchedule();
    });

    document.getElementById('rebalance-btn').addEventListener('click', () => {
      this.rebalanceSchedule();
    });

    document.getElementById('fill-open-close-btn').addEventListener('click', () => {
      this.fillOpenClose();
    });

    document.getElementById('export-csv-btn').addEventListener('click', () => {
      this.exportCSV();
    });

    document.getElementById('export-ics-btn').addEventListener('click', () => {
      this.exportICS();
    });

    document.getElementById('print-schedule-btn').addEventListener('click', () => {
      this.printSchedule();
    });

    document.getElementById('save-state-btn').addEventListener('click', () => {
      window.app.saveStateDownload();
    });

    document.getElementById('load-state-btn').addEventListener('click', () => {
      window.app.loadStateFromFile();
    });

    document.getElementById('toggle-three-month-btn').addEventListener('click', () => {
      this.toggleThreeMonthView();
    });

    // Admin mode toggle
    document.getElementById('admin-mode-btn').addEventListener('click', () => {
      this.toggleAdminMode();
    });

    document.getElementById('close-student-modal')?.addEventListener('click', () => {
      this.closeStudentSelectionModal();
    });

    document.getElementById('close-swap-modal')?.addEventListener('click', () => {
      this.closeSwapModal();
    });

    document.getElementById('student-selection-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'student-selection-modal') this.closeStudentSelectionModal();
    });

    document.getElementById('swap-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'swap-modal') this.closeSwapModal();
    });

    document.addEventListener('click', () => this.hideContextMenu());

    this._scheduleKeyHandler = (e) => {
      if (this.app.currentView !== 'schedule') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.previousMonth(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.nextMonth(); }
      if (e.key === 'Escape') {
        this.closeStudentSelectionModal();
        this.closeSwapModal();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        this.toggleThreeMonthView();
      }
    };
    document.addEventListener('keydown', this._scheduleKeyHandler);

    this.syncAdminModeUi();
  }

  syncAdminModeUi() {
    const adminBtn = document.getElementById('admin-mode-btn');
    const adminText = document.getElementById('admin-mode-text');
    if (!adminBtn || !adminText) return;
    if (this.isAdminMode()) {
      adminBtn.classList.remove('btn-warning');
      adminBtn.classList.add('btn-danger');
      adminText.textContent = 'Disable Admin Mode';
    } else {
      adminBtn.classList.remove('btn-danger');
      adminBtn.classList.add('btn-warning');
      adminText.textContent = 'Enable Admin Mode';
    }
  }

  async toggleThreeMonthView() {
    await this.app.state.setThreeMonthView(!this.isThreeMonthView());
    this.syncThreeMonthUi();
    await this.loadShifts();
    this.renderCalendar();
    window.app.showToast(this.isThreeMonthView() ? '3-month view enabled' : 'Single month view', 'info');
  }

  setupShiftInteractions() {
    document.querySelectorAll('.shift-item').forEach(el => {
      const date = el.dataset.date;
      const start = el.dataset.start;
      if (!date || !start) return;

      el.addEventListener('click', (e) => {
        if (e.target.closest('.assignee-chip') || e.target.closest('.shift-actions')) return;
        e.stopPropagation();
        this.selectShift(date, start);
        this.openStudentSelectionModal(date, start);
      });

      el.querySelector('.shift-edit-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editShift(date, start);
      });

      el.querySelector('.shift-delete-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearShiftAssignees(date, start);
      });

      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showShiftContextMenu(e, date, start);
      });
    });

    document.querySelectorAll('.assignee-chip[draggable="true"]').forEach(chip => {
      chip.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        e.dataTransfer.setData('text/plain', chip.dataset.studentId);
        e.dataTransfer.setData('from-date', chip.dataset.fromDate);
        e.dataTransfer.setData('from-start', chip.dataset.fromStart);
        e.dataTransfer.setData('chip-move', 'true');
        if (this.isAdminMode()) e.dataTransfer.setData('admin-override', 'true');
        chip.classList.add('dragging');
      });
      chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
      chip.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openSwapModal(chip.dataset.fromDate, chip.dataset.fromStart, chip.dataset.studentId);
      });
    });
  }

  selectShift(date, start) {
    this.selectedShift = this.getEngineShift(date, start) || this.shifts.find(s => s.date === date && s.start === start);
    this.renderStudentList();
  }

  setupDragAndDrop() {
    document.querySelectorAll('.student-item').forEach(item => {
      item.draggable = true;
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', item.dataset.studentId);
        e.dataTransfer.effectAllowed = 'move';
        if (this.isAdminMode()) e.dataTransfer.setData('admin-override', 'true');
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
    });

    const dropTargets = document.querySelectorAll('.shift-cell, .shift-assignees, .month-day-shifts');
    dropTargets.forEach(cell => {
      cell.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        cell.classList.add('drop-hint');
        if (this.isAdminMode()) cell.classList.add('admin-override-target');
      });

      cell.addEventListener('dragleave', () => {
        cell.classList.remove('drop-hint');
        cell.classList.remove('admin-override-target');
      });

      cell.addEventListener('drop', async (e) => {
        e.preventDefault();
        cell.classList.remove('drop-hint');
        cell.classList.remove('admin-override-target');

        const studentId = e.dataTransfer.getData('text/plain');
        const isAdminOverride = e.dataTransfer.getData('admin-override') === 'true';
        const isChipMove = e.dataTransfer.getData('chip-move') === 'true';
        const fromDate = e.dataTransfer.getData('from-date');
        const fromStart = e.dataTransfer.getData('from-start');

        let date = cell.dataset.date;
        let start = cell.dataset.time || cell.dataset.start;

        if (!start && cell.closest('.shift-item')) {
          const shiftEl = cell.closest('.shift-item');
          date = shiftEl.dataset.date;
          start = shiftEl.dataset.start;
        }

        if (!date || !start) return;

        if (isChipMove && fromDate && fromStart && fromDate === date && fromStart === start) return;

        if (isChipMove && fromDate && fromStart) {
          await this.removeStudentFromShift(fromDate, fromStart, studentId, { silent: true });
        }

        await this.assignStudentToShift(studentId, date, start, isAdminOverride);
      });
    });
  }

  async previousMonth() {
    this.currentMonth--;
    if (this.currentMonth < 0) {
      this.currentMonth = 11;
      this.currentYear--;
    }
    this.app.state.year = this.currentYear;
    this.app.state.month = this.currentMonth;
    document.getElementById('month-year-display').textContent = this.getMonthYearDisplay();
    await this.loadShifts();
    this.renderCalendar();
  }

  async nextMonth() {
    this.currentMonth++;
    if (this.currentMonth > 11) {
      this.currentMonth = 0;
      this.currentYear++;
    }
    this.app.state.year = this.currentYear;
    this.app.state.month = this.currentMonth;
    document.getElementById('month-year-display').textContent = this.getMonthYearDisplay();
    await this.loadShifts();
    this.renderCalendar();
  }

  openStudentSelectionModal(date, start) {
    const shift = this.shifts.find(s => s.date === date && s.start === start);
    if (!shift) {
      window.app.showToast('No shift at this time', 'warning');
      return;
    }
    this._modalShift = { date, start };
    const info = document.getElementById('modal-shift-info');
    const list = document.getElementById('modal-student-list');
    const required = shift.required || 1;
    info.innerHTML = `
      <strong>${shift.date}</strong> ${shift.start}–${shift.end}<br>
      Assigned: ${(shift.assignees?.length || 0)}/${required}
      ${shift.testShiftName ? `<br>Test: ${this.escapeHtml(shift.testShiftName)}` : ''}`;

    const engine = this.buildEngineContext();
    list.innerHTML = this.students.map(student => {
      const sid = String(student.id);
      const already = shift.assignees?.some(a => String(a.id) === sid);
      const can = engine && engine.canAssignStudentToShift(sid, engine.state.schedule[`${date} ${start}`]);
      const avail = engine && engine.isStudentAvailable(sid, date, start, shift.end, engine.getAvailability(sid));
      const icon = already ? '⚠️' : (can ? '✅' : (avail ? '🔒' : '🔒'));
      const cls = can && !already ? 'student-picker-item available' : 'student-picker-item unavailable';
      return `
        <div class="${cls}" data-student-id="${sid}" ${can && !already ? '' : 'aria-disabled="true"'}>
          <span class="sq" style="background:${student.color}"></span>
          <div>
            <div class="student-name">${this.escapeHtml(student.name)} ${icon}</div>
            <div class="student-details">${already ? 'Already assigned' : (can ? 'Eligible' : 'Not eligible')}</div>
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.student-picker-item.available').forEach(item => {
      item.addEventListener('click', () => {
        this.assignStudentToShift(item.dataset.studentId, date, start, false);
        this.closeStudentSelectionModal();
      });
    });

    document.getElementById('student-selection-modal').style.display = 'flex';
  }

  closeStudentSelectionModal() {
    const modal = document.getElementById('student-selection-modal');
    if (modal) modal.style.display = 'none';
    this._modalShift = null;
  }

  openSwapModal(date, start, fromStudentId) {
    const shift = this.shifts.find(s => s.date === date && s.start === start);
    if (!shift) return;

    this._swapContext = { date, start, fromStudentId: String(fromStudentId) };
    const fromStudent = this.students.find(s => String(s.id) === String(fromStudentId));

    document.getElementById('swap-shift-info').innerHTML = `
      <strong>${shift.date}</strong> ${shift.start}–${shift.end}<br>
      Replacing: ${this.escapeHtml(fromStudent?.name || fromStudentId)}`;

    const engine = this.buildEngineContext();
    const rawShift = engine?.state.schedule[`${date} ${start}`];
    const list = document.getElementById('swap-student-list');

    list.innerHTML = this.students.map(student => {
      const sid = String(student.id);
      if (sid === String(fromStudentId)) return '';
      const can = rawShift && engine && engine.canAssignStudentToShift(sid, rawShift);
      const cls = can ? 'student-picker-item available' : 'student-picker-item unavailable';
      return `
        <div class="${cls}" data-student-id="${sid}" ${can ? '' : 'aria-disabled="true"'}>
          <span class="sq" style="background:${student.color}"></span>
          <div>
            <div class="student-name">${this.escapeHtml(student.name)} ${can ? '✅' : '🔒'}</div>
            <div class="student-details">${can ? 'Eligible replacement' : 'Not eligible (conflict/limits)'}</div>
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.student-picker-item.available').forEach(item => {
      item.addEventListener('click', () => this.performSwap(item.dataset.studentId));
    });

    document.getElementById('swap-modal').style.display = 'flex';
  }

  closeSwapModal() {
    const modal = document.getElementById('swap-modal');
    if (modal) modal.style.display = 'none';
    this._swapContext = { date: null, start: null, fromStudentId: null };
  }

  async performSwap(toStudentId) {
    const { date, start, fromStudentId } = this._swapContext;
    if (!date || !start || !fromStudentId) return;

    try {
      await this.app.state.performShiftSwap(
        this.currentYear,
        this.currentMonth,
        date,
        start,
        fromStudentId,
        toStudentId
      );
      await this.loadShifts();
      this.renderCalendar();
      this.closeSwapModal();
      if (this.app.views.swaps) {
        await this.app.views.swaps.refreshDebts?.();
      }
      const fromName = this.app.state.studentName(fromStudentId);
      const toName = this.app.state.studentName(toStudentId);
      window.app.showToast(`Swap complete: ${fromName} → ${toName}. Debt recorded.`, 'success');
    } catch (err) {
      window.app.showToast(err.message || 'Swap failed', 'error');
    }
  }

  async validateSchedule() {
    if (!this.shifts.length) {
      window.app.showToast('No schedule to validate', 'warning');
      return;
    }
    const engine = this.buildEngineContext();
    const issues = engine.validateSchedule();
    engine.clearRunContext();
    if (issues.length) {
      console.log('Validation issues:', issues);
      window.app.showToast(`${issues.length} issue(s) found — see console for details`, 'warning');
    } else {
      window.app.showToast('All validation checks passed', 'success');
    }
  }

  showShiftContextMenu(e, date, start) {
    const menu = document.getElementById('shift-context-menu');
    if (!menu) return;
    menu.style.display = 'block';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.innerHTML = `
      <button type="button" data-action="add">Add student…</button>
      <button type="button" data-action="capacity">Adjust capacity…</button>
      <button type="button" data-action="clear">Clear all assignees</button>`;
    menu.querySelector('[data-action="add"]').onclick = () => {
      this.hideContextMenu();
      this.openStudentSelectionModal(date, start);
    };
    menu.querySelector('[data-action="capacity"]').onclick = () => {
      this.hideContextMenu();
      this.editShift(date, start);
    };
    menu.querySelector('[data-action="clear"]').onclick = () => {
      this.hideContextMenu();
      this.clearShiftAssignees(date, start);
    };
  }

  hideContextMenu() {
    const menu = document.getElementById('shift-context-menu');
    if (menu) menu.style.display = 'none';
  }

  async editShift(date, start) {
    const shift = this.shifts.find(s => s.date === date && s.start === start);
    if (!shift) return;
    const current = shift.required || shift.maxCapacity || 1;
    const val = window.prompt(`Required assistants (1–10):`, String(current));
    if (val == null) return;
    try {
      await this.app.state.setShiftRequired(
        this.currentYear, this.currentMonth, date, start, val
      );
      await this.loadShifts();
      this.renderCalendar();
      window.app.showToast('Shift capacity updated', 'success');
    } catch (err) {
      window.app.showToast(err.message || 'Update failed', 'error');
    }
  }

  async clearShiftAssignees(date, start) {
    const shift = this.shifts.find(s => s.date === date && s.start === start);
    if (!shift || !shift.assignees?.length) return;
    const ok = await window.app.confirmDialog(
      `Remove all ${shift.assignees.length} assignee(s) from ${date} ${start}?`
    );
    if (!ok) return;
    for (const a of [...shift.assignees]) {
      await this.removeStudentFromShift(date, start, a.id, { silent: true });
    }
    await this.loadShifts();
    this.renderCalendar();
    window.app.showToast('Shift cleared', 'info');
  }

  async removeStudentFromShift(date, start, studentId, opts = {}) {
    try {
      await this.app.state.manualRemoveStudent(
        this.currentYear, this.currentMonth, studentId, date, start
      );
      await this.loadShifts();
      this.renderCalendar();
      if (!opts.silent) {
        window.app.showToast('Student removed from shift', 'info');
      }
    } catch (err) {
      if (!opts.silent) window.app.showToast(err.message || 'Remove failed', 'error');
    }
  }

  showAddShiftModal() {
    // This would show a modal for adding new shifts
    window.app.showToast('Add shift modal would open here', 'info');
  }

  async generateSchedule() {
    try {
      if (!this.app.state.students.length) {
        window.app.showToast('Load students first (Students → Load Sample or Import CSV)', 'warning');
        return;
      }
      if (this.shifts.length) {
        const ok = await window.app.confirmDialog(
          'Generate will rebuild shifts for the selected period. Existing assignments may be lost. Continue?'
        );
        if (!ok) return;
      }
      window.app.showToast('Generating schedule...', 'info');
      this.app.state.year = this.currentYear;
      this.app.state.month = this.currentMonth;

      const months = this.isThreeMonthView()
        ? this.getThreeMonthRange()
        : [{ year: this.currentYear, month: this.currentMonth }];

      let totalShifts = 0;
      let totalAssigned = 0;
      for (const { year, month } of months) {
        const shifts = await this.app.state.generateSchedule(year, month);
        totalShifts += shifts.length;
        totalAssigned += shifts.filter(s => (s.assignees?.length || 0) > 0).length;
      }

      await this.loadShifts();
      this.templates = await this.getShiftTemplates();
      this.renderTemplateList();
      this.renderCalendar();
      window.app.showToast(
        `Schedule generated: ${totalShifts} shifts, ${totalAssigned} with assignees`,
        'success'
      );
    } catch (error) {
      console.error('❌ Failed to generate schedule:', error);
      window.app.showToast(error.message || 'Failed to generate schedule', 'error');
    }
  }

  async rebalanceSchedule() {
    try {
      window.app.showToast('Rebalancing hours...', 'info');
      await this.app.state.rebalanceSchedule(this.currentYear, this.currentMonth);
      await this.loadShifts();
      this.renderCalendar();
      window.app.showToast('Schedule rebalanced', 'success');
    } catch (error) {
      console.error('❌ Rebalance failed:', error);
      window.app.showToast(error.message || 'Rebalance failed', 'error');
    }
  }

  async fillOpenClose() {
    try {
      window.app.showToast('Filling opening/closing shifts...', 'info');
      await this.app.state.fillOpenClose(this.currentYear, this.currentMonth);
      await this.loadShifts();
      this.renderCalendar();
      window.app.showToast('Opening/closing shifts filled', 'success');
    } catch (error) {
      console.error('❌ Fill open/close failed:', error);
      window.app.showToast(error.message || 'Fill failed', 'error');
    }
  }

  async exportCSV() {
    try {
      const shifts = await this.app.state.collectExportShifts(this.currentYear, this.currentMonth);
      if (!shifts.length) {
        window.app.showToast('No shifts to export — generate a schedule first', 'warning');
        return;
      }
      const label = this.isThreeMonthView() ? '3mo' : `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}`;
      const rowCount = SchedulerExport.exportCSV(shifts, {
        includeMonth: this.isThreeMonthView(),
        filename: `schedule-${label}.csv`
      });
      window.app.showToast(`Exported ${rowCount} CSV row(s)`, 'success');
    } catch (error) {
      console.error('❌ CSV export failed:', error);
      window.app.showToast('Failed to export CSV', 'error');
    }
  }

  async exportICS() {
    try {
      const shifts = await this.app.state.collectExportShifts(this.currentYear, this.currentMonth);
      if (!shifts.length) {
        window.app.showToast('No shifts to export — generate a schedule first', 'warning');
        return;
      }
      const count = SchedulerExport.exportICSPerStudent(shifts, this.students);
      if (!count) {
        window.app.showToast('No assigned shifts to export as calendars', 'warning');
        return;
      }
      window.app.showToast(`Exported ${count} student calendar file(s)`, 'success');
    } catch (error) {
      console.error('❌ ICS export failed:', error);
      window.app.showToast('Failed to export ICS', 'error');
    }
  }

  printSchedule() {
    window.print();
  }

  /** @deprecated use exportCSV */
  async exportSchedule() {
    return this.exportCSV();
  }

  async assignStudentToShift(studentId, date, start, isAdminOverride = false) {
    try {
      const shiftExists = this.shifts.some(s => s.date === date && s.start === start);
      if (!shiftExists) {
        window.app.showToast('No shift at this time — generate schedule first', 'warning');
        return;
      }

      const updated = await this.app.state.manualDropAssign(
        this.currentYear,
        this.currentMonth,
        studentId,
        date,
        start,
        isAdminOverride
      );

      await this.loadShifts();

      const student = this.students.find(s => String(s.id) === String(studentId));
      this.renderCalendar();

      if (isAdminOverride && student) {
        window.app.showToast(`🔧 ADMIN OVERRIDE: ${student.name} assigned`, 'warning');
      } else if (student) {
        window.app.showToast(`${student.name} assigned to shift`, 'success');
      }
    } catch (error) {
      console.error('❌ Failed to assign student to shift:', error);
      window.app.showToast(error.message || 'Failed to assign student to shift', 'error');
    }
  }

  async getStudents() {
    return this.app.state.students;
  }

  async getShiftsForMonth(month, year) {
    return this.app.state.getShiftsForMonth(year, month);
  }

  async getShiftTemplates() {
    return this.app.state.templates;
  }

  // Admin Mode Functions
  isAdminMode() {
    return localStorage.getItem('adminMode') === 'true';
  }

  toggleAdminMode() {
    const newMode = !this.isAdminMode();
    localStorage.setItem('adminMode', newMode.toString());
    this.syncAdminModeUi();
    window.app.showToast(
      newMode ? '🔧 Admin Mode ENABLED - All restrictions bypassed' : 'Admin Mode disabled',
      newMode ? 'warning' : 'info'
    );
  }

  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    this.container.appendChild(errorDiv);
    
    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.parentNode.removeChild(errorDiv);
      }
    }, 5000);
  }

  destroy() {
    if (this._scheduleKeyHandler) {
      document.removeEventListener('keydown', this._scheduleKeyHandler);
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// Make ScheduleView available globally
window.ScheduleView = ScheduleView;
