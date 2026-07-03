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
    // Add authentication token to requests
    this.addRequestInterceptor((config) => {
      const token = this.getAuthToken();
      if (token) {
        config.headers = {
          ...config.headers,
          'Authorization': `Bearer ${token}`
        };
      }
      
      config.headers = {
        ...config.headers,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      
      return config;
    });

    // Handle response errors
    this.addResponseInterceptor(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.handleUnauthorized();
        }
        return Promise.reject(error);
      }
    );
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
      // Handle offline scenario
      if (!navigator.onLine) {
        return this.handleOfflineRequest(method, endpoint, data, options);
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
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.response = response;
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

  // Authentication
  //
  // F-12 — SECURITY NOTE: the auth token lives in localStorage, which is
  // readable by any script on the page, so a single XSS bug exfiltrates it.
  // When a real backend lands, prefer an httpOnly, Secure, SameSite cookie set
  // by the server (token never touches JS), or hold it in memory only. Token
  // access is funnelled through `APIClient.tokenStore` so the storage mechanism
  // can be swapped in one place without touching call sites:
  //   APIClient.tokenStore = { get(){…}, set(t){…}, clear(){…} };  // e.g. in-memory
  getAuthToken() {
    return this.tokenStore.get();
  }

  setAuthToken(token) {
    this.tokenStore.set(token);
  }

  clearAuthToken() {
    this.tokenStore.clear();
  }

  // Default token store — localStorage (unchanged behaviour). Override on the
  // instance to switch to in-memory or cookie-backed storage.
  get tokenStore() {
    if (!this._tokenStore) {
      this._tokenStore = {
        get: () => localStorage.getItem('authToken'),
        set: (t) => localStorage.setItem('authToken', t),
        clear: () => localStorage.removeItem('authToken')
      };
    }
    return this._tokenStore;
  }

  set tokenStore(store) {
    this._tokenStore = store;
  }

  handleUnauthorized() {
    this.clearAuthToken();
    window.location.href = '/login';
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
      const response = await this.get('/api/health');
      return response.status === 'ok';
    } catch (error) {
      return false;
    }
  }
}

// Make APIClient available globally
window.APIClient = APIClient;
