// Student Shift Scheduler PWA - Storage Manager
// Handles local storage, IndexedDB, and offline data management

class StorageManager {
  constructor() {
    this.dbName = 'ShiftSchedulerDB';
    this.dbVersion = 2;
    this.db = null;
    this.pendingChanges = [];
    this.initPromise = this.init();
  }

  async init() {
    try {
      this.db = await this.openDatabase();
      await this.setupStores();
      await this.migrateScheduleMonthKeys();
      console.log('✅ Storage Manager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize storage:', error);
    }
  }

  openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('schedules')) {
          const scheduleStore = db.createObjectStore('schedules', { keyPath: 'id' });
          scheduleStore.createIndex('monthYear', ['month', 'year'], { unique: false });
        }
        
        if (!db.objectStoreNames.contains('students')) {
          db.createObjectStore('students', { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains('swaps')) {
          const swapStore = db.createObjectStore('swaps', { keyPath: 'id', autoIncrement: true });
          swapStore.createIndex('requester', 'requesterId', { unique: false });
          swapStore.createIndex('status', 'status', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('pendingChanges')) {
          db.createObjectStore('pendingChanges', { keyPath: 'id', autoIncrement: true });
        }
        
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // v2: payroll time-entries; natural key = username|shiftStartedISO
        if (!db.objectStoreNames.contains('timeEntries')) {
          const teStore = db.createObjectStore('timeEntries', { keyPath: 'id' });
          teStore.createIndex('username',  'username',  { unique: false });
          teStore.createIndex('dateISO',   'dateISO',   { unique: false });
          teStore.createIndex('monthKey',  'monthKey',  { unique: false });
        }
      };
    });
  }

  async setupStores() {
    await this.ensureSetting('theme', 'dark');
    await this.ensureSetting('notifications', true);
    await this.ensureSetting('offlineMode', false);
  }

  async ensureSetting(key, defaultValue) {
    const existing = await this.getRecord('settings', key);
    if (!existing) {
      await this.setSetting(key, defaultValue);
    }
  }

  async putRecord(storeName, record) {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getRecord(storeName, key) {
    if (!this.db) return null;

    const transaction = this.db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  // Settings store: keyPath is "key"
  async set(storeName, key, value) {
    if (storeName !== 'settings') {
      throw new Error(`Use store-specific methods for "${storeName}"`);
    }
    return this.setSetting(key, value);
  }

  async get(storeName, key) {
    if (storeName !== 'settings') {
      throw new Error(`Use store-specific methods for "${storeName}"`);
    }
    return this.getSetting(key);
  }

  async delete(storeName, key) {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName) {
    if (!this.db) return [];

    const transaction = this.db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // Schedule-specific methods
  async saveSchedule(schedule) {
    try {
      if (!schedule.id) {
        schedule.id = this.monthScheduleId(schedule.year, schedule.month);
      }
      await this.putRecord('schedules', schedule);
      console.log('✅ Schedule saved locally');
    } catch (error) {
      console.error('❌ Failed to save schedule:', error);
      throw error;
    }
  }

  async getSchedule(scheduleId) {
    try {
      return await this.getRecord('schedules', scheduleId);
    } catch (error) {
      console.error('❌ Failed to get schedule:', error);
      return null;
    }
  }

  async getAllSchedules() {
    try {
      return await this.getAll('schedules');
    } catch (error) {
      console.error('❌ Failed to get schedules:', error);
      return [];
    }
  }

  /**
   * Calendar month schedule id — matches HoursLedger.monthKey(year, monthIndex).
   * @param {number} year
   * @param {number} monthIndex - JS 0-indexed month (0 = January)
   */
  monthScheduleId(year, monthIndex) {
    const calendarMonth = monthIndex + 1;
    return `${year}-${String(calendarMonth).padStart(2, '0')}`;
  }

  _parseLegacyScheduleId(id) {
    const match = String(id).match(/^(\d{4})-(\d{1,2})$/);
    if (!match) return null;
    return {
      year: Number(match[1]),
      jsMonthIndex: Number(match[2])
    };
  }

  _scheduleIsNewer(candidate, existing) {
    const candidateTime = candidate.updatedAt || 0;
    const existingTime = existing.updatedAt || 0;
    if (candidateTime !== existingTime) {
      return candidateTime > existingTime;
    }
    return (candidate.shifts?.length || 0) > (existing.shifts?.length || 0);
  }

  /**
   * One-time migration: legacy ids used padded JS month index (Sep → 2025-08);
   * canonical ids use calendar month (Sep → 2025-09).
   */
  async migrateScheduleMonthKeys() {
    if (!this.db) return;

    const done = await this.getSetting('scheduleMonthKeyMigration');
    if (done === 'calendar-v1') return;

    const schedules = await this.getAllSchedules();
    if (schedules.length === 0) {
      await this.setSetting('scheduleMonthKeyMigration', 'calendar-v1');
      return;
    }

    const canonicalById = new Map();
    const oldIds = new Set();

    for (const schedule of schedules) {
      oldIds.add(schedule.id);

      let year = schedule.year;
      let jsMonthIndex = schedule.month;
      if (year == null || jsMonthIndex == null) {
        const parsed = this._parseLegacyScheduleId(schedule.id);
        if (!parsed) continue;
        year = parsed.year;
        jsMonthIndex = parsed.jsMonthIndex;
      }

      const canonicalId = this.monthScheduleId(year, jsMonthIndex);
      const candidate = { ...schedule, id: canonicalId, year, month: jsMonthIndex };
      const existing = canonicalById.get(canonicalId);
      if (!existing || this._scheduleIsNewer(candidate, existing)) {
        canonicalById.set(canonicalId, candidate);
      }
    }

    const transaction = this.db.transaction(['schedules'], 'readwrite');
    const store = transaction.objectStore('schedules');

    for (const oldId of oldIds) {
      store.delete(oldId);
    }
    for (const record of canonicalById.values()) {
      store.put(record);
    }

    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });

    await this.setSetting('scheduleMonthKeyMigration', 'calendar-v1');
    console.log(`✅ Migrated ${oldIds.size} schedule record(s) to calendar month keys`);
  }

  async saveMonthSchedule(year, month, shifts) {
    const id = this.monthScheduleId(year, month);
    await this.putRecord('schedules', {
      id,
      year,
      month,
      shifts,
      updatedAt: Date.now()
    });
  }

  async getMonthSchedule(year, month) {
    return await this.getRecord('schedules', this.monthScheduleId(year, month));
  }

  // Student-specific methods
  async saveStudents(students) {
    try {
      if (!this.db) throw new Error('Database not initialized');

      const transaction = this.db.transaction(['students'], 'readwrite');
      const store = transaction.objectStore('students');
      store.clear();
      for (const student of students) {
        store.put({ ...student, id: String(student.id) });
      }

      await new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });

      console.log('✅ Students saved locally');
    } catch (error) {
      console.error('❌ Failed to save students:', error);
      throw error;
    }
  }

  async getStudents() {
    try {
      return await this.getAll('students');
    } catch (error) {
      console.error('❌ Failed to get students:', error);
      return [];
    }
  }

  // Swap-specific methods
  async saveSwapRequest(swapRequest) {
    try {
      if (!this.db) throw new Error('Database not initialized');
      
      const transaction = this.db.transaction(['swaps'], 'readwrite');
      const store = transaction.objectStore('swaps');
      
      return new Promise((resolve, reject) => {
        const request = store.add(swapRequest);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('❌ Failed to save swap request:', error);
      throw error;
    }
  }

  async getSwapRequests(status = null) {
    try {
      if (!this.db) return [];
      
      const transaction = this.db.transaction(['swaps'], 'readonly');
      const store = transaction.objectStore('swaps');
      
      return new Promise((resolve, reject) => {
        const request = status ? 
          store.index('status').getAll(status) : 
          store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('❌ Failed to get swap requests:', error);
      return [];
    }
  }

  async updateSwapRequest(swapId, updates) {
    try {
      if (!this.db) throw new Error('Database not initialized');
      
      const transaction = this.db.transaction(['swaps'], 'readwrite');
      const store = transaction.objectStore('swaps');
      
      // Get existing record
      const getRequest = store.get(swapId);
      
      return new Promise((resolve, reject) => {
        getRequest.onsuccess = () => {
          const existing = getRequest.result;
          if (!existing) {
            reject(new Error('Swap request not found'));
            return;
          }
          
          const updated = { ...existing, ...updates, updatedAt: Date.now() };
          const putRequest = store.put(updated);
          putRequest.onsuccess = () => resolve(putRequest.result);
          putRequest.onerror = () => reject(putRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
      });
    } catch (error) {
      console.error('❌ Failed to update swap request:', error);
      throw error;
    }
  }

  // Time-entries methods (payroll ingestion — v2)

  /**
   * Idempotent batch upsert. Each entry must have:
   *   id        — `${username}|${shiftStartedISO}` (natural key)
   *   username  — string
   *   dateISO   — "YYYY-MM-DD" (SAST date of shift start)
   *   monthKey  — "YYYY-MM"   (calendar month, not JS 0-indexed)
   * Re-uploading the same entries updates in place; never duplicates.
   * @param {object[]} entries
   * @returns {Promise<number>} count of entries submitted
   */
  async upsertTimeEntries(entries) {
    if (!this.db) throw new Error('Database not initialized');
    if (!entries || entries.length === 0) return 0;

    const transaction = this.db.transaction(['timeEntries'], 'readwrite');
    const store = transaction.objectStore('timeEntries');

    for (const entry of entries) {
      store.put(entry);
    }

    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror  = () => reject(transaction.error);
      transaction.onabort  = () => reject(transaction.error);
    });

    return entries.length;
  }

  async getTimeEntriesForMonth(monthKey) {
    if (!this.db) return [];
    const transaction = this.db.transaction(['timeEntries'], 'readonly');
    const store = transaction.objectStore('timeEntries');
    return new Promise((resolve, reject) => {
      const request = store.index('monthKey').getAll(monthKey);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror  = () => reject(request.error);
    });
  }

  async getTimeEntriesForStudent(username) {
    if (!this.db) return [];
    const transaction = this.db.transaction(['timeEntries'], 'readonly');
    const store = transaction.objectStore('timeEntries');
    return new Promise((resolve, reject) => {
      const request = store.index('username').getAll(username);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror  = () => reject(request.error);
    });
  }

  async clearTimeEntries() {
    if (!this.db) throw new Error('Database not initialized');
    const transaction = this.db.transaction(['timeEntries'], 'readwrite');
    const store = transaction.objectStore('timeEntries');
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror  = () => reject(request.error);
    });
  }

  // Offline data management
  async addPendingChange(change) {
    try {
      if (!this.db) throw new Error('Database not initialized');
      
      const transaction = this.db.transaction(['pendingChanges'], 'readwrite');
      const store = transaction.objectStore('pendingChanges');
      
      const pendingChange = {
        ...change,
        timestamp: Date.now(),
        synced: false
      };
      
      return new Promise((resolve, reject) => {
        const request = store.add(pendingChange);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('❌ Failed to add pending change:', error);
      throw error;
    }
  }

  async getPendingChanges() {
    try {
      if (!this.db) return [];
      
      const transaction = this.db.transaction(['pendingChanges'], 'readonly');
      const store = transaction.objectStore('pendingChanges');
      
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const unsynced = request.result.filter(change => !change.synced);
          resolve(unsynced);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('❌ Failed to get pending changes:', error);
      return [];
    }
  }

  async markChangeAsSynced(changeId) {
    try {
      if (!this.db) throw new Error('Database not initialized');
      
      const transaction = this.db.transaction(['pendingChanges'], 'readwrite');
      const store = transaction.objectStore('pendingChanges');
      
      return new Promise((resolve, reject) => {
        const getRequest = store.get(changeId);
        getRequest.onsuccess = () => {
          const change = getRequest.result;
          if (change) {
            change.synced = true;
            change.syncedAt = Date.now();
            const putRequest = store.put(change);
            putRequest.onsuccess = () => resolve(putRequest.result);
            putRequest.onerror = () => reject(putRequest.error);
          } else {
            resolve(null);
          }
        };
        getRequest.onerror = () => reject(getRequest.error);
      });
    } catch (error) {
      console.error('❌ Failed to mark change as synced:', error);
      throw error;
    }
  }

  async syncPendingChanges() {
    try {
      const pendingChanges = await this.getPendingChanges();
      console.log(`🔄 Syncing ${pendingChanges.length} pending changes...`);
      
      for (const change of pendingChanges) {
        try {
          // Attempt to sync the change
          await this.syncChange(change);
          await this.markChangeAsSynced(change.id);
          console.log(`✅ Synced change ${change.id}`);
        } catch (error) {
          console.error(`❌ Failed to sync change ${change.id}:`, error);
        }
      }
      
      console.log('✅ Pending changes sync completed');
    } catch (error) {
      console.error('❌ Failed to sync pending changes:', error);
      throw error;
    }
  }

  async syncChange(change) {
    // This would typically make an API call
    // For now, we'll simulate the sync
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`🔄 Syncing change:`, change);
        resolve();
      }, 100);
    });
  }

  // Settings management
  async getSetting(key, defaultValue = null) {
    try {
      const record = await this.getRecord('settings', key);
      return record ? record.value : defaultValue;
    } catch (error) {
      console.error('❌ Failed to get setting:', error);
      return defaultValue;
    }
  }

  async setSetting(key, value) {
    try {
      await this.putRecord('settings', { key, value, timestamp: Date.now() });
    } catch (error) {
      console.error('❌ Failed to set setting:', error);
      throw error;
    }
  }

  // Cache management
  async clearCache() {
    try {
      if (!this.db) return;
      
      const storeNames = ['schedules', 'students', 'swaps', 'pendingChanges'];
      
      for (const storeName of storeNames) {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        await new Promise((resolve, reject) => {
          const request = store.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }
      
      console.log('✅ Cache cleared');
    } catch (error) {
      console.error('❌ Failed to clear cache:', error);
      throw error;
    }
  }

  // Export/Import data
  async exportData() {
    try {
      const data = {
        schemaVersion: this.dbVersion,                 // F-06: payload version for import validation
        schedules: await this.getAllSchedules(),
        students: await this.getStudents(),
        swaps: await this.getSwapRequests(),
        settings: await this.getAll('settings'),
        timeEntries: await this.getAll('timeEntries'),  // F-06: payroll clock data must round-trip
        exportDate: new Date().toISOString()
      };
      
      return data;
    } catch (error) {
      console.error('❌ Failed to export data:', error);
      throw error;
    }
  }

  async importData(data) {
    try {
      // F-06: validate the payload shape and reject prototype-polluting keys.
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Import payload must be a JSON object');
      }
      const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

      if (Array.isArray(data.schedules)) {
        for (const schedule of data.schedules) {
          await this.saveSchedule(schedule.value || schedule);
        }
      }

      if (Array.isArray(data.students)) {
        await this.saveStudents(data.students);
      }

      // F-06: restore payroll clock data (entries already carry their `id`).
      if (Array.isArray(data.timeEntries)) {
        const valid = data.timeEntries.filter(
          (e) => e && typeof e === 'object' && typeof e.id === 'string'
        );
        if (valid.length) await this.upsertTimeEntries(valid);
      }

      if (Array.isArray(data.settings)) {
        for (const setting of data.settings) {
          if (!setting || typeof setting.key !== 'string') continue;
          if (FORBIDDEN_KEYS.has(setting.key)) continue; // F-06: pollution guard
          await this.setSetting(setting.key, setting.value);
        }
      }

      console.log('✅ Data imported successfully');
    } catch (error) {
      console.error('❌ Failed to import data:', error);
      throw error;
    }
  }
}

// Make StorageManager available globally
window.StorageManager = StorageManager;
