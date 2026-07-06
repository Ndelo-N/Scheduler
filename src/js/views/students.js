// Student Shift Scheduler PWA - Students View
// Student management, contracts (Phase 8), CSV import

class StudentsView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.students = [];
    this.compliance = [];
    this.currentFilter = 'all';
    this.currentTab = 'students';
  }

  async init() {
    await this.render();
  }

  async render() {
    this.container = document.getElementById('students-view');
    if (!this.container) return;

    if (!this.app.can('view.students')) {
      this.container.innerHTML = `
        <div class="access-denied">
          <h2>Students</h2>
          <p>Student management is available to Team-Leads and admins only.</p>
        </div>`;
      return;
    }

    this.container.innerHTML = `
      <div class="students-header">
        <h1>Students & Contracts</h1>
        <div class="students-actions">
          <button class="btn btn-primary" id="add-student-btn">Add Student</button>
          <button class="btn btn-secondary" id="load-sample-btn">Load Sample</button>
          <button class="btn btn-secondary" id="import-csv-btn">Import CSV</button>
          <button class="btn btn-secondary" id="export-csv-btn">Export CSV</button>
        </div>
      </div>

      <div class="view-tabs">
        <button type="button" class="view-tab active" data-tab="students">Students</button>
        <button type="button" class="view-tab" data-tab="contracts">Contract compliance</button>
        <button type="button" class="view-tab" data-tab="availability">Availability</button>
        <button type="button" class="view-tab" data-tab="tests">Test dates</button>
        <button type="button" class="view-tab" data-tab="ledger">Hours ledger</button>
      </div>

      <div class="students-content">
        <div class="students-sidebar">
          <div class="sidebar-section">
            <h3>Filters</h3>
            <div class="filter-list" id="student-filters">
              <button class="filter-btn active" data-filter="all">All Students</button>
              <button class="filter-btn" data-filter="active">Active</button>
              <button class="filter-btn" data-filter="inactive">Inactive</button>
              <button class="filter-btn" data-filter="over-cap">Over weekly cap</button>
            </div>
            <div class="filter-list contract-filters" id="contract-filters" style="display:none">
              <button class="filter-btn active" data-cfilter="all">All</button>
              <button class="filter-btn" data-cfilter="under-filled">Under-filled</button>
              <button class="filter-btn" data-cfilter="at-risk">At risk</button>
              <button class="filter-btn" data-cfilter="non-compliant">Over contract</button>
            </div>
          </div>

          <div class="sidebar-section">
            <h3>Contract templates</h3>
            <p class="config-help">Apply preset monthly hours to all students.</p>
            <div class="template-btn-list">
              ${ContractManager.TEMPLATES.map(t => `
                <button type="button" class="btn btn-sm btn-secondary contract-template-btn" data-template="${t.id}">
                  ${t.name}
                </button>`).join('')}
            </div>
          </div>

          <div class="sidebar-section">
            <h3>Quick Stats</h3>
            <div class="stats-list">
              <div class="stat-item"><span class="stat-label">Total:</span><span class="stat-value" id="total-students">0</span></div>
              <div class="stat-item"><span class="stat-label">Active:</span><span class="stat-value" id="active-students">0</span></div>
              <div class="stat-item"><span class="stat-label">Under contract:</span><span class="stat-value" id="under-contract-count">0</span></div>
            </div>
          </div>
        </div>

        <div class="students-main">
          <div id="students-panel">
            <div class="students-list" id="students-list"><div class="loading">Loading...</div></div>
          </div>
          <div id="contracts-panel" style="display:none">
            <div class="contract-dashboard">
              <div class="panel-toolbar">
                <div>
                  <h2>Monthly compliance — ${this.getMonthLabel()}</h2>
                  <p class="config-help">Assigned hours from saved schedule vs each student's contracted monthly hours.</p>
                </div>
                <button type="button" class="btn btn-secondary" id="export-compliance-btn">Export compliance CSV</button>
              </div>
              <div class="summary-table-wrap">
                <table class="summary-table contract-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Contract</th>
                      <th>Assigned</th>
                      <th>Remaining</th>
                      <th>%</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody id="contract-table-body"></tbody>
                </table>
              </div>
              <h3>Recent contract changes</h3>
              <div class="contract-history" id="contract-history-list"></div>
            </div>
          </div>
          <div id="availability-panel" style="display:none">
            <div class="availability-dashboard">
              <div class="onboarding-panel">
                <h3>How to submit availability</h3>
                <ol class="onboarding-steps">
                  <li>Add weekly blocks for each day you can work (start/end times).</li>
                  <li>Add any one-off unavailable dates (exams, appointments).</li>
                  <li>Check the scheduler preview — it must match the CSV import format.</li>
                  <li>Click <strong>Submit &amp; lock</strong> when ready; admin can unlock to edit again.</li>
                </ol>
              </div>
              <div class="panel-toolbar">
                <div>
                  <h2>Student availability</h2>
                  <p class="config-help">Self-service weekly patterns with draft → submitted → locked workflow. Used by the scheduler engine.</p>
                </div>
                <div class="toolbar-actions">
                  <button type="button" class="btn btn-secondary" id="grant-all-availability-btn">Grant all edit access</button>
                  <button type="button" class="btn btn-secondary" id="export-availability-btn">Export availability CSV</button>
                </div>
              </div>
              <div class="availability-stats" id="availability-stats"></div>
              <div class="summary-table-wrap">
                <table class="summary-table availability-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Student</th>
                      <th>Status</th>
                      <th>Weekly blocks</th>
                      <th>Unavailable dates</th>
                      <th>Submitted</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody id="availability-table-body"></tbody>
                </table>
              </div>
            </div>
          </div>
          <div id="tests-panel" style="display:none">
            <div class="availability-dashboard">
              <div class="onboarding-panel">
                <h3>Assessment test dates</h3>
                <p class="config-help">During assessment periods, weekly availability is ignored — only your exam times block scheduling. In <strong>June and November</strong>, no shifts are allowed the day before an exam, and on exam day shifts may only start 1 hour after the exam ends.</p>
              </div>
              <div class="panel-toolbar">
                <div id="active-assessment-label" class="config-help"></div>
                <button type="button" class="btn btn-secondary" id="export-test-dates-btn">Export test dates CSV</button>
              </div>
              <div class="summary-table-wrap">
                <table class="summary-table availability-table">
                  <thead>
                    <tr><th></th><th>Student</th><th>Status</th><th>Tests</th><th>Submitted</th><th></th></tr>
                  </thead>
                  <tbody id="tests-table-body"></tbody>
                </table>
              </div>
            </div>
          </div>
          <div id="ledger-panel" style="display:none">
            <div class="contract-dashboard hours-ledger-dashboard">
              <div class="panel-toolbar">
                <div>
                  <h2>Hours ledger (v${HoursLedger.VERSION})</h2>
                  <p class="config-help">Term balance: <strong>Stud</strong> (worked hours) vs contract + claims. Use <em>Clocked</em> after payroll upload; <em>Assigned</em> uses the schedule baseline (v1.2). Negative balance = owed pay; positive = owes work. Claimable cap enforced (I7).</p>
                </div>
                <div class="toolbar-actions">
                  <label class="form-label ledger-stud-source-label" for="ledger-stud-source">Stud source</label>
                  <select class="form-select" id="ledger-stud-source" title="Clocked = reconciled payroll; Assigned = schedule baseline">
                    <option value="assigned">Assigned (schedule)</option>
                    <option value="clocked">Clocked (payroll)</option>
                  </select>
                  <button type="button" class="btn btn-secondary" id="refresh-ledger-btn">Refresh</button>
                  <button type="button" class="btn btn-secondary" id="export-ledger-btn">Export CSV</button>
                </div>
              </div>
              <section class="worked-hours-section" aria-labelledby="worked-hours-heading">
                <h3 id="worked-hours-heading">Worked hours (VeraLab payroll)</h3>
                <p class="config-help">Upload a weekly DetailedPayroll <code>.xls</code> / <code>.xlsx</code> export. Rows are merged idempotently; reconciliation runs for the calendar month shown in Schedule.</p>
                <div id="worked-hours-controls" class="worked-hours-controls"></div>
                <div id="worked-hours-report" class="worked-hours-report"></div>
              </section>
              <div id="ledger-summary" class="compliance-summary-grid"></div>
              <div id="ledger-student-picker" class="form-row" style="margin-bottom:1rem">
                <label class="form-label" for="ledger-student-select">Student detail</label>
                <select class="form-select" id="ledger-student-select"></select>
              </div>
              <div id="ledger-detail" class="summary-table-wrap"></div>
              <div id="ledger-suggestions"></div>
            </div>
          </div>
        </div>
      </div>

      <div id="contract-edit-modal" class="modal-overlay" style="display:none">
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="contract-modal-title">Edit contract</h2>
            <button type="button" class="btn btn-icon modal-close" id="close-contract-modal">×</button>
          </div>
          <div class="modal-body">
            <p id="contract-modal-student"></p>
            <div class="form-row contract-template-row">
              ${ContractManager.TEMPLATES.map(t => `
                <button type="button" class="btn btn-sm btn-secondary contract-pick-btn" data-hours="${t.hours}" data-type="${t.id}">${t.hours}h</button>
              `).join('')}
            </div>
            <div class="form-group">
              <label class="form-label" for="contract-hours-input">Monthly hours (1–72)</label>
              <input type="number" class="form-input" id="contract-hours-input" min="1" max="72" step="1">
            </div>
            <div class="form-group">
              <label class="form-label" for="contract-note-input">Note (optional)</label>
              <input type="text" class="form-input" id="contract-note-input" placeholder="Reason for change">
            </div>
          </div>
          <div class="modal-footer confirm-dialog-actions">
            <button type="button" class="btn btn-secondary" id="cancel-contract-btn">Cancel</button>
            <button type="button" class="btn btn-primary" id="save-contract-btn">Save contract</button>
          </div>
        </div>
      </div>

      <div id="add-student-modal" class="modal-overlay" style="display:none">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Add student</h2>
            <button type="button" class="btn btn-icon modal-close" id="close-add-student-modal">×</button>
          </div>
          <div class="modal-body">
            <p class="config-help">New students get immediate availability edit access. Set their contract hours, then open the Availability tab to enter weekly patterns.</p>
            <div class="form-group">
              <label class="form-label" for="new-student-name">Name</label>
              <input type="text" class="form-input" id="new-student-name" placeholder="Full name" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="new-student-weekly">Max weekly hours</label>
                <input type="number" class="form-input" id="new-student-weekly" min="1" max="72" value="18">
              </div>
              <div class="form-group">
                <label class="form-label" for="new-student-monthly">Contract monthly hours</label>
                <input type="number" class="form-input" id="new-student-monthly" min="1" max="72" value="72">
              </div>
            </div>
            <div class="form-row contract-template-row">
              ${ContractManager.TEMPLATES.map(t => `
                <button type="button" class="btn btn-sm btn-secondary new-student-contract-btn" data-hours="${t.hours}">${t.hours}h/mo</button>
              `).join('')}
            </div>
          </div>
          <div class="modal-footer confirm-dialog-actions">
            <button type="button" class="btn btn-secondary" id="cancel-add-student-btn">Cancel</button>
            <button type="button" class="btn btn-primary" id="save-add-student-btn">Add student</button>
          </div>
        </div>
      </div>

      <div id="availability-edit-modal" class="modal-overlay" style="display:none">
        <div class="modal-content modal-wide">
          <div class="modal-header">
            <h2 id="availability-modal-title">Edit availability</h2>
            <button type="button" class="btn btn-icon modal-close" id="close-availability-modal">×</button>
          </div>
          <div class="modal-body">
            <p id="availability-modal-student"></p>
            <p class="config-help" id="availability-modal-status"></p>
            <div class="availability-editor">
              <h3>Weekly recurring availability</h3>
              <div id="weekly-blocks-list" class="weekly-blocks-list"></div>
              <button type="button" class="btn btn-sm btn-secondary" id="add-weekly-block-btn">+ Add weekly block</button>
              <h3>Unavailable dates</h3>
              <div id="unavailable-blocks-list" class="weekly-blocks-list"></div>
              <button type="button" class="btn btn-sm btn-secondary" id="add-unavailable-btn">+ Add unavailable period</button>
              <h3>Scheduler preview</h3>
              <pre class="availability-preview" id="availability-preview-json"></pre>
              <div class="form-group">
                <label class="form-label" for="copy-from-student">Copy from student</label>
                <select class="form-select" id="copy-from-student"><option value="">— Select —</option></select>
                <button type="button" class="btn btn-sm btn-secondary" id="copy-availability-btn">Copy pattern</button>
              </div>
            </div>
            <div id="availability-validation-errors" class="validation-errors" style="display:none"></div>
          </div>
          <div class="modal-footer confirm-dialog-actions">
            <button type="button" class="btn btn-secondary" id="cancel-availability-btn">Cancel</button>
            <button type="button" class="btn btn-secondary" id="unlock-availability-btn">Admin unlock</button>
            <button type="button" class="btn btn-secondary" id="lock-availability-btn">Lock</button>
            <button type="button" class="btn btn-primary" id="save-availability-btn">Save draft</button>
            <button type="button" class="btn btn-success" id="submit-availability-btn">Submit & lock</button>
          </div>
        </div>
      </div>

      <div id="test-dates-edit-modal" class="modal-overlay" style="display:none">
        <div class="modal-content modal-wide">
          <div class="modal-header">
            <h2 id="test-modal-title">Edit test dates</h2>
            <button type="button" class="btn btn-icon modal-close" id="close-test-modal">×</button>
          </div>
          <div class="modal-body">
            <p id="test-modal-student"></p>
            <p class="config-help" id="test-modal-status"></p>
            <div id="test-dates-list" class="weekly-blocks-list"></div>
            <button type="button" class="btn btn-sm btn-secondary" id="add-test-date-btn">+ Add test</button>
            <div id="test-validation-errors" class="validation-errors" style="display:none"></div>
          </div>
          <div class="modal-footer confirm-dialog-actions">
            <button type="button" class="btn btn-secondary" id="cancel-test-btn">Cancel</button>
            <button type="button" class="btn btn-secondary" id="unlock-test-btn">Admin unlock</button>
            <button type="button" class="btn btn-primary" id="save-test-btn">Save draft</button>
            <button type="button" class="btn btn-success" id="submit-test-btn">Submit & lock</button>
          </div>
        </div>
      </div>
    `;

    await this.loadData();
    this.setupEventListeners();
    this.renderStudentsList();
    await this.renderContractsPanel();
  }

  getMonthLabel() {
    const d = new Date(this.app.state.year, this.app.state.month, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  async loadData() {
    try {
      await this.loadStudents();
      this.compliance = await this.app.state.getContractComplianceReport();
    } catch (error) {
      console.error('❌ Failed to load students data:', error);
      this.showError('Failed to load students data');
    }
  }

  async loadStudents() {
    this.students = await this.getStudents();
    this.updateStats();
  }

  renderStudentsList() {
    const studentsList = document.getElementById('students-list');
    const filtered = this.getFilteredStudents();

    if (!filtered.length) {
      studentsList.innerHTML = '<div class="empty-state">No students found</div>';
      return;
    }

    studentsList.innerHTML = filtered.map(student => {
      const row = this.compliance.find(c => String(c.studentId) === String(student.id));
      const status = row?.status || 'unknown';
      return `
      <div class="student-card" data-student-id="${student.id}">
        <div class="student-header">
          <div class="student-avatar" style="background-color: ${student.color}">${student.name.charAt(0).toUpperCase()}</div>
          <div class="student-info">
            <div class="student-name">${this.escapeHtml(student.name)}</div>
            <div class="student-id">ID: ${student.id} · ${student.contractType || 'custom'}</div>
          </div>
          <span class="contract-badge contract-${status}">${ContractManager.statusLabel(status)}</span>
        </div>
        <div class="student-content">
          <div class="student-details">
            <div class="detail-item"><span class="detail-label">Contract:</span><span class="detail-value">${student.contracted_monthly_hours || 72}h/mo</span></div>
            <div class="detail-item"><span class="detail-label">Assigned (mo):</span><span class="detail-value">${row?.assigned ?? '—'}h</span></div>
            <div class="detail-item"><span class="detail-label">Max weekly:</span><span class="detail-value">${student.weekly_max_hours || 18}h</span></div>
          </div>
          <div class="student-availability">${this.renderAvailabilityGrid(student.availability)}</div>
        </div>
        <div class="student-actions">
          <button type="button" class="btn btn-sm btn-primary edit-contract-btn" data-id="${student.id}">Edit contract</button>
          <button type="button" class="btn btn-sm btn-secondary edit-availability-btn" data-id="${student.id}">Availability</button>
          <button type="button" class="btn btn-sm btn-secondary view-sched-btn" data-id="${student.id}">Schedule</button>
          <button type="button" class="btn btn-sm btn-danger delete-student-btn" data-id="${student.id}">Delete</button>
        </div>
      </div>`;
    }).join('');

    studentsList.querySelectorAll('.edit-contract-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openContractModal(btn.dataset.id));
    });
    studentsList.querySelectorAll('.edit-availability-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openAvailabilityModal(btn.dataset.id));
    });
    studentsList.querySelectorAll('.view-sched-btn').forEach(btn => {
      btn.addEventListener('click', () => this.viewSchedule(btn.dataset.id));
    });
    studentsList.querySelectorAll('.delete-student-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteStudent(btn.dataset.id));
    });
  }

  async renderContractsPanel() {
    this.compliance = await this.app.state.getContractComplianceReport();
    const tbody = document.getElementById('contract-table-body');
    const filtered = this.getFilteredCompliance();

    tbody.innerHTML = filtered.map(row => `
      <tr>
        <td><span class="sq" style="background:${row.color}"></span> ${this.escapeHtml(row.name)}</td>
        <td>${row.contracted}h <span class="tag">${row.contractType}</span></td>
        <td>${row.assigned}h</td>
        <td>${row.remaining}h</td>
        <td>${row.pct}%</td>
        <td><span class="contract-badge contract-${row.status}">${row.statusLabel}</span></td>
        <td><button type="button" class="btn btn-sm btn-secondary edit-contract-btn" data-id="${row.studentId}">Edit</button></td>
      </tr>
    `).join('') || '<tr><td colspan="7">No students loaded</td></tr>';

    tbody.querySelectorAll('.edit-contract-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openContractModal(btn.dataset.id));
    });

    const histEl = document.getElementById('contract-history-list');
    const history = (this.app.state.contractHistory || []).slice(0, 15);
    histEl.innerHTML = history.length
      ? history.map(h => `
          <div class="contract-history-item">
            <strong>${this.escapeHtml(h.studentName)}</strong>
            ${h.before != null ? `${h.before}h → ` : ''}${h.after}h (${h.contractType})
            <span class="config-help">${new Date(h.changedAt).toLocaleString()} — ${this.escapeHtml(h.note || '')}</span>
          </div>`).join('')
      : '<div class="empty-state-sm">No contract changes logged yet</div>';

    this.updateStats();
  }

  getFilteredCompliance() {
    const cf = this.currentContractFilter || 'all';
    if (cf === 'all') return this.compliance;
    return this.compliance.filter(r => r.status === cf);
  }

  renderAvailabilityGrid(availability) {
    if (!availability) return '<div class="no-availability">No availability set</div>';
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const grid = StudentData.availabilityGridSlots(availability);
    const summary = days.map(d => {
      const n = (grid[d] || []).length;
      return n ? `${d}: ${n} slots` : null;
    }).filter(Boolean);
    return summary.length ? summary.join(' · ') : 'No weekday availability';
  }

  getFilteredStudents() {
    switch (this.currentFilter) {
      case 'active': return this.students.filter(s => s.status === 'active');
      case 'inactive': return this.students.filter(s => s.status === 'inactive');
      case 'over-cap': return this.students.filter(s => (s.weeklyHours || 0) > (s.weekly_max_hours || 18));
      default: return this.students;
    }
  }

  updateStats() {
    const total = this.students.length;
    const active = this.students.filter(s => s.status === 'active').length;
    const under = this.compliance.filter(r => r.status === 'under-filled' || r.status === 'at-risk').length;
    document.getElementById('total-students').textContent = total;
    document.getElementById('active-students').textContent = active;
    const underEl = document.getElementById('under-contract-count');
    if (underEl) underEl.textContent = under;
  }

  setupEventListeners() {
    document.querySelectorAll('#student-filters .filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('#student-filters .filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentFilter = e.target.dataset.filter;
        this.renderStudentsList();
      });
    });

    document.querySelectorAll('#contract-filters .filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('#contract-filters .filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentContractFilter = e.target.dataset.cfilter;
        this.renderContractsPanel();
      });
    });

    document.querySelectorAll('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    document.querySelectorAll('.contract-template-btn').forEach(btn => {
      btn.addEventListener('click', () => this.applyTemplateToAll(btn.dataset.template));
    });

    document.getElementById('add-student-btn').addEventListener('click', () => this.showAddStudentModal());
    document.getElementById('load-sample-btn').addEventListener('click', () => this.loadSample());
    document.getElementById('import-csv-btn').addEventListener('click', () => this.showImportCSVModal());
    document.getElementById('export-csv-btn').addEventListener('click', () => this.exportCSV());
    document.getElementById('export-compliance-btn')?.addEventListener('click', () => this.exportComplianceCSV());
    document.getElementById('export-availability-btn')?.addEventListener('click', () => this.exportAvailabilityCSV());
    document.getElementById('export-test-dates-btn')?.addEventListener('click', () => this.exportTestDatesCSV());
    document.getElementById('refresh-ledger-btn')?.addEventListener('click', () => this.renderHoursLedgerPanel());
    document.getElementById('export-ledger-btn')?.addEventListener('click', () => this.exportLedgerCSV());
    document.getElementById('ledger-student-select')?.addEventListener('change', () => this.renderLedgerDetail());
    document.getElementById('ledger-stud-source')?.addEventListener('change', (e) =>
      this.onLedgerStudSourceChange(e.target.value));
    document.getElementById('grant-all-availability-btn')?.addEventListener('click', () => this.grantAllAvailability());

    document.getElementById('close-availability-modal')?.addEventListener('click', () => this.closeAvailabilityModal());
    document.getElementById('cancel-availability-btn')?.addEventListener('click', () => this.closeAvailabilityModal());
    document.getElementById('save-availability-btn')?.addEventListener('click', () => this.saveAvailabilityFromModal());
    document.getElementById('submit-availability-btn')?.addEventListener('click', () => this.submitAvailabilityFromModal());
    document.getElementById('unlock-availability-btn')?.addEventListener('click', () => this.unlockAvailabilityFromModal());
    document.getElementById('lock-availability-btn')?.addEventListener('click', () => this.lockAvailabilityFromModal());
    document.getElementById('add-weekly-block-btn')?.addEventListener('click', () => this.addWeeklyBlockRow());
    document.getElementById('add-unavailable-btn')?.addEventListener('click', () => this.addUnavailableRow());
    document.getElementById('copy-availability-btn')?.addEventListener('click', () => this.copyAvailabilityFromModal());
    document.getElementById('availability-edit-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'availability-edit-modal') this.closeAvailabilityModal();
    });

    document.getElementById('close-contract-modal')?.addEventListener('click', () => this.closeContractModal());
    document.getElementById('cancel-contract-btn')?.addEventListener('click', () => this.closeContractModal());
    document.getElementById('save-contract-btn')?.addEventListener('click', () => this.saveContractFromModal());
    document.getElementById('contract-edit-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'contract-edit-modal') this.closeContractModal();
    });

    document.querySelectorAll('.contract-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('contract-hours-input').value = btn.dataset.hours;
        this._pendingContractType = btn.dataset.type;
      });
    });

    document.getElementById('close-add-student-modal')?.addEventListener('click', () => this.closeAddStudentModal());
    document.getElementById('cancel-add-student-btn')?.addEventListener('click', () => this.closeAddStudentModal());
    document.getElementById('save-add-student-btn')?.addEventListener('click', () => this.saveAddStudentFromModal());
    document.getElementById('add-student-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'add-student-modal') this.closeAddStudentModal();
    });
    document.querySelectorAll('.new-student-contract-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('new-student-monthly').value = btn.dataset.hours;
      });
    });

    document.getElementById('close-test-modal')?.addEventListener('click', () => this.closeTestModal());
    document.getElementById('cancel-test-btn')?.addEventListener('click', () => this.closeTestModal());
    document.getElementById('save-test-btn')?.addEventListener('click', () => this.saveTestDatesFromModal());
    document.getElementById('submit-test-btn')?.addEventListener('click', () => this.submitTestDatesFromModal());
    document.getElementById('unlock-test-btn')?.addEventListener('click', () => this.unlockTestDatesFromModal());
    document.getElementById('add-test-date-btn')?.addEventListener('click', () => this.addTestDateRow());
    document.getElementById('test-dates-edit-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'test-dates-edit-modal') this.closeTestModal();
    });
  }

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.view-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.getElementById('students-panel').style.display = tab === 'students' ? '' : 'none';
    document.getElementById('contracts-panel').style.display = tab === 'contracts' ? '' : 'none';
    document.getElementById('availability-panel').style.display = tab === 'availability' ? '' : 'none';
    document.getElementById('tests-panel').style.display = tab === 'tests' ? '' : 'none';
    document.getElementById('ledger-panel').style.display = tab === 'ledger' ? '' : 'none';
    document.getElementById('student-filters').style.display = tab === 'students' ? '' : 'none';
    document.getElementById('contract-filters').style.display = tab === 'contracts' ? '' : 'none';
    if (tab === 'contracts') this.renderContractsPanel();
    if (tab === 'availability') this.renderAvailabilityPanel();
    if (tab === 'tests') this.renderTestsPanel();
    if (tab === 'ledger') this.renderHoursLedgerPanel();
  }

  _pendingContractType = 'custom';
  _editContractStudentId = null;

  openContractModal(studentId) {
    const student = this.students.find(s => String(s.id) === String(studentId));
    if (!student) return;
    this._editContractStudentId = student.id;
    this._pendingContractType = student.contractType || 'custom';
    document.getElementById('contract-modal-student').textContent =
      `${student.name} — current: ${student.contracted_monthly_hours}h/month`;
    document.getElementById('contract-hours-input').value = student.contracted_monthly_hours;
    document.getElementById('contract-note-input').value = '';
    document.getElementById('contract-edit-modal').style.display = 'flex';
  }

  closeContractModal() {
    document.getElementById('contract-edit-modal').style.display = 'none';
    this._editContractStudentId = null;
  }

  async saveContractFromModal() {
    try {
      const hours = document.getElementById('contract-hours-input').value;
      const note = document.getElementById('contract-note-input').value;
      await this.app.state.setStudentContract(
        this._editContractStudentId,
        hours,
        this._pendingContractType,
        note
      );
      await this.loadData();
      this.renderStudentsList();
      await this.renderContractsPanel();
      this.closeContractModal();
      window.app.showToast('Contract updated', 'success');
    } catch (err) {
      window.app.showToast(err.message || 'Failed to update contract', 'error');
    }
  }

  async applyTemplateToAll(templateId) {
    const tpl = ContractManager.templateById(templateId);
    const ok = await window.app.confirmDialog(
      `Apply "${tpl.name}" (${tpl.hours}h/month) to all ${this.students.length} students?`,
      { title: 'Apply contract template', confirmLabel: 'Apply', danger: true }
    );
    if (!ok) return;
    try {
      await this.app.state.applyContractTemplate(templateId);
      await this.loadData();
      this.renderStudentsList();
      await this.renderContractsPanel();
      window.app.showToast(`Applied ${tpl.name} to all students`, 'success');
    } catch (err) {
      window.app.showToast(err.message || 'Template apply failed', 'error');
    }
  }

  showAddStudentModal() {
    document.getElementById('new-student-name').value = '';
    document.getElementById('new-student-weekly').value = '18';
    document.getElementById('new-student-monthly').value = '72';
    document.getElementById('add-student-modal').style.display = 'flex';
    document.getElementById('new-student-name').focus();
  }

  closeAddStudentModal() {
    document.getElementById('add-student-modal').style.display = 'none';
  }

  async saveAddStudentFromModal() {
    try {
      const name = document.getElementById('new-student-name').value.trim();
      const weeklyMaxHours = document.getElementById('new-student-weekly').value;
      const contractedMonthlyHours = document.getElementById('new-student-monthly').value;
      const student = await this.app.state.addStudent({ name, weeklyMaxHours, contractedMonthlyHours });
      await this.loadData();
      this.renderStudentsList();
      this.closeAddStudentModal();
      window.app.showToast(`${student.name} added — open Availability tab to enter their hours`, 'success');
    } catch (err) {
      window.app.showToast(err.message || 'Failed to add student', 'error');
    }
  }

  showImportCSVModal() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const result = await this.app.state.importCSV(await file.text());
        await this.loadData();
        this.renderStudentsList();
        window.app.showToast(`Imported ${result.students.length} students`, 'success');
      } catch (error) {
        window.app.showToast('Failed to import CSV', 'error');
      }
    });
    input.click();
  }

  async loadSample() {
    try {
      await this.app.state.loadSample();
      await this.loadData();
      this.renderStudentsList();
      window.app.showToast(`Loaded ${this.students.length} sample students`, 'success');
    } catch (error) {
      window.app.showToast('Failed to load sample data', 'error');
    }
  }

  async exportCSV() {
    try {
      const header = 'id,name,weekly_max_hours,contracted_monthly_hours,color,availability';
      const rows = this.students.map(s => {
        const avail = JSON.stringify(s.availability || {}).replace(/"/g, '""');
        return [s.id, s.name, s.weekly_max_hours, s.contracted_monthly_hours, s.color, `"${avail}"`].join(',');
      });
      SchedulerExport.downloadFile([header, ...rows].join('\n'), 'students.csv', 'text/csv;charset=utf-8;');
      window.app.showToast('Students exported to CSV', 'success');
    } catch (error) {
      window.app.showToast('Failed to export CSV', 'error');
    }
  }

  exportComplianceCSV() {
    if (!this.compliance.length) {
      window.app.showToast('No compliance data — load students and generate schedule first', 'warning');
      return;
    }
    const y = this.app.state.year;
    const m = String(this.app.state.month + 1).padStart(2, '0');
    SchedulerExport.exportComplianceCSV(this.compliance, { filename: `compliance-${y}-${m}.csv` });
    window.app.showToast('Compliance report exported', 'success');
  }

  exportAvailabilityCSV() {
    const csv = AvailabilityManager.exportAvailabilityCsv(
      this.students,
      this.app.state.availabilityAccess
    );
    SchedulerExport.downloadFile(csv, 'availability-export.csv', 'text/csv;charset=utf-8;');
    window.app.showToast('Availability exported', 'success');
  }

  async grantAllAvailability() {
    const ok = await window.app.confirmDialog('Grant edit access to all students?', {
      title: 'Grant availability access',
      confirmLabel: 'Grant all'
    });
    if (!ok) return;
    await this.app.state.bulkGrantAvailabilityAccess(true);
    await this.renderAvailabilityPanel();
    window.app.showToast('Edit access granted to all students', 'success');
  }

  async renderAvailabilityPanel() {
    const report = this.app.state.getAvailabilityStatusReport();
    const statsEl = document.getElementById('availability-stats');
    const draft = report.filter(r => r.access.status === 'draft').length;
    const submitted = report.filter(r => r.access.status === 'submitted').length;
    const locked = report.filter(r => r.access.status === 'locked').length;

    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat-item"><span class="stat-label">Draft:</span><span class="stat-value">${draft}</span></div>
        <div class="stat-item"><span class="stat-label">Submitted:</span><span class="stat-value">${submitted}</span></div>
        <div class="stat-item"><span class="stat-label">Locked:</span><span class="stat-value">${locked}</span></div>`;
    }

    const tbody = document.getElementById('availability-table-body');
    if (!tbody) return;
    tbody.innerHTML = report.map(row => `
      <tr>
        <td>${row.icon}</td>
        <td><span class="sq" style="background:${row.color}"></span> ${this.escapeHtml(row.name)}</td>
        <td>${row.statusLabel}</td>
        <td>${row.weeklyBlocks}</td>
        <td>${row.unavailableBlocks}</td>
        <td>${row.access.submittedAt ? new Date(row.access.submittedAt).toLocaleDateString() : '—'}</td>
        <td>
          <button type="button" class="btn btn-sm btn-secondary edit-avail-row-btn" data-id="${row.studentId}">Edit</button>
          ${row.access.canEdit ? '' : `<button type="button" class="btn btn-sm btn-secondary unlock-avail-row-btn" data-id="${row.studentId}">Unlock</button>`}
        </td>
      </tr>`).join('') || '<tr><td colspan="7">No students loaded</td></tr>';

    tbody.querySelectorAll('.edit-avail-row-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openAvailabilityModal(btn.dataset.id));
    });
    tbody.querySelectorAll('.unlock-avail-row-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await this.app.state.unlockStudentAvailability(btn.dataset.id);
        await this.renderAvailabilityPanel();
        window.app.showToast('Availability unlocked', 'success');
      });
    });
  }

  _editAvailabilityStudentId = null;
  _draftAvailability = { weekly: [], unavailable_dates: [] };

  openAvailabilityModal(studentId) {
    const student = this.students.find(s => String(s.id) === String(studentId));
    if (!student) return;
    this._editAvailabilityStudentId = student.id;
    this._draftAvailability = AvailabilityManager.normalizeAvailability(student.availability);

    const access = this.app.state.getAvailabilityAccess(student.id);
    document.getElementById('availability-modal-student').textContent = student.name;
    document.getElementById('availability-modal-status').textContent =
      `${AvailabilityManager.statusIcon(access)} ${AvailabilityManager.statusLabel(access)}` +
      (access.submittedAt ? ` · submitted ${new Date(access.submittedAt).toLocaleString()}` : '');

    const copySelect = document.getElementById('copy-from-student');
    copySelect.innerHTML = '<option value="">— Select —</option>' +
      this.students.filter(s => String(s.id) !== String(studentId))
        .map(s => `<option value="${s.id}">${this.escapeHtml(s.name)}</option>`).join('');

    this.renderAvailabilityEditorRows();
    document.getElementById('availability-edit-modal').style.display = 'flex';
  }

  closeAvailabilityModal() {
    document.getElementById('availability-edit-modal').style.display = 'none';
    this._editAvailabilityStudentId = null;
    document.getElementById('availability-validation-errors').style.display = 'none';
  }

  renderAvailabilityEditorRows() {
    const weeklyEl = document.getElementById('weekly-blocks-list');
    const unavailEl = document.getElementById('unavailable-blocks-list');

    weeklyEl.innerHTML = (this._draftAvailability.weekly.length ? this._draftAvailability.weekly : [{ day: 'Mon', start: '09:00', end: '17:00', label: '' }])
      .map((block, i) => {
        const dayOpts = AvailabilityManager.DAYS.map(d =>
          `<option value="${d}"${d === block.day ? ' selected' : ''}>${d}</option>`
        ).join('');
        return `
        <div class="avail-block-row" data-weekly-index="${i}">
          <select class="form-select avail-day">${dayOpts}</select>
          <input type="time" class="form-input avail-start" value="${block.start}">
          <input type="time" class="form-input avail-end" value="${block.end}">
          <input type="text" class="form-input avail-label" placeholder="Label (optional)" value="${this.escapeHtml(block.label || '')}">
          <button type="button" class="btn btn-sm btn-danger remove-weekly-btn" data-index="${i}">×</button>
        </div>`;
      }).join('');

    unavailEl.innerHTML = (this._draftAvailability.unavailable_dates || []).map((block, i) => `
      <div class="avail-block-row" data-unavail-index="${i}">
        <input type="date" class="form-input avail-date" value="${block.date || ''}">
        <input type="time" class="form-input avail-start" value="${block.start || '09:00'}">
        <input type="time" class="form-input avail-end" value="${block.end || '12:00'}">
        <input type="text" class="form-input avail-reason" placeholder="Reason" value="${this.escapeHtml(block.reason || '')}">
        <button type="button" class="btn btn-sm btn-danger remove-unavail-btn" data-index="${i}">×</button>
      </div>`).join('') || '<div class="empty-state-sm">No one-off unavailable periods</div>';

    weeklyEl.querySelectorAll('.remove-weekly-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.collectAvailabilityFromForm();
        this._draftAvailability.weekly.splice(Number(btn.dataset.index), 1);
        this.renderAvailabilityEditorRows();
      });
    });
    unavailEl.querySelectorAll('.remove-unavail-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.collectAvailabilityFromForm();
        this._draftAvailability.unavailable_dates.splice(Number(btn.dataset.index), 1);
        this.renderAvailabilityEditorRows();
      });
    });

    this.updateAvailabilityPreview();
  }

  collectAvailabilityFromForm() {
    const weekly = [];
    document.querySelectorAll('#weekly-blocks-list .avail-block-row').forEach(row => {
      weekly.push({
        day: row.querySelector('.avail-day').value,
        start: row.querySelector('.avail-start').value,
        end: row.querySelector('.avail-end').value,
        label: row.querySelector('.avail-label').value
      });
    });
    const unavailable_dates = [];
    document.querySelectorAll('#unavailable-blocks-list .avail-block-row').forEach(row => {
      unavailable_dates.push({
        date: row.querySelector('.avail-date').value,
        start: row.querySelector('.avail-start').value,
        end: row.querySelector('.avail-end').value,
        reason: row.querySelector('.avail-reason').value
      });
    });
    this._draftAvailability = { weekly, unavailable_dates };
    return this._draftAvailability;
  }

  updateAvailabilityPreview() {
    const data = this.collectAvailabilityFromForm();
    const normalized = AvailabilityManager.convertToSchedulerFormat(data);
    document.getElementById('availability-preview-json').textContent =
      JSON.stringify(normalized, null, 2);
    const result = AvailabilityManager.validate(normalized);
    const errEl = document.getElementById('availability-validation-errors');
    if (result.errors.length) {
      errEl.style.display = 'block';
      errEl.innerHTML = result.errors.map(e => `<div>${this.escapeHtml(e)}</div>`).join('');
    } else {
      errEl.style.display = 'none';
      errEl.innerHTML = '';
    }
  }

  addWeeklyBlockRow() {
    this.collectAvailabilityFromForm();
    this._draftAvailability.weekly.push({ day: 'Mon', start: '09:00', end: '17:00', label: '' });
    this.renderAvailabilityEditorRows();
  }

  addUnavailableRow() {
    this.collectAvailabilityFromForm();
    this._draftAvailability.unavailable_dates.push({
      date: SchedulerUtils.localDateStr(new Date()),
      start: '09:00',
      end: '12:00',
      reason: ''
    });
    this.renderAvailabilityEditorRows();
  }

  async copyAvailabilityFromModal() {
    const fromId = document.getElementById('copy-from-student').value;
    if (!fromId || !this._editAvailabilityStudentId) return;
    try {
      await this.app.state.copyAvailabilityFrom(fromId, this._editAvailabilityStudentId);
      await this.loadStudents();
      const student = this.students.find(s => String(s.id) === String(this._editAvailabilityStudentId));
      this._draftAvailability = AvailabilityManager.normalizeAvailability(student.availability);
      this.renderAvailabilityEditorRows();
      window.app.showToast('Availability pattern copied', 'success');
    } catch (err) {
      window.app.showToast(err.message || 'Copy failed', 'error');
    }
  }

  async saveAvailabilityFromModal() {
    try {
      this.collectAvailabilityFromForm();
      await this.app.state.updateStudentAvailability(this._editAvailabilityStudentId, this._draftAvailability);
      await this.loadStudents();
      this.renderStudentsList();
      await this.renderAvailabilityPanel();
      this.updateAvailabilityPreview();
      window.app.showToast('Availability saved as draft', 'success');
    } catch (err) {
      window.app.showToast(err.message || 'Save failed', 'error');
    }
  }

  async submitAvailabilityFromModal() {
    try {
      this.collectAvailabilityFromForm();
      await this.app.state.updateStudentAvailability(this._editAvailabilityStudentId, this._draftAvailability);
      await this.app.state.submitStudentAvailability(this._editAvailabilityStudentId);
      await this.app.state.lockStudentAvailability(this._editAvailabilityStudentId);
      await this.loadStudents();
      this.renderStudentsList();
      await this.renderAvailabilityPanel();
      this.closeAvailabilityModal();
      window.app.showToast('Availability submitted and locked', 'success');
    } catch (err) {
      window.app.showToast(err.message || 'Submit failed', 'error');
    }
  }

  async unlockAvailabilityFromModal() {
    try {
      await this.app.state.unlockStudentAvailability(this._editAvailabilityStudentId);
      await this.renderAvailabilityPanel();
      const access = this.app.state.getAvailabilityAccess(this._editAvailabilityStudentId);
      document.getElementById('availability-modal-status').textContent =
        `${AvailabilityManager.statusIcon(access)} ${AvailabilityManager.statusLabel(access)}`;
      window.app.showToast('Availability unlocked for editing', 'success');
    } catch (err) {
      window.app.showToast(err.message || 'Unlock failed', 'error');
    }
  }

  async lockAvailabilityFromModal() {
    try {
      await this.app.state.lockStudentAvailability(this._editAvailabilityStudentId);
      await this.renderAvailabilityPanel();
      this.closeAvailabilityModal();
      window.app.showToast('Availability locked', 'success');
    } catch (err) {
      window.app.showToast(err.message || 'Lock failed', 'error');
    }
  }

  async renderTestsPanel() {
    const report = this.app.state.getTestDateStatusReport();
    const active = this.app.state.getActiveAssessmentPeriod();
    const upcoming = AssessmentManager.getUpcomingPeriod(this.app.state.assessmentPeriods);
    const labelEl = document.getElementById('active-assessment-label');
    if (labelEl) {
      labelEl.textContent = active
        ? `Active: ${active.name} (${active.startDate} → ${active.endDate})`
        : upcoming
          ? `Next: ${upcoming.name} starts ${upcoming.startDate}`
          : 'No assessment period configured — add one in Settings';
    }

    const tbody = document.getElementById('tests-table-body');
    if (!tbody) return;
    tbody.innerHTML = report.map(row => `
      <tr>
        <td>${row.icon}</td>
        <td><span class="sq" style="background:${row.color}"></span> ${this.escapeHtml(row.name)}</td>
        <td>${row.statusLabel}</td>
        <td>${row.testCount}</td>
        <td>${row.access.submittedAt ? new Date(row.access.submittedAt).toLocaleDateString() : '—'}</td>
        <td><button type="button" class="btn btn-sm btn-secondary edit-test-row-btn" data-id="${row.studentId}">Edit</button></td>
      </tr>`).join('') || '<tr><td colspan="6">No students loaded</td></tr>';

    tbody.querySelectorAll('.edit-test-row-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openTestModal(btn.dataset.id));
    });
  }

  _editTestStudentId = null;
  _draftTestDates = [];

  openTestModal(studentId) {
    const student = this.students.find(s => String(s.id) === String(studentId));
    if (!student) return;
    this._editTestStudentId = student.id;
    this._draftTestDates = (student.testDates || []).map(t => ({ ...t }));

    const access = this.app.state.getTestDateAccess(student.id);
    document.getElementById('test-modal-student').textContent = student.name;
    document.getElementById('test-modal-status').textContent =
      `${AssessmentManager.statusIcon(access)} ${AssessmentManager.statusLabel(access)}`;
    this.renderTestEditorRows();
    document.getElementById('test-dates-edit-modal').style.display = 'flex';
  }

  closeTestModal() {
    document.getElementById('test-dates-edit-modal').style.display = 'none';
    this._editTestStudentId = null;
  }

  renderTestEditorRows() {
    const el = document.getElementById('test-dates-list');
    const rows = this._draftTestDates.length ? this._draftTestDates : [{
      date: SchedulerUtils.localDateStr(new Date()),
      start: '09:00',
      end: '12:00',
      subject: '',
      description: ''
    }];
    el.innerHTML = rows.map((t, i) => `
      <div class="avail-block-row" data-test-index="${i}">
        <input type="date" class="form-input test-date" value="${t.date || ''}">
        <input type="time" class="form-input test-start" value="${t.start || '09:00'}">
        <input type="time" class="form-input test-end" value="${t.end || '12:00'}">
        <input type="text" class="form-input test-subject" placeholder="Subject" value="${this.escapeHtml(t.subject || '')}">
        <button type="button" class="btn btn-sm btn-danger remove-test-btn" data-index="${i}">×</button>
      </div>`).join('');

    el.querySelectorAll('.remove-test-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.collectTestDatesFromForm();
        this._draftTestDates.splice(Number(btn.dataset.index), 1);
        this.renderTestEditorRows();
      });
    });
    this.validateTestForm();
  }

  collectTestDatesFromForm() {
    const tests = [];
    document.querySelectorAll('#test-dates-list .avail-block-row').forEach(row => {
      tests.push({
        id: String(Date.now() + tests.length),
        date: row.querySelector('.test-date').value,
        start: row.querySelector('.test-start').value,
        end: row.querySelector('.test-end').value,
        subject: row.querySelector('.test-subject').value,
        description: ''
      });
    });
    this._draftTestDates = tests;
    return tests;
  }

  validateTestForm() {
    this.collectTestDatesFromForm();
    const period = this.app.state.getActiveAssessmentPeriod() ||
      AssessmentManager.getUpcomingPeriod(this.app.state.assessmentPeriods);
    const result = AssessmentManager.validateTestDates(this._draftTestDates, period);
    const errEl = document.getElementById('test-validation-errors');
    if (result.errors.length) {
      errEl.style.display = 'block';
      errEl.innerHTML = result.errors.map(e => `<div>${this.escapeHtml(e)}</div>`).join('');
    } else {
      errEl.style.display = 'none';
      errEl.innerHTML = '';
    }
  }

  addTestDateRow() {
    this.collectTestDatesFromForm();
    this._draftTestDates.push({
      id: String(Date.now()),
      date: SchedulerUtils.localDateStr(new Date()),
      start: '09:00',
      end: '12:00',
      subject: '',
      description: ''
    });
    this.renderTestEditorRows();
  }

  async saveTestDatesFromModal() {
    try {
      this.collectTestDatesFromForm();
      await this.app.state.updateStudentTestDates(this._editTestStudentId, this._draftTestDates);
      await this.loadStudents();
      await this.renderTestsPanel();
      window.app.showToast('Test dates saved', 'success');
    } catch (err) {
      window.app.showToast(err.message || 'Save failed', 'error');
    }
  }

  async submitTestDatesFromModal() {
    try {
      this.collectTestDatesFromForm();
      await this.app.state.updateStudentTestDates(this._editTestStudentId, this._draftTestDates);
      await this.app.state.submitStudentTestDates(this._editTestStudentId);
      await this.app.state.lockStudentTestDates(this._editTestStudentId);
      await this.loadStudents();
      await this.renderTestsPanel();
      this.closeTestModal();
      window.app.showToast('Test dates submitted and locked', 'success');
    } catch (err) {
      window.app.showToast(err.message || 'Submit failed', 'error');
    }
  }

  async unlockTestDatesFromModal() {
    try {
      await this.app.state.unlockStudentTestDates(this._editTestStudentId);
      await this.renderTestsPanel();
      window.app.showToast('Test dates unlocked', 'success');
    } catch (err) {
      window.app.showToast(err.message || 'Unlock failed', 'error');
    }
  }

  exportTestDatesCSV() {
    const csv = AssessmentManager.exportTestDatesCsv(
      this.students,
      this.app.state.testDateAccess
    );
    SchedulerExport.downloadFile(csv, 'test-dates-export.csv', 'text/csv;charset=utf-8;');
    window.app.showToast('Test dates exported', 'success');
  }

  async viewSchedule(studentId) {
    await window.app.navigateToView('schedule');
    window.app.showToast('Open Schedule view for shift assignments', 'info');
  }

  async deleteStudent(studentId) {
    const student = this.students.find(s => String(s.id) === String(studentId));
    if (!student) return;
    const ok = await window.app.confirmDialog(`Delete ${student.name}?`, {
      title: 'Delete student',
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    this.students = this.students.filter(s => String(s.id) !== String(studentId));
    await this.updateStudents();
    await this.loadData();
    this.renderStudentsList();
    window.app.showToast(`${student.name} deleted`, 'success');
  }

  async updateStudents() {
    await this.app.state.saveStudents(this.students);
  }

  async getStudents() {
    return this.app.state.students;
  }

  escapeHtml(text) {
    // Delegate to canonical quote-safe escaper (Phase 3 / F-04).
    return window.SchedulerUtils.escapeHtml(text);
  }

  getLedgerMonthKey() {
    const y = this.app.state.year;
    const m = this.app.state.month;
    return HoursLedger.monthKey(y, m);
  }

  async onLedgerStudSourceChange(source) {
    try {
      await this.app.state.setLedgerStudSource(source);
      await this.renderHoursLedgerPanel();
      window.app.showToast(
        source === 'clocked' ? 'Stud now uses reconciled clocked hours' : 'Stud now uses assigned schedule hours',
        'success'
      );
    } catch (err) {
      window.app.showToast(err.message || 'Could not change Stud source', 'error');
    }
  }

  renderWorkedHoursControls() {
    const mountEl = document.getElementById('worked-hours-controls');
    if (!mountEl) return;
    mountEl.textContent = '';

    const monthKey = this.getLedgerMonthKey();
    const monthLabel = this.getMonthLabel();

    const heading = document.createElement('p');
    heading.className = 'config-help';
    heading.textContent = `Reconcile month: ${monthKey} (${monthLabel}) — matches Schedule view month.`;

    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.xls,.xlsx';
    file.className = 'worked-hours-file-input';
    file.setAttribute('aria-label', 'Upload VeraLab payroll export');

    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.className = 'worked-hours-status';

    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      status.textContent = 'Reading payroll…';
      try {
        const buf = await f.arrayBuffer();
        const { count, warnings } = await this.app.state.ingestPayrollWorkbook(buf);
        await this.app.state.setLedgerStudSource('clocked');
        const studSelect = document.getElementById('ledger-stud-source');
        if (studSelect) studSelect.value = 'clocked';
        status.textContent =
          `Ingested ${count} row${count === 1 ? '' : 's'}` +
          (warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : '') +
          '. Stud source set to Clocked.';
        await this.renderHoursLedgerPanel();
        window.app.showToast('Payroll imported and ledger refreshed', 'success');
      } catch (err) {
        status.textContent = `Could not import: ${err.message}`;
        window.app.showToast(err.message || 'Payroll import failed', 'error');
      } finally {
        file.value = '';
      }
    });

    mountEl.append(heading, file, status);
  }

  renderReconcileReport(mountEl, report, monthKey) {
    if (!mountEl || !report) return;
    mountEl.textContent = '';

    const wrap = document.createElement('div');
    wrap.className = 'wh-report';

    wrap.appendChild(this.makeWorkedHoursTable(
      'Flagged sessions',
      ['Student', 'Date', 'Flags', 'Worked (min)', 'Uncredited (min)'],
      (report.flaggedSessions || []).map((s) => [
        s.studentName || s.username,
        s.dateISO || '',
        (s.flags || []).join(', '),
        s.workedMinutes == null ? '—' : String(s.workedMinutes),
        String(s.uncreditedMinutes || 0),
      ])
    ));

    const pool = report.uncreditedPool ? report.uncreditedPool.byStudent : {};
    const poolRows = Object.values(pool).filter((p) => p.uncreditedMinutes > 0);
    if (poolRows.length) {
      const table = this.makeWorkedHoursTable(
        'Uncredited pool (UNROSTERED — not in Stud until accepted)',
        ['Student', 'Uncredited (min)', ''],
        poolRows.map((p) => [p.studentName || p.studentId, String(p.uncreditedMinutes), null])
      );
      poolRows.forEach((p, i) => {
        const cell = table.tBodies[0].rows[i].cells[2];
        const accept = document.createElement('button');
        accept.type = 'button';
        accept.className = 'btn btn-sm btn-success';
        accept.textContent = 'Accept';
        accept.addEventListener('click', async () => {
          try {
            await this.app.state.acceptUncredited(p.studentId, monthKey);
            const fresh = await this.app.state.reconcileMonth(monthKey);
            this.renderReconcileReport(mountEl, fresh, monthKey);
            await this.renderHoursLedgerPanel();
            window.app.showToast('Uncredited minutes accepted into Stud', 'success');
          } catch (err) {
            window.app.showToast(err.message || 'Accept failed', 'error');
          }
        });
        const reject = document.createElement('button');
        reject.type = 'button';
        reject.className = 'btn btn-sm btn-secondary';
        reject.textContent = 'Reject';
        reject.addEventListener('click', async () => {
          try {
            await this.app.state.rejectUncredited(p.studentId, monthKey);
            const fresh = await this.app.state.reconcileMonth(monthKey);
            this.renderReconcileReport(mountEl, fresh, monthKey);
            await this.renderHoursLedgerPanel();
            window.app.showToast('Uncredited minutes rejected', 'success');
          } catch (err) {
            window.app.showToast(err.message || 'Reject failed', 'error');
          }
        });
        cell.append(accept, document.createTextNode(' '), reject);
      });
      wrap.appendChild(table);
    }

    const totals = document.createElement('p');
    totals.className = 'config-help';
    totals.textContent =
      `Clocked total: ${report.clockedStud?.totalMinutes ?? 0} min · ` +
      `Flagged: ${report.flaggedSessions?.length ?? 0} · ` +
      `Absences: ${report.absences?.length ?? 0} · ` +
      `Uncredited pool: ${report.uncreditedPool?.totalMinutes ?? 0} min`;
    wrap.appendChild(totals);

    mountEl.appendChild(wrap);
  }

  makeWorkedHoursTable(caption, headers, bodyRows) {
    const table = document.createElement('table');
    table.className = 'summary-table wh-table';
    const cap = document.createElement('caption');
    cap.textContent = caption;
    table.appendChild(cap);
    const thead = table.createTHead();
    const hr = thead.insertRow();
    headers.forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      hr.appendChild(th);
    });
    const tb = table.createTBody();
    bodyRows.forEach((cells) => {
      const tr = tb.insertRow();
      cells.forEach((c) => {
        const td = tr.insertCell();
        if (c !== null) td.textContent = c;
      });
    });
    return table;
  }

  async renderHoursLedgerPanel() {
    try {
      this._ensureHoursLedgerShape();
      const studSelect = document.getElementById('ledger-stud-source');
      if (studSelect) {
        studSelect.value = this.app.state.hoursLedger?.studSource === 'clocked' ? 'clocked' : 'assigned';
      }
      this.renderWorkedHoursControls();

      this._ledgerReports = await this.app.state.getAllHoursLedgerReports();
      const summaryEl = document.getElementById('ledger-summary');
      const studSource = this.app.state.hoursLedger?.studSource || 'assigned';
      const owingWork = this._ledgerReports.filter(r => r.termBalance > 0).length;
      const owedPay = this._ledgerReports.filter(r => r.termBalance < 0).length;
      const violations = this._ledgerReports.reduce((n, r) => n + (r.violations?.length || 0), 0);
      summaryEl.innerHTML = `
        <div class="compliance-stat"><span class="stat-label">Stud source</span><span class="stat-value">${studSource === 'clocked' ? 'Clocked' : 'Assigned'}</span></div>
        <div class="compliance-stat"><span class="stat-label">Students</span><span class="stat-value">${this._ledgerReports.length}</span></div>
        <div class="compliance-stat"><span class="stat-label">Owe work (+)</span><span class="stat-value">${owingWork}</span></div>
        <div class="compliance-stat"><span class="stat-label">Owed pay (−)</span><span class="stat-value">${owedPay}</span></div>
        <div class="compliance-stat"><span class="stat-label">Policy violations</span><span class="stat-value">${violations}</span></div>
      `;

      const select = document.getElementById('ledger-student-select');
      select.innerHTML = this._ledgerReports.map(r =>
        `<option value="${this.escapeHtml(String(r.studentId))}">${this.escapeHtml(r.studentName)} (${r.termBalance > 0 ? '+' : ''}${r.termBalance}h — ${r.signLabel})</option>`
      ).join('');
      if (!select.value && this._ledgerReports.length) {
        select.value = String(this._ledgerReports[0].studentId);
      }
      this.renderLedgerDetail();

      if (studSource === 'clocked') {
        const reportEl = document.getElementById('worked-hours-report');
        try {
          const monthKey = this.getLedgerMonthKey();
          const report = await this.app.state.reconcileMonth(monthKey);
          this.renderReconcileReport(reportEl, report, monthKey);
        } catch {
          if (reportEl) reportEl.textContent = '';
        }
      } else {
        const reportEl = document.getElementById('worked-hours-report');
        if (reportEl) reportEl.textContent = '';
      }
    } catch (err) {
      window.app.showToast(err.message || 'Failed to load ledger', 'error');
    }
  }

  renderLedgerDetail() {
    const sid = document.getElementById('ledger-student-select')?.value;
    const report = (this._ledgerReports || []).find(r => String(r.studentId) === String(sid));
    const detailEl = document.getElementById('ledger-detail');
    const suggestEl = document.getElementById('ledger-suggestions');
    if (!report) {
      detailEl.innerHTML = '<div class="empty-state-sm">No ledger data</div>';
      suggestEl.innerHTML = '';
      return;
    }

    detailEl.innerHTML = `
      <table class="summary-table ledger-table">
        <thead>
          <tr>
            <th>Month</th><th>Contract</th><th>Worked</th><th>Claimable</th><th>Claimed</th>
            <th>Δ</th><th>Balance</th><th>Period</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${report.rows.map(r => `
            <tr class="${r.claimValid ? '' : 'ledger-row-error'}">
              <td>${this.escapeHtml(r.monthKey)}</td>
              <td>${r.isPreContract ? '—' : r.contr}</td>
              <td>${r.stud}</td>
              <td>${r.claimable}</td>
              <td>${r.claimed}</td>
              <td>${r.delta > 0 ? '+' : ''}${r.delta}</td>
              <td class="${r.balance > 0 ? 'ledger-owes' : r.balance < 0 ? 'ledger-owed' : ''}">${r.balance > 0 ? '+' : ''}${r.balance}</td>
              <td>${this.escapeHtml(r.period || '')}${r.isPeriodEnd ? ' ◆' : ''}</td>
              <td><button type="button" class="btn btn-sm btn-secondary ledger-claim-btn" data-month="${this.escapeHtml(r.monthKey)}">Claim</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p class="config-help">Term balance (latest month): <strong>${report.termBalance > 0 ? '+' : ''}${report.termBalance}h</strong> — ${report.signLabel}. Stud source: <strong>${this.escapeHtml(report.studSource || 'assigned')}</strong> · Ledger v${this.escapeHtml(report.version || HoursLedger.VERSION)} · Self-check: ${report.selfCheckOk ? '✓' : '✗'}.</p>
    `;

    detailEl.querySelectorAll('.ledger-claim-btn').forEach(btn => {
      btn.addEventListener('click', () => this.editLedgerClaim(report.studentId, btn.dataset.month));
    });

    let suggestHtml = '';
    if (report.violations?.length) {
      suggestHtml += `<div class="validation-errors"><strong>Violations</strong><ul>${report.violations.map(v =>
        `<li>${this.escapeHtml(v.message || v.code)}</li>`).join('')}</ul></div>`;
    }
    if (report.reductionSuggestion) {
      const s = report.reductionSuggestion;
      suggestHtml += `
        <div class="onboarding-panel">
          <h3>Reduced contract suggestion (I10)</h3>
          <p>After ${this.escapeHtml(s.fromPeriod)}: ${s.B0}h work-debt → suggest R=${s.R}h/month over ${s.k} month(s) in ${this.escapeHtml(s.periodName)}.</p>
          <button type="button" class="btn btn-secondary btn-sm" id="approve-reduction-btn">Approve reduced contract</button>
        </div>`;
    }
    suggestEl.innerHTML = suggestHtml;
    document.getElementById('approve-reduction-btn')?.addEventListener('click', () =>
      this.approveReductionPlan(report));
  }

  async editLedgerClaim(studentId, monthKey) {
    const report = (this._ledgerReports || []).find(r => String(r.studentId) === String(studentId));
    const row = report?.rows.find(r => r.monthKey === monthKey);
    if (!row) return;
    const input = prompt(
      `Claim hours for ${monthKey}\nClaimable cap: ${row.claimable}h\nCurrent claimed: ${row.claimed}h`,
      String(row.claimed)
    );
    if (input === null) return;
    try {
      await this.app.state.updateLedgerClaim(studentId, monthKey, input);
      await this.renderHoursLedgerPanel();
      document.getElementById('ledger-student-select').value = String(studentId);
      this.renderLedgerDetail();
      window.app.showToast('Claim updated', 'success');
    } catch (err) {
      window.app.showToast(err.message, 'error');
    }
  }

  async approveReductionPlan(report) {
    const s = report.reductionSuggestion;
    if (!s) return;
    const ok = await window.app.confirmDialog(
      `Approve reduced contract R=${s.R}h/month for ${report.studentName}?\n\nThis clears ${s.B0}h work-debt from ${s.fromPeriod}.`,
      { title: 'Approve reduced contract', confirmLabel: 'Approve' }
    );
    if (!ok) return;
    try {
      const year = this.app.state.year;
      const period = HoursLedger.getPeriods().find(p => p.id === s.periodId);
      const months = [];
      if (period) {
        for (let m = period.startMonth; m <= period.endMonth; m++) {
          months.push(HoursLedger.monthKey(year, m));
        }
      }
      await this.app.state.approveReducedContract(report.studentId, {
        periodId: s.periodId,
        R: s.R,
        B0: s.B0,
        months
      });
      await this.renderHoursLedgerPanel();
      window.app.showToast('Reduced contract approved', 'success');
    } catch (err) {
      window.app.showToast(err.message, 'error');
    }
  }

  _ensureHoursLedgerShape() {
    if (this.app.state._ensureHoursLedgerShape) {
      this.app.state._ensureHoursLedgerShape();
    }
  }

  async exportLedgerCSV() {
    try {
      const reports = this._ledgerReports || await this.app.state.getAllHoursLedgerReports();
      const csv = HoursLedger.exportLedgerCsv(reports);
      SchedulerExport.downloadFile(csv, `hours-ledger-${this.app.state.year}.csv`, 'text/csv;charset=utf-8;');
      window.app.showToast('Ledger exported', 'success');
    } catch (err) {
      window.app.showToast(err.message, 'error');
    }
  }

  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    this.container.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
  }

  destroy() {
    if (this.container) this.container.innerHTML = '';
  }
}

window.StudentsView = StudentsView;
