// Student Shift Scheduler PWA - Database Setup Script
// Node.js script to set up PostgreSQL database

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const passwordHasher = require('./server/security/passwordHasher'); // scrypt (replaces sha256)

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'shift_scheduler',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

class DatabaseSetup {
  constructor() {
    this.pool = new Pool(dbConfig);
  }

  async connect() {
    try {
      const client = await this.pool.connect();
      console.log('✅ Connected to PostgreSQL database');
      return client;
    } catch (error) {
      console.error('❌ Failed to connect to database:', error.message);
      throw error;
    }
  }

  async createDatabase() {
    // Connect to postgres database to create the application database
    const adminConfig = {
      ...dbConfig,
      database: 'postgres'
    };
    
    const adminPool = new Pool(adminConfig);
    
    try {
      const client = await adminPool.connect();
      
      // Check if database exists
      const result = await client.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [dbConfig.database]
      );
      
      if (result.rows.length === 0) {
        // Create database
        await client.query(`CREATE DATABASE ${dbConfig.database}`);
        console.log(`✅ Created database: ${dbConfig.database}`);
      } else {
        console.log(`✅ Database already exists: ${dbConfig.database}`);
      }
      
      client.release();
    } catch (error) {
      console.error('❌ Failed to create database:', error.message);
      throw error;
    } finally {
      await adminPool.end();
    }
  }

  async runSchema() {
    try {
      const client = await this.connect();
      
      // Read and execute schema file
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      console.log('📄 Executing database schema...');
      await client.query(schema);
      console.log('✅ Database schema executed successfully');
      
      client.release();
    } catch (error) {
      console.error('❌ Failed to execute schema:', error.message);
      throw error;
    }
  }

  async seedData() {
    try {
      const client = await this.connect();
      
      console.log('🌱 Seeding initial data...');
      
      // Create default admin user
      const adminPassword = await this.hashPassword('admin123');
      await client.query(`
        INSERT INTO users (id, email, password_hash, role, first_name, last_name, is_active, email_verified, student_number, must_change_password)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (email) DO NOTHING
      `, [
        '00000000-0000-0000-0000-000000000001',
        'admin@scheduler.local',
        adminPassword,
        'admin',
        'System',
        'Administrator',
        true,
        true,
        null,   // admins sign in by email/SSO — no u-Number
        false   // seed/dev account: usable immediately (real accounts use provision.js)
      ]);
      
      // Create sample supervisor
      const supervisorPassword = await this.hashPassword('supervisor123');
      await client.query(`
        INSERT INTO users (id, email, password_hash, role, first_name, last_name, is_active, email_verified, student_number, must_change_password)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (email) DO NOTHING
      `, [
        '00000000-0000-0000-0000-000000000002',
        'supervisor@scheduler.local',
        supervisorPassword,
        'supervisor',
        'Jane',
        'Supervisor',
        true,
        true,
        null,
        false
      ]);
      
      // Create sample students
      const students = [
        {
          id: '00000000-0000-0000-0000-000000000003',
          email: 'student1@scheduler.local',
          student_number: 'u10000003',
          first_name: 'John',
          last_name: 'Student',
          monthly_hours: 40
        },
        {
          id: '00000000-0000-0000-0000-000000000004',
          email: 'student2@scheduler.local',
          student_number: 'u10000004',
          first_name: 'Sarah',
          last_name: 'Assistant',
          monthly_hours: 20
        },
        {
          id: '00000000-0000-0000-0000-000000000005',
          email: 'student3@scheduler.local',
          student_number: 'u10000005',
          first_name: 'Mike',
          last_name: 'Helper',
          monthly_hours: 60
        }
      ];
      
      for (const student of students) {
        const studentPassword = await this.hashPassword('student123');
        
        // Create user
        await client.query(`
          INSERT INTO users (id, email, password_hash, role, first_name, last_name, is_active, email_verified, student_number, must_change_password)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (email) DO NOTHING
        `, [
          student.id,
          student.email,
          studentPassword,
          'student',
          student.first_name,
          student.last_name,
          true,
          true,
          student.student_number,
          false
        ]);
        
        // Create contract
        await client.query(`
          INSERT INTO student_contracts (user_id, monthly_hours, contract_type, start_date, created_by)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT DO NOTHING
        `, [
          student.id,
          student.monthly_hours,
          `${student.monthly_hours}h Contract`,
          new Date().toISOString().split('T')[0],
          '00000000-0000-0000-0000-000000000001'
        ]);
      }
      
      console.log('✅ Initial data seeded successfully');
      client.release();
    } catch (error) {
      console.error('❌ Failed to seed data:', error.message);
      throw error;
    }
  }

  async hashPassword(password) {
    // scrypt (salted, memory-hard) via server/security/passwordHasher.
    // Replaces the previous crypto.createHash('sha256') — SHA-256 is fast and
    // unsalted, so a leaked users table would be trivially cracked.
    return passwordHasher.hash(password);
  }

  async testConnection() {
    try {
      const client = await this.connect();
      const result = await client.query('SELECT NOW() as current_time');
      console.log('✅ Database connection test successful:', result.rows[0].current_time);
      client.release();
      return true;
    } catch (error) {
      console.error('❌ Database connection test failed:', error.message);
      return false;
    }
  }

  async runMigrations() {
    try {
      const client = await this.connect();
      
      // Check if migrations table exists
      const migrationTableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'migrations'
        );
      `);
      
      if (!migrationTableExists.rows[0].exists) {
        // Create migrations table
        await client.query(`
          CREATE TABLE migrations (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(255) UNIQUE NOT NULL,
            executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        console.log('✅ Created migrations table');
      }
      
      // Run any pending migrations
      const migrationsDir = path.join(__dirname, 'migrations');
      if (fs.existsSync(migrationsDir)) {
        const migrationFiles = fs.readdirSync(migrationsDir)
          .filter(file => file.endsWith('.sql'))
          .sort();
        
        for (const file of migrationFiles) {
          const executed = await client.query(
            'SELECT 1 FROM migrations WHERE filename = $1',
            [file]
          );
          
          if (executed.rows.length === 0) {
            console.log(`📄 Running migration: ${file}`);
            const migration = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            await client.query(migration);
            await client.query(
              'INSERT INTO migrations (filename) VALUES ($1)',
              [file]
            );
            console.log(`✅ Migration completed: ${file}`);
          }
        }
      }
      
      client.release();
    } catch (error) {
      console.error('❌ Failed to run migrations:', error.message);
      throw error;
    }
  }

  async setup() {
    try {
      console.log('🚀 Starting database setup...');
      
      // Test connection first
      const connected = await this.testConnection();
      if (!connected) {
        console.log('📝 Creating database...');
        await this.createDatabase();
      }
      
      // Run schema
      await this.runSchema();
      
      // Run migrations
      await this.runMigrations();
      
      // Seed initial data
      await this.seedData();
      
      console.log('🎉 Database setup completed successfully!');
      
    } catch (error) {
      console.error('💥 Database setup failed:', error);
      throw error;
    } finally {
      await this.pool.end();
    }
  }
}

// CLI interface
if (require.main === module) {
  const setup = new DatabaseSetup();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'setup':
      setup.setup();
      break;
    case 'test':
      setup.testConnection();
      break;
    case 'schema':
      setup.runSchema();
      break;
    case 'seed':
      setup.seedData();
      break;
    case 'migrate':
      setup.runMigrations();
      break;
    default:
      console.log(`
Usage: node setup.js <command>

Commands:
  setup   - Complete database setup (schema + migrations + seed)
  test    - Test database connection
  schema  - Run schema only
  seed    - Seed initial data only
  migrate - Run migrations only

Environment Variables:
  DB_HOST     - Database host (default: localhost)
  DB_PORT     - Database port (default: 5432)
  DB_NAME     - Database name (default: shift_scheduler)
  DB_USER     - Database user (default: postgres)
  DB_PASSWORD - Database password (default: password)
      `);
  }
}

module.exports = DatabaseSetup;
