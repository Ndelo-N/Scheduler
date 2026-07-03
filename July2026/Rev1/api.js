// Student Shift Scheduler PWA - API Client
// Handles all API communications with offline support

class APIClient {
  constructor() {
    this.baseURL = (window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) || '/api';
    this.timeout = 10000; // 10 seconds
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 second
    
    this.setupInterceptors();
  }

  setupInterceptors() {
    // Auth is via an httpOnly session cookie (sent automatically with
    // credentials:'include'); no Authorization header and no client-readable
    // token — closes F-12 (token-in-localStorage XSS exposure).
    this.addRequestInterceptor((config) => {
      config.headers = {
        ...config.headers,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      return config;
    });
  }

  // HTTP Methods
  async get(endpoint, options = {}) {
    return this.request('GET', endpoint, null, options);
  }

  async post(endpoint, data, options = {}) {
    return this.request('POST', endpoint, data, options);
  }

  async put(endpoint, data, options = {}) {
    return this.request('PUT', endpoint, data, options);
  }

  async delete(endpoint, options = {}) {
    return this.request('DELETE', endpoint, null, options);
  }

  async request(method, endpoint, data = null, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      method,
      headers: options.headers || {},
      timeout: options.timeout || this.timeout,
      ...options
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      config.body = JSON.stringify(data);
    }

    // Apply request interceptors
    const processedConfig = this.applyRequestInterceptors(config);

    try {
      const response = await this.fetchWithRetry(url, processedConfig);
      const result = await this.processResponse(response);
      
      // Apply response interceptors
      return this.applyResponseInterceptors(result);
    } catch (error) {
      // Handle offline scenario (network error, no response)
      if (!navigator.onLine) {
        return this.handleOfflineRequest(method, endpoint, data, options);
      }
      // Global auth handling for mid-session failures. The session check and the
      // auth endpoints pass skipAuthHandler and interpret these themselves.
      if (error.response && !options.skipAuthHandler) {
        if (error.status === 401) {
          this.handleUnauthorized();
        } else if (error.status === 403 && error.code === 'password_change_required') {
          this.handlePasswordChangeRequired();
        }
      }
      throw error;
    }
  }

