'use strict';

const { Pool } = require('pg');
const MemoryDatabase = require('./memory');
const Logger = require('../utils/logger');

class DatabaseManager {
  constructor(options = {}) {
    this.mode = options.mode || process.env.DB_MODE || 'memory';
    this.pool = null;
    this.memory = null;
  }

  async connect() {
    if (this.mode === 'postgres') {
      await this._connectPostgres();
    } else {
      this.memory = new MemoryDatabase();
      await this.memory.connect();
      Logger.info('Database connected (memory mode)');
    }
    return this;
  }

  async _connectPostgres() {
    const connectionString = process.env.DATABASE_URL;
    const config = connectionString
      ? { connectionString }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: Number(process.env.DB_PORT || 5432),
          database: process.env.DB_NAME || 'shift_scheduler',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'password',
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        };

    this.pool = new Pool(config);
    await this.pool.query('SELECT 1');
    Logger.info('Database connected (postgres mode)');
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    if (this.memory) {
      await this.memory.disconnect();
      this.memory = null;
    }
  }

  isConnected() {
    if (this.mode === 'postgres') {
      return Boolean(this.pool);
    }
    return Boolean(this.memory?.isConnected());
  }

  get activeMode() {
    return this.mode === 'postgres' ? 'postgres' : 'memory';
  }

  async query(text, params) {
    if (this.mode === 'postgres') {
      if (!this.pool) {
        throw new Error('Postgres pool is not connected');
      }
      return this.pool.query(text, params);
    }
    return this.memory.query(text, params);
  }

  /** Expose memory tables in tests / future services */
  getMemoryTable(name) {
    if (!this.memory) {
      throw new Error('Memory database is not active');
    }
    return this.memory.table(name);
  }
}

module.exports = DatabaseManager;
