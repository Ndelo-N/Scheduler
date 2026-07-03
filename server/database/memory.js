'use strict';

/**
 * In-memory database for DB_MODE=memory (Phase 11.0 local dev without Postgres).
 * Tables are plain arrays; query() supports a minimal SQL subset for health checks.
 */
class MemoryDatabase {
  constructor() {
    this.tables = Object.create(null);
    this.connected = false;
  }

  async connect() {
    this.connected = true;
    return this;
  }

  async disconnect() {
    this.connected = false;
  }

  isConnected() {
    return this.connected;
  }

  get mode() {
    return 'memory';
  }

  /**
   * Minimal query shim — enough for `SELECT 1` health probes.
   * Full CRUD comes in Phase 11.1+ services.
   */
  async query(text, params = []) {
    if (!this.connected) {
      throw new Error('Memory database is not connected');
    }

    const sql = String(text).trim().toLowerCase();

    if (sql === 'select 1' || sql.startsWith('select 1 ')) {
      return { rows: [{ ok: 1 }], rowCount: 1 };
    }

    if (sql.startsWith('select version(')) {
      return { rows: [{ version: 'memory-11.0' }], rowCount: 1 };
    }

    throw new Error(`MemoryDatabase: unsupported query in Phase 11.0 — ${text}`);
  }

  /** Test / service helper — not part of pg interface */
  table(name) {
    if (!this.tables[name]) {
      this.tables[name] = [];
    }
    return this.tables[name];
  }
}

module.exports = MemoryDatabase;
