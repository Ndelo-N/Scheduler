// Student Shift Scheduler PWA - Analytics View
// Reports, charts, and insights for schedule management

class AnalyticsView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.analyticsData = {};
    this.currentPeriod = 'week';
    this.charts = {};
  }

  async init() {
    await this.render();
  }

  async render() {
    this.container = document.getElementById('analytics-view');
    if (!this.container) return;

    if (!this.app.can('view.analytics')) {
      this.container.innerHTML = `
        <div class="access-denied">
          <h2>Analytics</h2>
          <p>Analytics are available to Team-Leads and admins only.</p>
        </div>`;
      return;
    }

    this.container.innerHTML = `
      <div class="analytics-header">
        <h1>Analytics</h1>
        <div class="analytics-controls">
          <select id="period-selector" class="form-select">
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
          <button class="btn btn-secondary" id="refresh-analytics-btn">
            <i class="icon-refresh"></i>
            Refresh
          </button>
        </div>
      </div>

      <div class="analytics-content">
        <div class="analytics-grid">
          <div class="analytics-card overview">
            <div class="card-header">
              <h2>Overview</h2>
            </div>
            <div class="card-content">
              <div class="overview-stats">
                <div class="stat-item">
                  <div class="stat-value" id="total-shifts">0</div>
                  <div class="stat-label">Total Shifts</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value" id="total-hours">0</div>
                  <div class="stat-label">Total Hours</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value" id="avg-hours-per-student">0</div>
                  <div class="stat-label">Avg Hours/Student</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value" id="utilization-rate">0%</div>
                  <div class="stat-label">Utilization Rate</div>
                </div>
              </div>
            </div>
          </div>

          <div class="analytics-card hours-distribution">
            <div class="card-header">
              <h2>Hours Distribution</h2>
            </div>
            <div class="card-content">
              <canvas id="hours-chart" width="400" height="200"></canvas>
            </div>
          </div>

          <div class="analytics-card shift-coverage">
            <div class="card-header">
              <h2>Shift Coverage</h2>
            </div>
            <div class="card-content">
              <canvas id="coverage-chart" width="400" height="200"></canvas>
            </div>
          </div>

          <div class="analytics-card student-performance">
            <div class="card-header">
              <h2>Student Performance</h2>
            </div>
            <div class="card-content">
              <div class="performance-list" id="performance-list">
                <div class="loading">Loading...</div>
              </div>
            </div>
          </div>

          <div class="analytics-card contract-compliance">
            <div class="card-header">
              <h2>Contract Compliance</h2>
              <button type="button" class="btn btn-sm btn-secondary" id="export-compliance-btn">Export CSV</button>
            </div>
            <div class="card-content">
              <div class="compliance-summary-grid" id="compliance-summary-grid">
                <div class="stat-item"><div class="stat-value" id="compliance-on-track">0</div><div class="stat-label">On track</div></div>
                <div class="stat-item"><div class="stat-value" id="compliance-at-risk">0</div><div class="stat-label">At risk</div></div>
                <div class="stat-item"><div class="stat-value" id="compliance-under">0</div><div class="stat-label">Under-filled</div></div>
                <div class="stat-item"><div class="stat-value" id="compliance-over">0</div><div class="stat-label">Over contract</div></div>
                <div class="stat-item"><div class="stat-value" id="compliance-avg-pct">0%</div><div class="stat-label">Avg fill</div></div>
              </div>
              <div class="compliance-mini-table" id="compliance-mini-table"></div>
            </div>
          </div>

          <div class="analytics-card swap-activity">
            <div class="card-header">
              <h2>Swap Activity</h2>
            </div>
            <div class="card-content">
              <div class="swap-stats">
                <div class="stat-item">
                  <div class="stat-value" id="total-swaps">0</div>
                  <div class="stat-label">Total Swaps</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value" id="approved-swaps">0</div>
                  <div class="stat-label">Approved</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value" id="rejected-swaps">0</div>
                  <div class="stat-label">Rejected</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value" id="swap-success-rate">0%</div>
                  <div class="stat-label">Success Rate</div>
                </div>
              </div>
            </div>
          </div>

          <div class="analytics-card trends">
            <div class="card-header">
              <h2>Trends</h2>
            </div>
            <div class="card-content">
              <canvas id="trends-chart" width="400" height="200"></canvas>
            </div>
          </div>
        </div>
      </div>
    `;

    await this.loadData();
    this.setupEventListeners();
    this.renderCharts();
  }

  async loadData() {
    try {
      // Load analytics data
      await this.loadAnalyticsData();
      
    } catch (error) {
      console.error('❌ Failed to load analytics data:', error);
      this.showError('Failed to load analytics data');
    }
  }

  async loadAnalyticsData() {
    try {
      this.analyticsData = await this.getAnalyticsData(this.currentPeriod);
      this.updateOverviewStats();
      this.updateComplianceStats();
      this.updateSwapStats();
      this.renderPerformanceList();
    } catch (error) {
      console.error('❌ Failed to load analytics data:', error);
    }
  }

  updateComplianceStats() {
    const cc = this.analyticsData.contractCompliance || {};
    const summary = cc.summary || {};
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set('compliance-on-track', summary.onTrack || 0);
    set('compliance-at-risk', summary.atRisk || 0);
    set('compliance-under', summary.underFilled || 0);
    set('compliance-over', summary.overContract || 0);
    set('compliance-avg-pct', `${summary.avgPct || 0}%`);

    const tableEl = document.getElementById('compliance-mini-table');
    if (!tableEl) return;
    const rows = (cc.rows || []).slice(0, 8);
    if (!rows.length) {
      tableEl.innerHTML = '<div class="empty-state-sm">Load students and generate a schedule for compliance data</div>';
      return;
    }
    tableEl.innerHTML = `
      <table class="summary-table contract-table">
        <thead><tr><th>Student</th><th>Assigned</th><th>Contract</th><th>%</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><span class="sq" style="background:${r.color}"></span> ${SchedulerUtils.escapeHtml(r.name)}</td>
              <td>${r.assigned}h</td>
              <td>${r.contracted}h</td>
              <td>${r.pct}%</td>
              <td><span class="contract-badge contract-${r.status}">${r.statusLabel}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  updateOverviewStats() {
    const data = this.analyticsData.overview || {};
    
    document.getElementById('total-shifts').textContent = data.totalShifts || 0;
    document.getElementById('total-hours').textContent = data.totalHours || 0;
    document.getElementById('avg-hours-per-student').textContent = data.avgHoursPerStudent || 0;
    document.getElementById('utilization-rate').textContent = `${data.utilizationRate || 0}%`;
  }

  updateSwapStats() {
    const data = this.analyticsData.swaps || {};
    
    document.getElementById('total-swaps').textContent = data.totalSwaps || 0;
    document.getElementById('approved-swaps').textContent = data.approvedSwaps || 0;
    document.getElementById('rejected-swaps').textContent = data.rejectedSwaps || 0;
    document.getElementById('swap-success-rate').textContent = `${data.successRate || 0}%`;
  }

  renderPerformanceList() {
    const performanceList = document.getElementById('performance-list');
    const data = this.analyticsData.studentPerformance || [];
    
    if (data.length === 0) {
      performanceList.innerHTML = '<div class="empty-state">No performance data available</div>';
      return;
    }

    performanceList.innerHTML = data.map(student => `
      <div class="performance-item">
        <div class="student-info">
          <div class="student-avatar" style="background-color: ${student.color}">
            ${SchedulerUtils.escapeHtml(student.name.charAt(0).toUpperCase())}
          </div>
          <div class="student-details">
            <div class="student-name">${SchedulerUtils.escapeHtml(student.name)}</div>
            <div class="student-hours">${student.totalHours}h total</div>
          </div>
        </div>
        <div class="performance-metrics">
          <div class="metric">
            <span class="metric-label">Shifts:</span>
            <span class="metric-value">${student.totalShifts}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Avg/Week:</span>
            <span class="metric-value">${student.avgWeeklyHours}h</span>
          </div>
          <div class="metric">
            <span class="metric-label">Reliability:</span>
            <span class="metric-value ${student.reliability >= 90 ? 'good' : student.reliability >= 70 ? 'fair' : 'poor'}">
              ${student.reliability}%
            </span>
          </div>
        </div>
      </div>
    `).join('');
  }

  renderCharts() {
    // Render hours distribution chart
    this.renderHoursChart();
    
    // Render shift coverage chart
    this.renderCoverageChart();
    
    // Render trends chart
    this.renderTrendsChart();
  }

  renderHoursChart() {
    const canvas = document.getElementById('hours-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const data = this.analyticsData.hoursDistribution || [];

    // Simple bar chart implementation
    const maxValue = Math.max(...data.map(d => d.hours));
    const barWidth = canvas.width / data.length;
    const barHeight = canvas.height - 40;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    data.forEach((item, index) => {
      const barHeight = (item.hours / maxValue) * (canvas.height - 40);
      const x = index * barWidth;
      const y = canvas.height - barHeight - 20;

      // Draw bar
      ctx.fillStyle = item.color || '#3b82f6';
      ctx.fillRect(x + 5, y, barWidth - 10, barHeight);

      // Draw label
      ctx.fillStyle = '#666';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(item.name, x + barWidth / 2, canvas.height - 5);
    });
  }

  renderCoverageChart() {
    const canvas = document.getElementById('coverage-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const data = this.analyticsData.shiftCoverage || [];

    // Simple pie chart implementation
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;

    let currentAngle = 0;
    const total = data.reduce((sum, item) => sum + item.value, 0);

    data.forEach((item, index) => {
      const sliceAngle = (item.value / total) * 2 * Math.PI;

      // Draw slice
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = item.color || `hsl(${index * 60}, 70%, 50%)`;
      ctx.fill();

      // Draw label
      const labelAngle = currentAngle + sliceAngle / 2;
      const labelX = centerX + Math.cos(labelAngle) * (radius + 20);
      const labelY = centerY + Math.sin(labelAngle) * (radius + 20);
      
      ctx.fillStyle = '#333';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(item.label, labelX, labelY);

      currentAngle += sliceAngle;
    });
  }

  renderTrendsChart() {
    const canvas = document.getElementById('trends-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const data = this.analyticsData.trends || [];

    if (data.length === 0) return;

    // Simple line chart implementation
    const padding = 40;
    const chartWidth = canvas.width - 2 * padding;
    const chartHeight = canvas.height - 2 * padding;

    const maxValue = Math.max(...data.map(d => d.value));
    const minValue = Math.min(...data.map(d => d.value));
    const valueRange = maxValue - minValue;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw axes
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();

    // Draw line
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();

    data.forEach((point, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      const y = canvas.height - padding - ((point.value - minValue) / valueRange) * chartHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw points
    ctx.fillStyle = '#3b82f6';
    data.forEach((point, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      const y = canvas.height - padding - ((point.value - minValue) / valueRange) * chartHeight;

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  setupEventListeners() {
    // Period selector
    document.getElementById('period-selector').addEventListener('change', (e) => {
      this.currentPeriod = e.target.value;
      this.loadAnalyticsData();
      this.renderCharts();
    });

    // Refresh button
    document.getElementById('refresh-analytics-btn').addEventListener('click', () => {
      this.refreshData();
    });

    document.getElementById('export-compliance-btn')?.addEventListener('click', () => {
      const rows = this.analyticsData.contractCompliance?.rows || [];
      if (!rows.length) {
        window.app.showToast('No compliance data to export', 'warning');
        return;
      }
      const y = this.app.state.year;
      const m = String(this.app.state.month + 1).padStart(2, '0');
      SchedulerExport.exportComplianceCSV(rows, { filename: `compliance-${y}-${m}.csv` });
      window.app.showToast('Compliance report exported', 'success');
    });
  }

  async refreshData() {
    try {
      window.app.showToast('Refreshing analytics...', 'info');
      await this.loadAnalyticsData();
      this.renderCharts();
      window.app.showToast('Analytics refreshed', 'success');
    } catch (error) {
      console.error('❌ Failed to refresh analytics:', error);
      window.app.showToast('Failed to refresh analytics', 'error');
    }
  }

  async getAnalyticsData(period) {
    const data = await this.app.state.getAnalyticsData(period);
    const shifts = await this.app.state.getShiftsForMonth(this.app.state.year, this.app.state.month);
    data.overview.totalShifts = shifts.length;
    const shiftHours = shifts.reduce((sum, s) => {
      const hrs = (SchedulerUtils.parseTimeStr(s.end) - SchedulerUtils.parseTimeStr(s.start)) / 60;
      return sum + hrs * (s.assignees?.length || 0);
    }, 0);
    if (shiftHours && data.overview.totalHours === 0) {
      data.overview.totalHours = Math.round(shiftHours * 10) / 10;
    }
    const covered = shifts.filter(s => (s.assignees?.length || 0) >= (s.required || 1)).length;
    const uncovered = Math.max(0, shifts.length - covered);
    data.shiftCoverage = [
      { label: 'Covered', value: covered, color: '#10b981' },
      { label: 'Uncovered', value: uncovered, color: '#ef4444' }
    ];
    return data;
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
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// Make AnalyticsView available globally
window.AnalyticsView = AnalyticsView;