  async fetchWithRetry(url, config, attempt = 1) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);
      
      const response = await fetch(url, {
        ...config,
        credentials: 'include', // send/receive the httpOnly session cookie (same-origin)
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      if (attempt < this.retryAttempts && this.shouldRetry(error)) {
        console.log(`🔄 Retrying request (attempt ${attempt + 1}/${this.retryAttempts})`);
        await this.delay(this.retryDelay * attempt);
        return this.fetchWithRetry(url, config, attempt + 1);
      }
      throw error;
    }
  }

  shouldRetry(error) {
    // Retry on network errors or 5xx status codes
    return !error.response || (error.response.status >= 500 && error.response.status < 600);
  }

  async processResponse(response) {
    if (!response.ok) {
      let body = null;
      try { body = await response.clone().json(); } catch { /* non-JSON error */ }
      const error = new Error((body && body.error) || `HTTP ${response.status}: ${response.statusText}`);
      error.response = response;
      error.status = response.status;
      error.code = body && body.code;   // e.g. 'password_change_required'
      error.body = body;
      throw error;
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    
    return await response.text();
  }

  async handleOfflineRequest(method, endpoint, data, options) {
    console.log('📡 Offline: Storing request for later sync');
    
    // Store the request for later sync
    const offlineRequest = {
      method,
      endpoint,
      data,
      options,
      timestamp: Date.now()
    };
    
    await window.app.storage.addPendingChange(offlineRequest);
    
    // Return a mock response for offline scenarios
    return this.getOfflineResponse(method, endpoint);
  }

  getOfflineResponse(method, endpoint) {
    // Return appropriate offline responses based on endpoint
    if (endpoint.includes('/schedules')) {
      return { data: [], offline: true };
    }
    
    if (endpoint.includes('/students')) {
      return { data: [], offline: true };
    }
    
    if (endpoint.includes('/swaps')) {
      return { data: [], offline: true };
    }
    
    return { success: true, offline: true };
  }

  // Authentication (cookie session — no client-side token)
  //
  // The server sets an httpOnly session cookie on login; the browser attaches it
  // automatically. There is deliberately no getAuthToken/localStorage here.
  async login(uNumber, password) {
    // → { user: { id, uNumber, role }, mustChangePassword }
    return this.post('/auth/login', { uNumber, password }, { skipAuthHandler: true });
  }

  async logout() {
    try {
      await this.post('/auth/logout', {}, { skipAuthHandler: true });
    } catch { /* logout is best-effort; the cookie is cleared server-side */ }
  }

  // Returns the current session { user, mustChangePassword } or null if not logged in.
  async getSession() {
    try {
      return await this.get('/auth/me', { skipAuthHandler: true });
    } catch (error) {
      if (error.status === 401) return null;
      throw error;
    }
  }

  async changePassword(currentPassword, newPassword) {
    return this.post('/auth/change-password', { currentPassword, newPassword }, { skipAuthHandler: true });
  }

  // UI-agnostic notifications: the auth gate listens for these window events and
  // shows the login / change-password screen. api.js never touches the DOM tree.
  handleUnauthorized() {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('auth:unauthenticated'));
    }
  }

  handlePasswordChangeRequired() {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('auth:password-change-required'));
    }
  }

  // Interceptors
  requestInterceptors = [];
  responseInterceptors = [];

  addRequestInterceptor(interceptor) {
    this.requestInterceptors.push(interceptor);
  }

  addResponseInterceptor(successInterceptor, errorInterceptor) {
    this.responseInterceptors.push({ successInterceptor, errorInterceptor });
  }

  applyRequestInterceptors(config) {
    return this.requestInterceptors.reduce((config, interceptor) => {
      return interceptor(config);
    }, config);
  }

  applyResponseInterceptors(response) {
    return this.responseInterceptors.reduce((response, interceptor) => {
      return interceptor.successInterceptor(response);
    }, response);
  }

  // Utility methods
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Schedule API methods
  async getSchedules() {
    return this.get('/api/schedules');
  }

  async getSchedule(scheduleId) {
    return this.get(`/api/schedules/${scheduleId}`);
  }

  async createSchedule(scheduleData) {
    return this.post('/api/schedules', scheduleData);
  }

  async updateSchedule(scheduleId, scheduleData) {
    return this.put(`/api/schedules/${scheduleId}`, scheduleData);
  }

  async deleteSchedule(scheduleId) {
    return this.delete(`/api/schedules/${scheduleId}`);
  }

  // Shift API methods
  async getShifts(scheduleId) {
    return this.get(`/api/schedules/${scheduleId}/shifts`);
  }

  async createShift(scheduleId, shiftData) {
    return this.post(`/api/schedules/${scheduleId}/shifts`, shiftData);
  }

  async updateShift(shiftId, shiftData) {
    return this.put(`/api/shifts/${shiftId}`, shiftData);
  }

  async deleteShift(shiftId) {
    return this.delete(`/api/shifts/${shiftId}`);
  }

  // Student API methods
  async getStudents() {
    return this.get('/api/students');
  }

  async getStudent(studentId) {
    return this.get(`/api/students/${studentId}`);
  }

  async createStudent(studentData) {
    return this.post('/api/students', studentData);
  }

  async updateStudent(studentId, studentData) {
    return this.put(`/api/students/${studentId}`, studentData);
  }

  async deleteStudent(studentId) {
    return this.delete(`/api/students/${studentId}`);
  }

  // Swap API methods
  async getSwapRequests(status = null) {
    const endpoint = status ? `/api/swaps/requests?status=${status}` : '/api/swaps/requests';
    return this.get(endpoint);
  }

  async createSwapRequest(swapData) {
    return this.post('/api/swaps/requests', swapData);
  }

  async updateSwapRequest(swapId, updates) {
    return this.put(`/api/swaps/requests/${swapId}`, updates);
  }

  async approveSwapRequest(swapId) {
    return this.put(`/api/swaps/requests/${swapId}/approve`);
  }

  async rejectSwapRequest(swapId, reason) {
    return this.put(`/api/swaps/requests/${swapId}/reject`, { reason });
  }

  async getSwapOffers(swapRequestId) {
    return this.get(`/api/swaps/requests/${swapRequestId}/offers`);
  }

  async createSwapOffer(swapRequestId, offerData) {
    return this.post(`/api/swaps/requests/${swapRequestId}/offers`, offerData);
  }

  // Analytics API methods
  async getScheduleAnalytics(scheduleId) {
    return this.get(`/api/analytics/schedules/${scheduleId}`);
  }

  async getStudentAnalytics(studentId) {
    return this.get(`/api/analytics/students/${studentId}`);
  }

  async getSwapAnalytics() {
    return this.get('/api/analytics/swaps');
  }

  // File upload methods
  async uploadFile(file, endpoint) {
    const formData = new FormData();
    formData.append('file', file);
    
    return this.request('POST', endpoint, formData, {
      headers: {
        // Don't set Content-Type for FormData, let browser set it
      }
    });
  }

  async importCSV(file) {
    return this.uploadFile(file, '/api/import/csv');
  }

  async exportSchedule(scheduleId, format = 'csv') {
    return this.get(`/api/export/schedules/${scheduleId}?format=${format}`);
  }

  // Real-time updates
  setupWebSocket() {
    const wsUrl = this.baseURL.replace('http', 'ws') + '/ws';
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('🔌 WebSocket connected');
      this.ws = ws;
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleWebSocketMessage(data);
    };
    
    ws.onclose = () => {
      console.log('🔌 WebSocket disconnected');
      this.ws = null;
      // Attempt to reconnect after 5 seconds
      setTimeout(() => this.setupWebSocket(), 5000);
    };
    
    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };
  }

  handleWebSocketMessage(data) {
    // Handle real-time updates
    switch (data.type) {
      case 'schedule_updated':
        this.handleScheduleUpdate(data.payload);
        break;
      case 'swap_request_created':
        this.handleSwapRequestCreated(data.payload);
        break;
      case 'swap_request_updated':
        this.handleSwapRequestUpdated(data.payload);
        break;
      default:
        console.log('📡 WebSocket message:', data);
    }
  }

  handleScheduleUpdate(payload) {
    // Emit custom event for schedule updates
    window.dispatchEvent(new CustomEvent('scheduleUpdated', { detail: payload }));
  }

  handleSwapRequestCreated(payload) {
    // Emit custom event for new swap requests
    window.dispatchEvent(new CustomEvent('swapRequestCreated', { detail: payload }));
  }

  handleSwapRequestUpdated(payload) {
    // Emit custom event for swap request updates
    window.dispatchEvent(new CustomEvent('swapRequestUpdated', { detail: payload }));
  }

  // Health check
  async healthCheck() {
    try {
      const response = await this.get('/health', { skipAuthHandler: true }); // baseURL already '/api' → /api/health
      return response.status === 'ok';
    } catch (error) {
      return false;
    }
  }
}

// Make APIClient available globally
window.APIClient = APIClient;
