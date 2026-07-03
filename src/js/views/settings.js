// Phase 4 — Configuration & rules UI
class SettingsView {
  constructor(app) {
    this.app = app;
    this.container = null;
  }

  async init() {
    await this.render();
  }

  async render() {
    this.container = document.getElementById('settings-view');
    if (!this.container) return;

    const oh = this.app.state.operationalHours;
    const templates = this.app.state.templates;

    this.container.innerHTML = `
      <div class="settings-header">
        <h1>Settings</h1>
        <p class="settings-subtitle">Operational rules, templates, assessment periods, and test shifts</p>
      </div>

      <div class="settings-grid">
        <section class="config-card">
          <h2>Operational hours</h2>
          <p class="config-help">Default daily hours used when generating shifts (special days override below).</p>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="op-default-start">Default start</label>
              <input type="time" class="form-input" id="op-default-start" value="${oh.defaultStart || '06:00'}">
            </div>
            <div class="form-group">
              <label class="form-label" for="op-default-end">Default end</label>
              <input type="time" class="form-input" id="op-default-end" value="${oh.defaultEnd || '19:00'}">
            </div>
            <div class="form-group form-group-action">
              <button class="btn btn-primary" id="save-op-hours-btn">Save defaults</button>
            </div>
          </div>
        </section>

        <section class="config-card">
          <h2>Public holidays</h2>
          <div class="config-list" id="public-holidays-list"></div>
          <div class="form-row">
            <input type="date" class="form-input" id="holiday-date">
            <input type="text" class="form-input" id="holiday-name" placeholder="Holiday name">
            <button class="btn btn-secondary" id="add-holiday-btn">Add</button>
          </div>
          <details class="config-details">
            <summary>Import JSON array</summary>
            <textarea class="form-textarea" id="holidays-json" rows="3" placeholder='[{"date":"2025-12-25","name":"Christmas"}]'></textarea>
            <button class="btn btn-secondary btn-sm" id="import-holidays-json-btn">Import JSON</button>
          </details>
        </section>

        <section class="config-card">
          <h2>Special hours</h2>
          <p class="config-help">Single-day overrides (e.g. early close).</p>
          <div class="config-list" id="special-hours-list"></div>
          <div class="form-row">
            <input type="date" class="form-input" id="special-date">
            <input type="time" class="form-input" id="special-start" value="09:00">
            <input type="time" class="form-input" id="special-end" value="15:00">
            <input type="text" class="form-input" id="special-name" placeholder="Label">
            <button class="btn btn-secondary" id="add-special-btn">Add</button>
          </div>
        </section>

        <section class="config-card">
          <h2>Batch holidays</h2>
          <p class="config-help">School breaks — no shifts on these date ranges.</p>
          <div class="config-list" id="batch-holidays-list"></div>
          <div class="form-row">
            <input type="date" class="form-input" id="batch-start">
            <input type="date" class="form-input" id="batch-end">
            <input type="text" class="form-input" id="batch-name" placeholder="Break name">
            <button class="btn btn-secondary" id="add-batch-btn">Add</button>
          </div>
        </section>

        <section class="config-card config-card-wide">
          <h2>Shift templates</h2>
          <p class="config-help">Hourly slots used by Generate Schedule. Opening/closing flags affect assignment rules.</p>
          <div class="form-row">
            <button class="btn btn-secondary" id="load-default-templates-btn">Load default (06:30–18:30)</button>
            <button class="btn btn-secondary" id="clear-templates-btn">Clear all</button>
            <span class="config-badge">${templates.length} template(s)</span>
          </div>
          <div class="config-list config-list-scroll" id="templates-list"></div>
          <div class="form-row">
            <input type="time" class="form-input" id="tpl-start" value="09:00">
            <input type="time" class="form-input" id="tpl-end" value="10:00">
            <input type="number" class="form-input" id="tpl-required" min="1" max="10" value="1" title="Required">
            <label class="config-check"><input type="checkbox" id="tpl-opening"> Open</label>
            <label class="config-check"><input type="checkbox" id="tpl-closing"> Close</label>
            <button class="btn btn-secondary" id="add-template-btn">Add template</button>
          </div>
        </section>

        <section class="config-card">
          <h2>Assessment periods</h2>
          <p class="config-help">Enables Saturday ops and relaxed availability rules during exams.</p>
          <div class="template-btn-list" style="margin-bottom:0.75rem">
            ${AssessmentManager.PERIOD_TEMPLATES.map(t => `
              <button type="button" class="btn btn-sm btn-secondary assess-template-btn" data-assess-template="${t.id}">
                ${t.name} (${t.durationDays}d)
              </button>`).join('')}
          </div>
          <div class="config-list" id="assessment-list"></div>
          <div class="config-list" id="test-submission-status"></div>
          <div class="form-row">
            <input type="date" class="form-input" id="assess-start">
            <input type="date" class="form-input" id="assess-end">
            <input type="text" class="form-input" id="assess-name" placeholder="Period name">
            <button class="btn btn-secondary" id="add-assessment-btn">Add</button>
          </div>
        </section>

        <section class="config-card">
          <h2>Test shifts</h2>
          <p class="config-help">Boosts capacity on overlapping slots or creates dedicated test slots. Large tests (≥5 assistants) can use early opening shifts.</p>
          <div class="form-row" style="margin-bottom:0.75rem">
            <button class="btn btn-secondary btn-sm" id="suggest-early-opening-btn">Suggest early opening (large tests)</button>
          </div>
          <div class="config-list" id="test-shifts-list"></div>
          <div class="form-row">
            <input type="date" class="form-input" id="test-date">
            <input type="time" class="form-input" id="test-start" value="09:00">
            <input type="time" class="form-input" id="test-end" value="12:00">
            <input type="number" class="form-input" id="test-required" min="1" max="10" value="1">
            <input type="text" class="form-input" id="test-name" placeholder="Test name">
            <button class="btn btn-secondary" id="add-test-btn">Add</button>
          </div>
        </section>

        <section class="config-card assessment-schedule-card">
          <h2>Assessment schedule generation</h2>
          <p class="config-help">Builds shifts for each month in the assessment period using student test dates + engine. Stored as versioned drafts until published.</p>
          <div class="form-row">
            <select class="form-select" id="assess-schedule-period">
              <option value="">— Select period —</option>
            </select>
            <button type="button" class="btn btn-primary" id="generate-assessment-schedule-btn">Generate</button>
            <button type="button" class="btn btn-secondary" id="generate-assessment-partial-btn" title="Allow missing submissions">Partial generate</button>
          </div>
          <div id="assessment-schedule-panel" class="assessment-schedule-panel">
            <div class="empty-state-sm">Select a period and generate</div>
          </div>
          <div id="assessment-schedule-history"></div>
          <div id="assessment-feedback-list"></div>
        </section>

        <section class="config-card">
          <h2>Monthly contract targets</h2>
          <p class="config-help">Default contracted hours per student (max 72).</p>
          <div class="form-row">
            <input type="number" class="form-input" id="monthly-target" min="1" max="72"
              value="${this.app.state.defaultMonthlyTarget || 72}">
            <button class="btn btn-primary" id="apply-monthly-target-btn">Apply to all students</button>
          </div>
        </section>

        <section class="config-card">
          <h2>Schedule view</h2>
          <p class="config-help">Three-month view calendar UI ships in Phase 5 — toggle saves preference now.</p>
          <label class="config-check">
            <input type="checkbox" id="three-month-toggle" ${this.app.state.threeMonthView ? 'checked' : ''}>
            Enable 3-month view (experimental)
          </label>
        </section>
      </div>
    `;

    this.renderLists();
    this.setupEventListeners();
  }

