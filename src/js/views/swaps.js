// Student Shift Scheduler PWA - Swaps View
// Handles shift swap requests, approvals, and marketplace

class SwapsView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.swapRequests = [];
    this.swapOffers = [];
    this.currentFilter = 'all';
    this.viewMode = 'requests';
    this._swapModalContext = {};
  }

  async init() {
    await this.render();
  }

  async render() {
    this.container = document.getElementById('swaps-view');
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="swaps-header">
        <h1>Shift Swaps</h1>
        <div class="swaps-actions">
          <button class="btn btn-primary" id="request-swap-btn">
            Post to marketplace
          </button>
          <button class="btn btn-secondary" id="refresh-swaps-btn">
            Refresh
          </button>
        </div>
      </div>

      <div class="view-tabs swaps-tabs">
        <button type="button" class="view-tab active" data-swap-view="requests">Requests</button>
        <button type="button" class="view-tab" data-swap-view="marketplace">Marketplace</button>
      </div>

      <div class="swaps-content">
        <div class="swaps-sidebar">
          <div class="sidebar-section">
            <h3>Filters</h3>
            <div class="filter-list">
              <button class="filter-btn active" data-filter="all">All Requests</button>
              <button class="filter-btn" data-filter="pending">Pending</button>
              <button class="filter-btn" data-filter="approved">Approved</button>
              <button class="filter-btn" data-filter="rejected">Rejected</button>
              <button class="filter-btn" data-filter="my-requests">My Requests</button>
            </div>
          </div>
          
          <div class="sidebar-section">
            <h3>Swap debts</h3>
            <p class="config-help">Recorded when a shift is swapped on the calendar (right-click assignee).</p>
            <div class="debts-list" id="debts-list">
              <div class="empty-state-sm">No outstanding debts</div>
            </div>
          </div>

          <div class="sidebar-section">
            <h3>Quick Stats</h3>
            <div class="stats-list">
              <div class="stat-item">
                <span class="stat-label">Pending:</span>
                <span class="stat-value" id="pending-count">0</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Approved:</span>
                <span class="stat-value" id="approved-count">0</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Rejected:</span>
                <span class="stat-value" id="rejected-count">0</span>
              </div>
            </div>
          </div>
        </div>

        <div class="swaps-main">
          <div class="swaps-list" id="swaps-list">
            <div class="loading">Loading...</div>
          </div>
        </div>
      </div>

      <div id="swap-request-modal" class="modal-overlay" style="display:none">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Post shift to marketplace</h2>
            <button type="button" class="btn btn-icon modal-close" id="close-swap-request-modal">×</button>
          </div>
          <div class="modal-body">
            <p class="config-help">Offer one of your assigned shifts for another student to cover. Approving applies the swap on the schedule and records a debt.</p>
            <div class="form-group">
              <label class="form-label" for="swap-requester-select">Your shift (student)</label>
              <select class="form-select" id="swap-requester-select"></select>
            </div>
            <div class="form-group">
              <label class="form-label" for="swap-shift-select">Shift to cover</label>
              <select class="form-select" id="swap-shift-select"><option value="">Select student first</option></select>
            </div>
            <div class="form-group">
              <label class="form-label" for="swap-reason-input">Reason (optional)</label>
              <input type="text" class="form-input" id="swap-reason-input" placeholder="Exam, illness, etc.">
            </div>
          </div>
          <div class="modal-footer confirm-dialog-actions">
            <button type="button" class="btn btn-secondary" id="cancel-swap-request-btn">Cancel</button>
            <button type="button" class="btn btn-primary" id="submit-swap-request-btn">Post to marketplace</button>
          </div>
        </div>
      </div>

      <div id="swap-offer-modal" class="modal-overlay" style="display:none">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Offer to cover shift</h2>
            <button type="button" class="btn btn-icon modal-close" id="close-swap-offer-modal">×</button>
          </div>
          <div class="modal-body">
            <p class="config-help">Pick a student who can take this marketplace shift.</p>
            <div class="student-picker-list" id="swap-offer-student-list"></div>
          </div>
          <div class="modal-footer confirm-dialog-actions">
            <button type="button" class="btn btn-secondary" id="cancel-swap-offer-btn">Cancel</button>
          </div>
        </div>
      </div>
    `;

    await this.loadData();
    this.setupEventListeners();
    this.renderDebtsPanel();
    this.renderSwapsList();
  }

  async loadData() {
    try {
      // Load swap requests
      await this.loadSwapRequests();
      
      // Load swap offers
      await this.loadSwapOffers();
      
    } catch (error) {
      console.error('❌ Failed to load swaps data:', error);
      this.showError('Failed to load swaps data');
    }
  }

  async loadSwapRequests() {
    try {
      this.swapRequests = await this.getSwapRequests();
      this.updateStats();
    } catch (error) {
      console.error('❌ Failed to load swap requests:', error);
    }
  }

  async loadSwapOffers() {
    try {
      this.swapOffers = await this.getSwapOffers();
    } catch (error) {
      console.error('❌ Failed to load swap offers:', error);
    }
  }

  renderDebtsPanel() {
    const el = document.getElementById('debts-list');
    if (!el) return;

    const debts = this.app.state.swapDebts || [];
    const pending = debts.filter(d => d.status === 'pending');

    if (!pending.length) {
      el.innerHTML = '<div class="empty-state-sm">No outstanding debts</div>';
      return;
    }

    el.innerHTML = pending.map((d, idx) => {
      const realIndex = debts.indexOf(d);
      const from = this.app.state.studentName(d.from);
      const to = this.app.state.studentName(d.to);
      return `
        <div class="debt-item">
          <div class="debt-text"><strong>${this.escapeHtml(from)}</strong> owes <strong>${this.escapeHtml(to)}</strong></div>
          <div class="debt-meta">${this.escapeHtml(d.shift)} · ${d.status}</div>
          <button type="button" class="btn btn-sm btn-secondary" data-settle-index="${realIndex}">Mark settled</button>
        </div>`;
    }).join('');

    el.querySelectorAll('[data-settle-index]').forEach(btn => {
      btn.addEventListener('click', () => this.markDebtSettled(Number(btn.dataset.settleIndex)));
    });
  }

  async refreshDebts() {
    this.renderDebtsPanel();
  }

  async markDebtSettled(index) {
    const ok = await window.app.confirmDialog('Mark this swap debt as settled?', {
      title: 'Settle debt',
      confirmLabel: 'Mark settled'
    });
    if (!ok) return;

    const settled = await this.app.state.markDebtSettled(index);
    if (settled) {
      this.renderDebtsPanel();
      window.app.showToast('Debt marked settled', 'success');
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  renderSwapsList() {
    const swapsList = document.getElementById('swaps-list');
    
    const filteredRequests = this.getFilteredRequests();
    
    if (filteredRequests.length === 0) {
      swapsList.innerHTML = `<div class="empty-state">${this.viewMode === 'marketplace'
        ? 'No shifts posted to the marketplace yet'
        : 'No swap requests found'}</div>`;
      return;
    }

    swapsList.innerHTML = filteredRequests.map(request => {
      const requester = request.requester || { name: 'Unknown', color: '#888' };
      const isCover = request.type === 'cover' || request.marketplace;
      const toShiftHtml = request.toShift ? `
            <div class="swap-to">
              <div class="swap-label">To:</div>
              <div class="swap-shift">
                <div class="shift-date">${this.formatDate(request.toShift.date)}</div>
                <div class="shift-time">${request.toShift.start} - ${request.toShift.end}</div>
              </div>
            </div>` : (isCover ? `
            <div class="swap-to marketplace-tag">
              <div class="swap-label">Marketplace</div>
              <div class="config-help">Seeking cover — students can offer to take this shift</div>
            </div>` : '');

      return `
      <div class="swap-request-card ${isCover ? 'marketplace-card' : ''}" data-request-id="${request.id}">
        <div class="request-header">
          <div class="requester-info">
            <div class="requester-avatar" style="background-color: ${requester.color}">
              ${(requester.name || '?').charAt(0).toUpperCase()}
            </div>
            <div class="requester-details">
              <div class="requester-name">${this.escapeHtml(requester.name)}</div>
              <div class="request-date">${this.formatDate(request.createdAt)} · ${isCover ? 'Cover request' : 'Exchange'}</div>
            </div>
          </div>
          <div class="request-status ${request.status}">
            ${request.status.charAt(0).toUpperCase() + request.status.slice(1)}
          </div>
        </div>

        <div class="request-content">
          <div class="swap-details">
            <div class="swap-from">
              <div class="swap-label">${isCover ? 'Shift needing cover:' : 'From:'}</div>
              <div class="swap-shift">
                <div class="shift-date">${this.formatDate(request.fromShift.date)}</div>
                <div class="shift-time">${request.fromShift.start} - ${request.fromShift.end}</div>
                <div class="shift-location">${request.fromShift.location || 'Main Campus'}</div>
              </div>
            </div>
            ${!isCover ? '<div class="swap-arrow"><i class="icon-arrow-right"></i></div>' : ''}
            ${toShiftHtml}
          </div>

          ${request.reason ? `
            <div class="request-reason">
              <strong>Reason:</strong> ${request.reason}
            </div>
          ` : ''}

          ${request.offers && request.offers.length > 0 ? `
            <div class="request-offers">
              <div class="offers-header">
                <strong>Offers (${request.offers.length}):</strong>
              </div>
              <div class="offers-list">
                ${request.offers.map(offer => `
                  <div class="offer-item">
                    <div class="offer-student">
                      <div class="student-avatar" style="background-color: ${offer.student.color}">
                        ${offer.student.name.charAt(0).toUpperCase()}
                      </div>
                      <span class="student-name">${offer.student.name}</span>
                    </div>
                    <div class="offer-actions">
                      <button class="btn btn-sm btn-success" onclick="window.app.swaps.acceptOffer(${request.id}, ${offer.id})">
                        Accept
                      </button>
                      <button class="btn btn-sm btn-danger" onclick="window.app.swaps.rejectOffer(${request.id}, ${offer.id})">
                        Reject
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <div class="request-actions">
          ${request.status === 'pending' ? `
            <button class="btn btn-success" onclick="window.app.swaps.approveRequest(${request.id})">
              <i class="icon-check"></i>
              Approve
            </button>
            <button class="btn btn-danger" onclick="window.app.swaps.rejectRequest(${request.id})">
              <i class="icon-x"></i>
              Reject
            </button>
            <button class="btn btn-secondary" onclick="window.app.swaps.makeOffer(${request.id})">
              <i class="icon-hand"></i>
              Make Offer
            </button>
          ` : ''}
          
          ${request.status === 'approved' ? `
            <button class="btn btn-info" onclick="window.app.swaps.viewDetails(${request.id})">
              <i class="icon-eye"></i>
              View Details
            </button>
          ` : ''}
          
          ${request.status === 'rejected' ? `
            <button class="btn btn-secondary" onclick="window.app.swaps.viewDetails(${request.id})">
              <i class="icon-eye"></i>
              View Details
            </button>
          ` : ''}
        </div>
      </div>
    `;
    }).join('');
  }

  getFilteredRequests() {
    let list = this.swapRequests;
    if (this.viewMode === 'marketplace') {
      list = list.filter(r => r.type === 'cover' || r.marketplace);
    }
    switch (this.currentFilter) {
      case 'pending':
        return list.filter(r => r.status === 'pending');
      case 'approved':
        return list.filter(r => r.status === 'approved');
      case 'rejected':
        return list.filter(r => r.status === 'rejected');
      case 'my-requests':
        return list.filter(r => String(r.requesterId || r.requester?.id) === String(this.getCurrentUserId()));
      default:
        return list;
    }
  }

  updateStats() {
    const pending = this.swapRequests.filter(r => r.status === 'pending').length;
    const approved = this.swapRequests.filter(r => r.status === 'approved').length;
    const rejected = this.swapRequests.filter(r => r.status === 'rejected').length;

    document.getElementById('pending-count').textContent = pending;
    document.getElementById('approved-count').textContent = approved;
    document.getElementById('rejected-count').textContent = rejected;
  }

  setupEventListeners() {
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Remove active class from all buttons
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        
        // Add active class to clicked button
        e.target.classList.add('active');
        
        // Update filter and re-render
        this.currentFilter = e.target.dataset.filter;
        this.renderSwapsList();
      });
    });

    // Action buttons
    document.getElementById('request-swap-btn').addEventListener('click', () => {
      this.showRequestSwapModal();
    });

    document.getElementById('refresh-swaps-btn').addEventListener('click', () => {
      this.refreshData();
    });

    document.querySelectorAll('.swaps-tabs .view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.swaps-tabs .view-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.viewMode = tab.dataset.swapView;
        this.renderSwapsList();
      });
    });

    document.getElementById('close-swap-request-modal')?.addEventListener('click', () => this.closeSwapRequestModal());
    document.getElementById('cancel-swap-request-btn')?.addEventListener('click', () => this.closeSwapRequestModal());
    document.getElementById('submit-swap-request-btn')?.addEventListener('click', () => this.submitSwapRequest());
    document.getElementById('swap-requester-select')?.addEventListener('change', () => this.loadShiftsForRequester());
    document.getElementById('swap-request-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'swap-request-modal') this.closeSwapRequestModal();
    });
    this._offerRequestId = null;

    document.getElementById('close-swap-offer-modal')?.addEventListener('click', () => this.closeOfferModal());
    document.getElementById('cancel-swap-offer-btn')?.addEventListener('click', () => this.closeOfferModal());
    document.getElementById('swap-offer-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'swap-offer-modal') this.closeOfferModal();
    });
  }

  async showRequestSwapModal() {
    const students = this.app.state.students;
    if (!students.length) {
      window.app.showToast('Load students first', 'warning');
      return;
    }
    const select = document.getElementById('swap-requester-select');
    select.innerHTML = students.map(s =>
      `<option value="${s.id}">${this.escapeHtml(s.name)}</option>`
    ).join('');
    await this.loadShiftsForRequester();
    document.getElementById('swap-reason-input').value = '';
    document.getElementById('swap-request-modal').style.display = 'flex';
  }

  closeSwapRequestModal() {
    document.getElementById('swap-request-modal').style.display = 'none';
  }

  async loadShiftsForRequester() {
    const studentId = document.getElementById('swap-requester-select')?.value;
    const shiftSelect = document.getElementById('swap-shift-select');
    if (!studentId || !shiftSelect) return;

    const shifts = await this.app.state.getStudentShiftsForMonth(studentId);
    if (!shifts.length) {
      shiftSelect.innerHTML = '<option value="">No assigned shifts this month — generate schedule first</option>';
      return;
    }
    shiftSelect.innerHTML = shifts.map((s, i) =>
      `<option value="${i}">${s.date} ${s.start}–${s.end}</option>`
    ).join('');
    this._requesterShifts = shifts;
  }

  async submitSwapRequest() {
    try {
      const studentId = document.getElementById('swap-requester-select').value;
      const shiftIdx = Number(document.getElementById('swap-shift-select').value);
      const reason = document.getElementById('swap-reason-input').value.trim();
      const fromShift = this._requesterShifts?.[shiftIdx];
      if (!fromShift) {
        window.app.showToast('Select a shift to post', 'warning');
        return;
      }

      await this.app.state.createSwapRequest({
        type: 'cover',
        requesterId: studentId,
        fromShift,
        reason
      });

      await this.loadSwapRequests();
      this.renderSwapsList();
      this.closeSwapRequestModal();
      window.app.showToast('Shift posted to marketplace', 'success');
    } catch (err) {
      window.app.showToast(err.message || 'Failed to post shift', 'error');
    }
  }

  async refreshData() {
    try {
      window.app.showToast('Refreshing swaps...', 'info');
      await this.loadData();
      this.renderDebtsPanel();
      this.renderSwapsList();
      window.app.showToast('Swaps refreshed', 'success');
    } catch (error) {
      console.error('❌ Failed to refresh swaps:', error);
      window.app.showToast('Failed to refresh swaps', 'error');
    }
  }

  async approveRequest(requestId) {
    try {
      const request = this.swapRequests.find(r => r.id === requestId);
      if (!request) return;

      const ok = await window.app.confirmDialog('Approve this swap request?', {
        title: 'Approve swap',
        confirmLabel: 'Approve'
      });
      if (!ok) return;

      request.status = 'approved';
      request.approvedAt = new Date();
      request.approvedBy = this.getCurrentUserId();

      if (request.type === 'cover' || request.marketplace) {
        if (request.offers?.length && !request.acceptedOffer) {
          request.acceptedOffer = request.offers[0];
        }
        if (request.acceptedOffer) {
          await this.app.state.executeApprovedSwap(request);
        } else {
          const takerId = window.prompt('Enter replacement student ID (or use Make Offer first):');
          if (!takerId) return;
          const taker = this.app.state.students.find(s => String(s.id) === String(takerId));
          if (!taker) {
            window.app.showToast('Student not found', 'error');
            return;
          }
          request.takerId = takerId;
          request.acceptedOffer = { student: { id: taker.id, name: taker.name, color: taker.color } };
          await this.app.state.executeApprovedSwap(request);
        }
      }

      await this.updateSwapRequest(request);

      // Re-render the list
      this.renderSwapsList();
      this.updateStats();

      window.app.showToast('Swap request approved', 'success');
    } catch (error) {
      console.error('❌ Failed to approve request:', error);
      window.app.showToast('Failed to approve request', 'error');
    }
  }

  async rejectRequest(requestId) {
    try {
      const request = this.swapRequests.find(r => r.id === requestId);
      if (!request) return;

      const reason = window.prompt('Reason for rejection (optional):');
      if (reason === null) return;
      
      // Update request status
      request.status = 'rejected';
      request.rejectedAt = new Date();
      request.rejectedBy = this.getCurrentUserId();
      request.rejectionReason = reason;

      // Update in storage/API
      await this.updateSwapRequest(request);

      // Re-render the list
      this.renderSwapsList();
      this.updateStats();

      window.app.showToast('Swap request rejected', 'success');
    } catch (error) {
      console.error('❌ Failed to reject request:', error);
      window.app.showToast('Failed to reject request', 'error');
    }
  }

  // Aliases used by dashboard inline handlers
  async approveSwap(requestId) {
    return this.approveRequest(requestId);
  }

  async rejectSwap(requestId) {
    return this.rejectRequest(requestId);
  }

  async makeOffer(requestId) {
    try {
      const request = this.swapRequests.find(r => r.id === requestId);
      if (!request) return;

      const students = this.app.state.students.filter(s =>
        String(s.id) !== String(request.requesterId || request.requester?.id)
      );
      if (!students.length) {
        window.app.showToast('No other students available', 'warning');
        return;
      }

      this._offerRequestId = requestId;
      const list = document.getElementById('swap-offer-student-list');
      list.innerHTML = students.map(s => `
        <button type="button" class="student-picker-item" data-student-id="${s.id}">
          <span class="sq" style="background:${s.color}"></span>
          ${this.escapeHtml(s.name)}
        </button>`).join('');

      list.querySelectorAll('.student-picker-item').forEach(btn => {
        btn.addEventListener('click', () => this.submitOffer(Number(requestId), btn.dataset.studentId));
      });

      document.getElementById('swap-offer-modal').style.display = 'flex';
    } catch (error) {
      console.error('❌ Failed to make offer:', error);
      window.app.showToast('Failed to make offer', 'error');
    }
  }

  closeOfferModal() {
    document.getElementById('swap-offer-modal').style.display = 'none';
    this._offerRequestId = null;
  }

  async submitOffer(requestId, studentId) {
    try {
      const request = this.swapRequests.find(r => r.id === requestId);
      const student = this.app.state.students.find(s => String(s.id) === String(studentId));
      if (!request || !student) return;

      request.offers = request.offers || [];
      request.offers.push({
        id: Date.now(),
        student: { id: student.id, name: student.name, color: student.color },
        createdAt: new Date().toISOString()
      });

      await this.updateSwapRequest(request);
      this.closeOfferModal();
      this.renderSwapsList();
      window.app.showToast(`${student.name} offered to cover`, 'success');
    } catch (error) {
      window.app.showToast(error.message || 'Failed to submit offer', 'error');
    }
  }

  async acceptOffer(requestId, offerId) {
    try {
      const request = this.swapRequests.find(r => r.id === requestId);
      if (!request) return;

      const offer = request.offers.find(o => o.id === offerId);
      if (!offer) return;

      // Update request with accepted offer
      request.status = 'approved';
      request.acceptedOffer = offer;
      request.approvedAt = new Date();

      await this.app.state.executeApprovedSwap(request);
      await this.updateSwapRequest(request);
      await this.loadSwapRequests();
      this.renderDebtsPanel();

      // Re-render the list
      this.renderSwapsList();
      this.updateStats();

      window.app.showToast('Offer accepted', 'success');
    } catch (error) {
      console.error('❌ Failed to accept offer:', error);
      window.app.showToast('Failed to accept offer', 'error');
    }
  }

  async rejectOffer(requestId, offerId) {
    try {
      const request = this.swapRequests.find(r => r.id === requestId);
      if (!request) return;

      // Remove offer from request
      request.offers = request.offers.filter(o => o.id !== offerId);

      // Update in storage/API
      await this.updateSwapRequest(request);

      // Re-render the list
      this.renderSwapsList();

      window.app.showToast('Offer rejected', 'success');
    } catch (error) {
      console.error('❌ Failed to reject offer:', error);
      window.app.showToast('Failed to reject offer', 'error');
    }
  }

  async viewDetails(requestId) {
    try {
      const request = this.swapRequests.find(r => r.id === requestId);
      if (!request) return;
      const detail = [
        `Status: ${request.status}`,
        `Type: ${request.type || 'exchange'}`,
        `Shift: ${request.fromShift?.date} ${request.fromShift?.start}–${request.fromShift?.end}`,
        request.reason ? `Reason: ${request.reason}` : '',
        request.offers?.length ? `Offers: ${request.offers.map(o => o.student.name).join(', ')}` : ''
      ].filter(Boolean).join(' · ');
      window.app.showToast(detail, 'info');
    } catch (error) {
      console.error('❌ Failed to view details:', error);
      window.app.showToast('Failed to view details', 'error');
    }
  }

  async updateSwapRequest(request) {
    await this.app.state.saveSwapRequest(request);
  }

  async getSwapRequests() {
    return this.app.state.getSwapRequests();
  }

  async getSwapOffers() {
    return [];
  }

  getCurrentUserId() {
    return this.app.state.students[0]?.id || '1';
  }

  formatDate(dateInput) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(date.getTime())) return String(dateInput);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
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

// Make SwapsView available globally
window.SwapsView = SwapsView;
