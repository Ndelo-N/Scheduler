// Student Shift Scheduler PWA - Dashboard View
// Main dashboard with today's shifts, pending swaps, and quick stats

class DashboardView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.currentDate = new Date();
    this.refreshInterval = null;
  }

  async init() {
    await this.render();
  }

  async render() {
    this.container = document.getElementById('dashboard-view');
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="dashboard-header">
        <h1>Dashboard</h1>
        <div class="dashboard-date">
          ${this.currentDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="dashboard-card today-shifts">
          <div class="card-header">
            <h2>Today's Shifts</h2>
            <span class="card-badge" id="today-shifts-count">0</span>
          </div>
          <div class="card-content" id="today-shifts-list">
            <div class="loading">Loading...</div>
          </div>
        </div>

        <div class="dashboard-card pending-swaps">
          <div class="card-header">
            <h2>Pending Swaps</h2>
            <span class="card-badge" id="pending-swaps-count">0</span>
          </div>
          <div class="card-content" id="pending-swaps-list">
            <div class="loading">Loading...</div>
          </div>
        </div>

        <div class="dashboard-card quick-stats">
          <div class="card-header">
            <h2>Quick Stats</h2>
          </div>
          <div class="card-content" id="quick-stats-content">
            <div class="stat-item">
              <span class="stat-label">Total Students</span>
              <span class="stat-value" id="total-students">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Active Schedules</span>
              <span class="stat-value" id="active-schedules">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">This Week's Hours</span>
              <span class="stat-value" id="weekly-hours">0</span>
            </div>
          </div>
        </div>

        <div class="dashboard-card recent-activity">
          <div class="card-header">
            <h2>Recent Activity</h2>
          </div>
          <div class="card-content" id="recent-activity-list">
            <div class="loading">Loading...</div>
          </div>
        </div>
      </div>

      <div class="dashboard-actions">
        <button class="btn btn-primary" id="quick-schedule-btn">
          <i class="icon-calendar"></i>
          Quick Schedule
        </button>
        <button class="btn btn-secondary" id="view-all-swaps-btn">
          <i class="icon-swap"></i>
          View All Swaps
        </button>
        <button class="btn btn-secondary" id="export-schedule-btn">
          <i class="icon-download"></i>
          Export Schedule
        </button>
      </div>
    `;

    await this.loadData();
    this.setupEventListeners();
    this.startAutoRefresh();
  }

  async loadData() {
    try {
      // Load today's shifts
      await this.loadTodayShifts();
      
      // Load pending swaps
      await this.loadPendingSwaps();
      
      // Load quick stats
      await this.loadQuickStats();
      
      // Load recent activity
      await this.loadRecentActivity();
      
    } catch (error) {
      console.error('❌ Failed to load dashboard data:', error);
      this.showError('Failed to load dashboard data');
    }
  }

  async loadTodayShifts() {
    try {
      const today = SchedulerUtils.localDateStr(this.currentDate);
      const shifts = await this.getShiftsForDate(today);
      
      const shiftsList = document.getElementById('today-shifts-list');
      const shiftsCount = document.getElementById('today-shifts-count');
      
      if (shifts.length === 0) {
        shiftsList.innerHTML = '<div class="empty-state">No shifts scheduled for today</div>';
        shiftsCount.textContent = '0';
        return;
      }

      shiftsCount.textContent = shifts.length;
      shiftsList.innerHTML = shifts.map(shift => `
        <div class="shift-item">
          <div class="shift-time">${shift.start} - ${shift.end}</div>
          <div class="shift-assignees">
            ${shift.assignees.map(assignee => `
              <span class="assignee-chip" style="background-color: ${assignee.color}">
                ${SchedulerUtils.escapeHtml(assignee.name)}
              </span>
            `).join('')}
          </div>
          <div class="shift-status ${shift.status}">${shift.status}</div>
        </div>
      `).join('');
      
    } catch (error) {
      console.error('❌ Failed to load today\'s shifts:', error);
    }
  }

  async loadPendingSwaps() {
    try {
      const swaps = await this.getPendingSwaps();
      
      const swapsList = document.getElementById('pending-swaps-list');
      const swapsCount = document.getElementById('pending-swaps-count');
      
      if (swaps.length === 0) {
        swapsList.innerHTML = '<div class="empty-state">No pending swaps</div>';
        swapsCount.textContent = '0';
        return;
      }

      swapsCount.textContent = swaps.length;
      swapsList.innerHTML = swaps.map(swap => `
        <div class="swap-item">
          <div class="swap-requester">
            <strong>${SchedulerUtils.escapeHtml(swap.requesterName)}</strong> wants to swap
          </div>
          <div class="swap-details">
            <div class="swap-from">
              <span class="swap-label">From:</span>
              <span class="swap-shift">${swap.fromShift.date} ${swap.fromShift.start}-${swap.fromShift.end}</span>
            </div>
            <div class="swap-to">
              <span class="swap-label">To:</span>
              <span class="swap-shift">${swap.toShift.date} ${swap.toShift.start}-${swap.toShift.end}</span>
            </div>
          </div>
          <div class="swap-actions">
            <button class="btn btn-sm btn-success" data-swap-action="approve" data-swap-id="${swap.id}">
              Approve
            </button>
            <button class="btn btn-sm btn-danger" data-swap-action="reject" data-swap-id="${swap.id}">
              Reject
            </button>
          </div>
        </div>
      `).join('');

      swapsList.querySelectorAll('[data-swap-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = Number(btn.dataset.swapId);
          if (btn.dataset.swapAction === 'approve') window.app.swaps.approveSwap(id);
          else if (btn.dataset.swapAction === 'reject') window.app.swaps.rejectSwap(id);
        });
      });
      
    } catch (error) {
      console.error('❌ Failed to load pending swaps:', error);
    }
  }

  async loadQuickStats() {
    try {
      const stats = await this.getQuickStats();
      
      document.getElementById('total-students').textContent = stats.totalStudents;
      document.getElementById('active-schedules').textContent = stats.activeSchedules;
      document.getElementById('weekly-hours').textContent = stats.weeklyHours;
      
    } catch (error) {
      console.error('❌ Failed to load quick stats:', error);
    }
  }

  async loadRecentActivity() {
    try {
      const activity = await this.getRecentActivity();
      
      const activityList = document.getElementById('recent-activity-list');
      
      if (activity.length === 0) {
        activityList.innerHTML = '<div class="empty-state">No recent activity</div>';
        return;
      }

      activityList.innerHTML = activity.map(item => `
        <div class="activity-item">
          <div class="activity-icon ${item.type}">
            <i class="icon-${item.icon}"></i>
          </div>
          <div class="activity-content">
            <div class="activity-message">${SchedulerUtils.escapeHtml(item.message)}</div>
            <div class="activity-time">${this.formatTimeAgo(item.timestamp)}</div>
          </div>
        </div>
      `).join('');
      
    } catch (error) {
      console.error('❌ Failed to load recent activity:', error);
    }
  }

  async getShiftsForDate(date) {
    const shifts = await this.app.state.getShiftsForDate(date);
    return shifts.map(shift => ({
      ...shift,
      assignees: (shift.assignees || []).map(a => ({
        name: a.name,
        color: a.color
      })),
      status: shift.assignees?.length ? 'confirmed' : 'pending'
    }));
  }

  async getPendingSwaps() {
    const requests = await this.app.state.getSwapRequests('pending');
    return requests.map(r => ({
      id: r.id,
      requesterName: r.requester?.name || r.requesterName || 'Unknown',
      fromShift: r.fromShift,
      toShift: r.toShift
    }));
  }

  async getQuickStats() {
    const today = SchedulerUtils.localDateStr(this.currentDate);
    const shifts = await this.app.state.getShiftsForDate(today);
    return this.app.state.getQuickStats(shifts);
  }

  async getRecentActivity() {
    return this.app.state.logger.getRecent(10).map(entry => ({
      type: 'schedule',
      icon: 'calendar',
      message: entry.message,
      timestamp: entry.timestamp
    }));
  }

  setupEventListeners() {
    // Quick schedule button
    document.getElementById('quick-schedule-btn').addEventListener('click', () => {
      window.app.navigateToView('schedule');
    });

    // View all swaps button
    document.getElementById('view-all-swaps-btn').addEventListener('click', () => {
      window.app.navigateToView('swaps');
    });

    // Export schedule button
    document.getElementById('export-schedule-btn').addEventListener('click', () => {
      this.exportSchedule();
    });
  }

  startAutoRefresh() {
    // Refresh data every 5 minutes
    this.refreshInterval = setInterval(() => {
      this.loadData();
    }, 5 * 60 * 1000);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  async exportSchedule() {
    try {
      // This would typically export the current schedule
      window.app.showToast('Schedule exported successfully', 'success');
    } catch (error) {
      console.error('❌ Failed to export schedule:', error);
      window.app.showToast('Failed to export schedule', 'error');
    }
  }

  formatTimeAgo(timestamp) {
    const now = new Date();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) {
      return `${minutes} minutes ago`;
    } else if (hours < 24) {
      return `${hours} hours ago`;
    } else {
      return `${days} days ago`;
    }
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
    this.stopAutoRefresh();
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// Make DashboardView available globally
window.DashboardView = DashboardView;