  renderLists() {
    this.renderPublicHolidays();
    this.renderSpecialHours();
    this.renderBatchHolidays();
    this.renderTemplates();
    this.renderAssessmentPeriods();
    this.renderTestSubmissionStatus();
    this.renderTestShifts();
    this.renderAssessmentScheduleUI();
  }

  renderAssessmentScheduleUI() {
    const select = document.getElementById('assess-schedule-period');
    if (!select) return;

    const periods = this.app.state.assessmentPeriods || [];
    const current = select.value;
    select.innerHTML = '<option value="">— Select period —</option>' +
      periods.map(p => `<option value="${p.id}">${this.escape(p.name)} (${p.startDate} → ${p.endDate})</option>`).join('');
    if (current) select.value = current;

    const periodId = select.value;
    const panel = document.getElementById('assessment-schedule-panel');
    const historyEl = document.getElementById('assessment-schedule-history');
    const feedbackEl = document.getElementById('assessment-feedback-list');

    if (!periodId) {
      panel.innerHTML = '<div class="empty-state-sm">Select a period and generate</div>';
      historyEl.innerHTML = '';
      feedbackEl.innerHTML = '';
      return;
    }

    const latest = this.app.state.getLatestAssessmentSchedule(periodId);
    const readiness = AssessmentManager.validateGenerationReadiness(
      this.app.state.students,
      this.app.state.testDateAccess,
      AssessmentManager.normalizePeriod(this.app.state.findAssessmentPeriod(periodId))
    );

    panel.innerHTML = `
      <div class="readiness-summary ${readiness.ready ? 'ready' : 'not-ready'}">
        ${readiness.ready ? '✅ Ready to generate' : '⚠️ Not ready: ' + this.escape(readiness.errors[0] || 'check submissions')}
        · ${readiness.totalTests || 0} test date(s) in period
      </div>
      ${latest ? `
        <div class="schedule-record">
          <strong>v${latest.version}</strong>
          <span class="tag tag-assessment">${AssessmentManager.scheduleStatusLabel(latest.status)}</span>
          <span>${latest.stats?.shiftCount || 0} shifts · ${latest.stats?.assignmentCount || 0} assignments · ${latest.stats?.uncovered || 0} uncovered</span>
          <span class="config-help">Created ${new Date(latest.createdAt).toLocaleString()}</span>
          <div class="toolbar-actions" style="margin-top:0.5rem">
            ${latest.status === 'draft' ? `<button type="button" class="btn btn-sm btn-secondary" data-assess-action="review" data-id="${latest.id}">Send for review</button>` : ''}
            ${latest.status === 'pending_review' ? `<button type="button" class="btn btn-sm btn-success" data-assess-action="approve" data-id="${latest.id}">Approve</button>` : ''}
            ${latest.status === 'approved' ? `<button type="button" class="btn btn-sm btn-primary" data-assess-action="publish" data-id="${latest.id}">Publish to calendar</button>` : ''}
            <button type="button" class="btn btn-sm btn-secondary" data-assess-action="load" data-id="${latest.id}">Load in calendar</button>
          </div>
        </div>` : '<div class="empty-state-sm">No schedule generated yet for this period</div>'}`;

    panel.querySelectorAll('[data-assess-action]').forEach(btn => {
      btn.addEventListener('click', () => this.handleAssessmentScheduleAction(btn.dataset.assessAction, btn.dataset.id));
    });

    const all = this.app.state.getAssessmentSchedulesForPeriod(periodId);
    historyEl.innerHTML = all.length > 1 ? `
      <h4>Version history</h4>
      <ul class="version-history-list">
        ${all.slice(0, 5).map(s => `
          <li>v${s.version} · ${AssessmentManager.scheduleStatusLabel(s.status)} · ${new Date(s.createdAt).toLocaleDateString()}</li>
        `).join('')}
      </ul>` : '';

    const feedback = latest?.feedback || [];
    feedbackEl.innerHTML = feedback.length ? `
      <h4>Student feedback (${feedback.length})</h4>
      ${feedback.map(f => `
        <div class="contract-history-item">
          <strong>${this.escape(f.studentName)}</strong>: ${this.escape(f.message)}
          <span class="config-help">${new Date(f.createdAt).toLocaleString()}</span>
        </div>`).join('')}` : '';
  }

