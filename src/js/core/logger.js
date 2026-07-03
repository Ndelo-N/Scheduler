// Simple in-app logger (mirrors monolith log panel behavior)
class SchedulerLogger {
  constructor(maxEntries = 200) {
    this.logs = [];
    this.maxEntries = maxEntries;
  }

  log(msg) {
    const entry = { message: String(msg), timestamp: new Date() };
    this.logs.push(entry);
    if (this.logs.length > this.maxEntries) {
      this.logs.shift();
    }
    if (window.APP_CONFIG && window.APP_CONFIG.debug) {
      console.log('[Scheduler]', msg);
    }
  }

  getRecent(count = 20) {
    return this.logs.slice(-count).reverse();
  }

  clear() {
    this.logs = [];
  }
}

window.SchedulerLogger = SchedulerLogger;