  async handleAssessmentScheduleAction(action, scheduleId) {
    try {
      if (action === 'review') {
        await this.app.state.submitAssessmentScheduleForReview(scheduleId);
        this.app.showToast('Schedule sent for student review', 'success');
      } else if (action === 'approve') {
        await this.app.state.approveAssessmentSchedule(scheduleId);
        this.app.showToast('Schedule approved', 'success');
      } else if (action === 'publish') {
        const ok = await this.app.confirmDialog('Publish this assessment schedule to the live calendar?', {
          title: 'Publish schedule',
          confirmLabel: 'Publish'
        });
        if (!ok) return;
        await this.app.state.publishAssessmentSchedule(scheduleId);
        this.app.showToast('Assessment schedule published to calendar', 'success');
      } else if (action === 'load') {
        await this.app.state.loadAssessmentScheduleIntoEditor(scheduleId);
        this.app.showToast('Loaded in calendar — open Schedule view', 'success');
      }
      this.renderAssessmentScheduleUI();
    } catch (err) {
      this.app.showToast(err.message || 'Action failed', 'error');
    }
  }

  renderTestSubmissionStatus() {
    const el = document.getElementById('test-submission-status');
    if (!el) return;
    const report = this.app.state.getTestDateStatusReport();
    const submitted = report.filter(r => r.access.status === 'submitted' || r.access.status === 'locked').length;
    const pending = report.length - submitted;
    if (!report.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `
      <div class="config-help" style="margin:0.5rem 0">
        Test date submissions: ${submitted}/${report.length} submitted · ${pending} pending
      </div>`;
  }

  renderPublicHolidays() {
    const el = document.getElementById('public-holidays-list');
    const list = this.app.state.operationalHours.publicHolidays || [];
    if (!list.length) {
      el.innerHTML = '<div class="empty-state-sm">No public holidays</div>';
      return;
    }
    el.innerHTML = list.map(h => `
      <div class="config-list-item">
        <span>${h.date}</span>
        <span>${this.escape(h.name)}</span>
        <button class="btn btn-sm btn-icon" data-remove-holiday="${this.escape(h.date)}" title="Remove">×</button>
      </div>
    `).join('');
  }

  renderSpecialHours() {
    const el = document.getElementById('special-hours-list');
    const list = this.app.state.operationalHours.specialHours || [];
    if (!list.length) {
      el.innerHTML = '<div class="empty-state-sm">No special hours</div>';
      return;
    }
    el.innerHTML = list.map(sh => `
      <div class="config-list-item">
        <span>${sh.date}</span>
        <span>${sh.start}–${sh.end}</span>
        <span>${this.escape(sh.name)}</span>
        <button class="btn btn-sm btn-icon" data-remove-special="${this.escape(sh.date)}" title="Remove">×</button>
      </div>
    `).join('');
  }

  renderBatchHolidays() {
    const el = document.getElementById('batch-holidays-list');
    const list = this.app.state.operationalHours.batchHolidays || [];
    if (!list.length) {
      el.innerHTML = '<div class="empty-state-sm">No batch holidays</div>';
      return;
    }
    el.innerHTML = list.map(bh => `
      <div class="config-list-item">
        <span>${bh.startDate} → ${bh.endDate}</span>
        <span>${this.escape(bh.name || '')}</span>
        <button class="btn btn-sm btn-icon"
          data-remove-batch="${this.escape(bh.startDate)}|${this.escape(bh.endDate)}" title="Remove">×</button>
      </div>
    `).join('');
  }

  renderTemplates() {
    const el = document.getElementById('templates-list');
    const list = this.app.state.templates;
    if (!list.length) {
      el.innerHTML = '<div class="empty-state-sm">No templates — load defaults or add manually</div>';
      return;
    }
    el.innerHTML = list.map(t => `
      <div class="config-list-item">
        <span>${t.start}–${t.end}</span>
        <span>req ${t.required || 1}</span>
        ${t.isOpening ? '<span class="tag tag-open">Open</span>' : ''}
        ${t.isClosing ? '<span class="tag tag-close">Close</span>' : ''}
        <button class="btn btn-sm btn-icon" data-remove-template="${this.escape(t.id)}" title="Remove">×</button>
      </div>
    `).join('');
    const badge = this.container.querySelector('.config-badge');
    if (badge) badge.textContent = `${list.length} template(s)`;
  }

  renderAssessmentPeriods() {
    const el = document.getElementById('assessment-list');
    const list = this.app.state.assessmentPeriods;
    if (!list.length) {
      el.innerHTML = '<div class="empty-state-sm">No assessment periods</div>';
      return;
    }
    el.innerHTML = list.map(ap => `
      <div class="config-list-item config-list-item-assessment">
        <span class="tag tag-assessment">●</span>
        <span>${ap.startDate} → ${ap.endDate}</span>
        <span>${this.escape(ap.name)}</span>
        <span class="config-help">${ap.notificationDaysBefore || 30}d notice</span>
        <button class="btn btn-sm btn-icon"
          data-remove-assessment="${this.escape(ap.startDate)}|${this.escape(ap.endDate)}" title="Remove">×</button>
      </div>
    `).join('');
  }

  renderTestShifts() {
    const el = document.getElementById('test-shifts-list');
    const list = this.app.state.testShifts;
    if (!list.length) {
      el.innerHTML = '<div class="empty-state-sm">No test shifts</div>';
      return;
    }
    el.innerHTML = list.map(ts => `
      <div class="config-list-item">
        <span>${ts.date}</span>
        <span>${ts.start}–${ts.end}</span>
        <span>${ts.required} req · max ${ts.maxCapacity || ts.required} · ${this.escape(ts.name)}</span>
        ${ts.isLargeTest ? '<span class="tag tag-assessment">Large</span>' : ''}
        ${ts.isEarlyOpening ? '<span class="tag tag-open">Early</span>' : ''}
        <button class="btn btn-sm btn-secondary" data-adjust-test="${this.escape(ts.id)}" title="Adjust capacity">±</button>
        <button class="btn btn-sm btn-icon"
          data-remove-test="${this.escape(ts.date)}|${this.escape(ts.start)}" title="Remove">×</button>
      </div>
    `).join('');
  }

  setupEventListeners() {
    document.getElementById('save-op-hours-btn').addEventListener('click', () => this.saveOperationalHours());

    document.getElementById('add-holiday-btn').addEventListener('click', () => this.addHoliday());
    document.getElementById('import-holidays-json-btn').addEventListener('click', () => this.importHolidaysJson());

    document.getElementById('add-special-btn').addEventListener('click', () => this.addSpecialHours());
    document.getElementById('add-batch-btn').addEventListener('click', () => this.addBatchHoliday());

    document.getElementById('load-default-templates-btn').addEventListener('click', () => this.loadDefaultTemplates());
    document.getElementById('clear-templates-btn').addEventListener('click', () => this.clearTemplates());
    document.getElementById('add-template-btn').addEventListener('click', () => this.addTemplate());

    document.getElementById('add-assessment-btn').addEventListener('click', () => this.addAssessment());
    document.querySelectorAll('.assess-template-btn').forEach(btn => {
      btn.addEventListener('click', () => this.applyAssessmentTemplate(btn.dataset.assessTemplate));
    });

    document.getElementById('assess-schedule-period')?.addEventListener('change', () => this.renderAssessmentScheduleUI());
    document.getElementById('generate-assessment-schedule-btn')?.addEventListener('click', () => this.runAssessmentGeneration(false));
    document.getElementById('generate-assessment-partial-btn')?.addEventListener('click', () => this.runAssessmentGeneration(true));
    document.getElementById('add-test-btn').addEventListener('click', () => this.addTestShift());
    document.getElementById('suggest-early-opening-btn')?.addEventListener('click', () => this.suggestEarlyOpening());

    document.getElementById('apply-monthly-target-btn').addEventListener('click', () => this.applyMonthlyTarget());

    document.getElementById('three-month-toggle').addEventListener('change', (e) => {
      this.setThreeMonthView(e.target.checked);
    });

    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-holiday]');
      if (btn) return this.removeHoliday(btn.dataset.removeHoliday);

      const special = e.target.closest('[data-remove-special]');
      if (special) return this.removeSpecial(special.dataset.removeSpecial);

      const batch = e.target.closest('[data-remove-batch]');
      if (batch) {
        const [start, end] = batch.dataset.removeBatch.split('|');
        return this.removeBatch(start, end);
      }

      const tpl = e.target.closest('[data-remove-template]');
      if (tpl) return this.removeTemplate(tpl.dataset.removeTemplate);

      const assess = e.target.closest('[data-remove-assessment]');
      if (assess) {
        const [start, end] = assess.dataset.removeAssessment.split('|');
        return this.removeAssessment(start, end);
      }

      const test = e.target.closest('[data-remove-test]');
      if (test) {
        const [date, start] = test.dataset.removeTest.split('|');
        return this.removeTest(date, start);
      }

      const adjust = e.target.closest('[data-adjust-test]');
      if (adjust) return this.adjustTestCapacity(adjust.dataset.adjustTest);
    });
  }

  async suggestEarlyOpening() {
    try {
      const preview = await this.app.state.suggestEarlyOpeningForLargeTests({ autoAdd: false });
      if (!preview.largeTests.length) {
        this.app.showToast(preview.message, 'info');
        return;
      }
      const ok = await this.app.confirmDialog(
        `${preview.largeTests.length} large test(s) can use an early opening shift (06:00–06:30).\n\nAdd them automatically?`,
        { title: 'Early opening shifts', confirmLabel: 'Add shifts' }
      );
      if (!ok) {
        this.app.showToast(preview.message, 'info');
        return;
      }
      const result = await this.app.state.suggestEarlyOpeningForLargeTests({ autoAdd: true });
      this.renderTestShifts();
      this.app.showToast(result.message, 'success');
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async adjustTestCapacity(testShiftId) {
    const ts = this.app.state.testShifts.find(t => String(t.id) === String(testShiftId));
    if (!ts) return;
    const input = prompt(
      `Adjust required assistants for ${ts.name} (${ts.date} ${ts.start}-${ts.end})\n\nCurrent: ${ts.required} required, ${ts.maxCapacity} max\n\nEnter new required (1-10):`,
      String(ts.required)
    );
    if (input === null) return;
    try {
      await this.app.state.adjustTestShiftCapacity(testShiftId, input);
      this.renderTestShifts();
      this.app.showToast('Test shift capacity updated', 'success');
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async saveOperationalHours() {
    try {
      const start = document.getElementById('op-default-start').value;
      const end = document.getElementById('op-default-end').value;
      await this.app.state.updateDefaultOperationalHours(start, end);
      this.app.showToast('Default operational hours saved', 'success');
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async addHoliday() {
    try {
      await this.app.state.addPublicHoliday(
        document.getElementById('holiday-date').value,
        document.getElementById('holiday-name').value.trim()
      );
      document.getElementById('holiday-date').value = '';
      document.getElementById('holiday-name').value = '';
      this.renderPublicHolidays();
      this.app.showToast('Public holiday added', 'success');
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async removeHoliday(date) {
    await this.app.state.removePublicHoliday(date);
    this.renderPublicHolidays();
    this.app.showToast('Holiday removed', 'info');
  }

  async importHolidaysJson() {
    try {
      const count = await this.app.state.importPublicHolidaysJson(
        document.getElementById('holidays-json').value
      );
      this.renderPublicHolidays();
      this.app.showToast(`Imported ${count} holidays`, 'success');
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async addSpecialHours() {
    try {
      await this.app.state.addSpecialHours(
        document.getElementById('special-date').value,
        document.getElementById('special-start').value,
        document.getElementById('special-end').value,
        document.getElementById('special-name').value.trim()
      );
      document.getElementById('special-date').value = '';
      document.getElementById('special-name').value = '';
      this.renderSpecialHours();
      this.app.showToast('Special hours added', 'success');
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async removeSpecial(date) {
    await this.app.state.removeSpecialHours(date);
    this.renderSpecialHours();
  }

  async addBatchHoliday() {
    try {
      await this.app.state.addBatchHoliday(
        document.getElementById('batch-start').value,
        document.getElementById('batch-end').value,
        document.getElementById('batch-name').value.trim()
      );
      document.getElementById('batch-start').value = '';
      document.getElementById('batch-end').value = '';
      document.getElementById('batch-name').value = '';
      this.renderBatchHolidays();
      this.app.showToast('Batch holiday added', 'success');
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async removeBatch(start, end) {
    await this.app.state.removeBatchHoliday(start, end);
    this.renderBatchHolidays();
  }

  async loadDefaultTemplates() {
    try {
      const n = await this.app.state.loadDefaultTemplates();
      this.renderTemplates();
      this.app.showToast(`Loaded ${n} default templates`, 'success');
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async clearTemplates() {
    if (!confirm('Remove all shift templates?')) return;
    await this.app.state.clearTemplates();
    this.renderTemplates();
    this.app.showToast('Templates cleared', 'info');
  }

  async addTemplate() {
    try {
      await this.app.state.addTemplate({
        start: document.getElementById('tpl-start').value,
        end: document.getElementById('tpl-end').value,
        required: document.getElementById('tpl-required').value,
        isOpening: document.getElementById('tpl-opening').checked,
        isClosing: document.getElementById('tpl-closing').checked
      });
      this.renderTemplates();
      this.app.showToast('Template added', 'success');
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async removeTemplate(id) {
    await this.app.state.removeTemplate(id);
    this.renderTemplates();
  }

  async addAssessment() {
    try {
      await this.app.state.addAssessmentPeriod(
        document.getElementById('assess-start').value,
        document.getElementById('assess-end').value,
        document.getElementById('assess-name').value.trim()
      );
      document.getElementById('assess-start').value = '';
      document.getElementById('assess-end').value = '';
      document.getElementById('assess-name').value = '';
      this.renderAssessmentPeriods();
      this.renderTestSubmissionStatus();
      this.app.showToast('Assessment period added', 'success');
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async applyAssessmentTemplate(templateId) {
    const startDate = window.prompt('Start date for this assessment period (YYYY-MM-DD):');
    if (!startDate) return;
    try {
      const period = await this.app.state.applyAssessmentTemplate(templateId, startDate);
      this.renderAssessmentPeriods();
      this.renderTestSubmissionStatus();
      this.renderAssessmentScheduleUI();
      this.app.showToast(`Added ${period.name} (${period.startDate} → ${period.endDate})`, 'success');
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async runAssessmentGeneration(allowPartial) {
    const periodId = document.getElementById('assess-schedule-period')?.value;
    if (!periodId) {
      this.app.showToast('Select an assessment period first', 'warning');
      return;
    }
    const ok = await this.app.confirmDialog(
      allowPartial
        ? 'Generate with partial submissions? Students without test dates may be over-assigned.'
        : 'Generate assessment schedule from submitted test dates? This creates a new versioned draft.',
      { title: 'Generate assessment schedule', confirmLabel: 'Generate' }
    );
    if (!ok) return;
    try {
      this.app.showToast('Generating assessment schedule…', 'info');
      const record = await this.app.state.generateAssessmentSchedule(periodId, { allowPartial });
      this.renderAssessmentScheduleUI();
      this.app.showToast(
        `Generated v${record.version}: ${record.stats.shiftCount} shifts, ${record.stats.assignmentCount} assignments`,
        'success'
      );
    } catch (err) {
      this.app.showToast(err.message || 'Generation failed', 'error');
    }
  }

  async removeAssessment(start, end) {
    await this.app.state.removeAssessmentPeriod(start, end);
    this.renderAssessmentPeriods();
    this.renderTestSubmissionStatus();
  }

  async addTestShift() {
    try {
      await this.app.state.addTestShift({
        date: document.getElementById('test-date').value,
        start: document.getElementById('test-start').value,
        end: document.getElementById('test-end').value,
        required: document.getElementById('test-required').value,
        name: document.getElementById('test-name').value.trim()
      });
      document.getElementById('test-date').value = '';
      document.getElementById('test-name').value = '';
      this.renderTestShifts();
      this.app.showToast('Test shift added', 'success');
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async removeTest(date, start) {
    await this.app.state.removeTestShift(date, start);
    this.renderTestShifts();
  }

  async applyMonthlyTarget() {
    try {
      const val = await this.app.state.applyMonthlyTargetToAll(
        document.getElementById('monthly-target').value
      );
      this.app.showToast(`Applied ${val}h monthly target to all students`, 'success');
    } catch (err) {
      this.app.showToast(err.message, 'error');
    }
  }

  async setThreeMonthView(enabled) {
    await this.app.state.setThreeMonthView(enabled);
    this.app.showToast(
      enabled ? '3-month view enabled (calendar UI in Phase 5)' : 'Single month view',
      'info'
    );
  }

  escape(text) {
    // Delegate to the canonical quote-safe escaper (Phase 3 / F-04).
    return window.SchedulerUtils.escapeHtml(text);
  }

  destroy() {
    if (this.container) this.container.innerHTML = '';
  }
}

window.SettingsView = SettingsView;
