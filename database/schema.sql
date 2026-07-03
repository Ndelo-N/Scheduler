-- Student Shift Scheduler PWA - Database Schema
-- PostgreSQL Database Schema for Production
-- Version 1.0.0

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ===== USERS AND AUTHENTICATION =====

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('student', 'supervisor', 'admin')),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User sessions
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===== SCHEDULING CORE =====

-- Institutions/Organizations
CREATE TABLE institutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Schedules
CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, month, year)
);

-- Shifts
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    required_count INTEGER DEFAULT 1 CHECK (required_count > 0),
    shift_type VARCHAR(50) DEFAULT 'regular' CHECK (shift_type IN ('regular', 'test', 'special')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Shift assignments
CREATE TABLE shift_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'assigned' CHECK (status IN ('assigned', 'confirmed', 'completed', 'no_show')),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    UNIQUE(shift_id, user_id)
);

-- ===== STUDENT AVAILABILITY SYSTEM =====

-- Student availability
CREATE TABLE student_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL,
    availability_data JSONB NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Availability periods (parsed from availability_data)
CREATE TABLE availability_periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    availability_id UUID NOT NULL REFERENCES student_availability(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    type VARCHAR(50) DEFAULT 'available' CHECK (type IN ('available', 'unavailable', 'class')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Availability access control
CREATE TABLE availability_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    can_edit BOOLEAN DEFAULT false,
    granted_by UUID NOT NULL REFERENCES users(id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    reason TEXT
);

-- ===== STUDENT CONTRACT MANAGEMENT =====

-- Student contracts
CREATE TABLE student_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    monthly_hours INTEGER NOT NULL CHECK (monthly_hours > 0 AND monthly_hours <= 72),
    contract_type VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Contract history
CREATE TABLE contract_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES student_contracts(id) ON DELETE CASCADE,
    previous_hours INTEGER,
    new_hours INTEGER NOT NULL,
    changed_by UUID NOT NULL REFERENCES users(id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reason TEXT NOT NULL
);

-- Contract templates
CREATE TABLE contract_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    monthly_hours INTEGER NOT NULL CHECK (monthly_hours > 0),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id), -- NULL = system-provided template (F-15)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===== TEST PERIOD & ASSESSMENT MANAGEMENT =====

-- Test periods
CREATE TABLE test_periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    notification_days_before INTEGER DEFAULT 30,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'completed')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Student test dates
CREATE TABLE student_test_dates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    test_period_id UUID NOT NULL REFERENCES test_periods(id) ON DELETE CASCADE,
    test_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    subject VARCHAR(255),
    description TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Assessment schedules
CREATE TABLE assessment_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_period_id UUID NOT NULL REFERENCES test_periods(id) ON DELETE CASCADE,
    schedule_data JSONB NOT NULL,
    version INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'approved')),
    created_by UUID NOT NULL REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===== SWAP SYSTEM =====

-- Swap requests
CREATE TABLE swap_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Swap offers
CREATE TABLE swap_offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    swap_request_id UUID NOT NULL REFERENCES swap_requests(id) ON DELETE CASCADE,
    offerer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    offered_shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
    message TEXT,
    additional_compensation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Swap transactions
CREATE TABLE swap_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    swap_request_id UUID NOT NULL REFERENCES swap_requests(id) ON DELETE CASCADE,
    final_approver_id UUID REFERENCES users(id),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    swap_type VARCHAR(50) DEFAULT 'direct' CHECK (swap_type IN ('direct', 'multi_way', 'group')),
    notes TEXT
);

-- ===== NOTIFICATIONS =====

-- Notification queue
CREATE TABLE notification_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('email', 'sms', 'push', 'in_app')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===== AUDIT AND LOGGING =====

-- Audit log
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===== INDEXES FOR PERFORMANCE =====

-- User indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);

-- Session indexes
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(token);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);

-- Schedule indexes
CREATE INDEX idx_schedules_institution ON schedules(institution_id);
CREATE INDEX idx_schedules_month_year ON schedules(month, year);
CREATE INDEX idx_schedules_status ON schedules(status);

-- Shift indexes
CREATE INDEX idx_shifts_schedule ON shifts(schedule_id);
CREATE INDEX idx_shifts_date ON shifts(date);
CREATE INDEX idx_shifts_type ON shifts(shift_type);

-- Assignment indexes
CREATE INDEX idx_shift_assignments_shift ON shift_assignments(shift_id);
CREATE INDEX idx_shift_assignments_user ON shift_assignments(user_id);
CREATE INDEX idx_shift_assignments_status ON shift_assignments(status);

-- Availability indexes
CREATE INDEX idx_student_availability_user ON student_availability(user_id);
CREATE INDEX idx_student_availability_week ON student_availability(week_start_date);
CREATE INDEX idx_student_availability_status ON student_availability(status);

-- Contract indexes
CREATE INDEX idx_student_contracts_user ON student_contracts(user_id);
CREATE INDEX idx_student_contracts_status ON student_contracts(status);
CREATE INDEX idx_student_contracts_dates ON student_contracts(start_date, end_date);

-- Test period indexes
CREATE INDEX idx_test_periods_institution ON test_periods(institution_id);
CREATE INDEX idx_test_periods_dates ON test_periods(start_date, end_date);
CREATE INDEX idx_test_periods_status ON test_periods(status);

-- Swap indexes
CREATE INDEX idx_swap_requests_requester ON swap_requests(requester_id);
CREATE INDEX idx_swap_requests_shift ON swap_requests(shift_id);
CREATE INDEX idx_swap_requests_status ON swap_requests(status);
CREATE INDEX idx_swap_offers_request ON swap_offers(swap_request_id);
CREATE INDEX idx_swap_offers_offerer ON swap_offers(offerer_id);

-- Notification indexes
CREATE INDEX idx_notification_queue_user ON notification_queue(user_id);
CREATE INDEX idx_notification_queue_status ON notification_queue(status);
CREATE INDEX idx_notification_queue_scheduled ON notification_queue(scheduled_at);

-- Audit log indexes
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

-- ===== TRIGGERS FOR UPDATED_AT =====

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_institutions_updated_at BEFORE UPDATE ON institutions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON shifts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_student_availability_updated_at BEFORE UPDATE ON student_availability FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_student_contracts_updated_at BEFORE UPDATE ON student_contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contract_templates_updated_at BEFORE UPDATE ON contract_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_test_periods_updated_at BEFORE UPDATE ON test_periods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_student_test_dates_updated_at BEFORE UPDATE ON student_test_dates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_assessment_schedules_updated_at BEFORE UPDATE ON assessment_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_swap_requests_updated_at BEFORE UPDATE ON swap_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_swap_offers_updated_at BEFORE UPDATE ON swap_offers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== INITIAL DATA =====

-- Insert default institution
INSERT INTO institutions (id, name, domain, settings) VALUES 
('00000000-0000-0000-0000-000000000001', 'University of Pretoria', 'up.ac.za', '{"timezone": "Africa/Johannesburg", "default_operational_hours": {"start": "06:00", "end": "19:00"}}');

-- Insert default contract templates (system-provided: created_by NULL, F-15)
INSERT INTO contract_templates (name, monthly_hours, description, created_by) VALUES 
('Part-time (20h)', 20, 'Part-time student assistant contract', NULL),
('Standard (40h)', 40, 'Standard student assistant contract', NULL),
('Full-time (60h)', 60, 'Full-time student assistant contract', NULL),
('Maximum (72h)', 72, 'Maximum student assistant contract', NULL);

-- ===== VIEWS FOR COMMON QUERIES =====

-- Active user view
CREATE VIEW active_users AS
SELECT u.*, 
       sc.monthly_hours,
       sc.contract_type,
       sc.status as contract_status
FROM users u
LEFT JOIN student_contracts sc ON u.id = sc.user_id AND sc.status = 'active'
WHERE u.is_active = true;

-- Current schedule view
CREATE VIEW current_schedule AS
SELECT s.*, 
       i.name as institution_name,
       u.first_name || ' ' || u.last_name as created_by_name
FROM schedules s
JOIN institutions i ON s.institution_id = i.id
JOIN users u ON s.created_by = u.id
WHERE s.status = 'published'
ORDER BY s.year DESC, s.month DESC;

-- Shift assignments with user details
CREATE VIEW shift_assignments_detailed AS
SELECT sa.*,
       s.date,
       s.start_time,
       s.end_time,
       s.shift_type,
       u.first_name,
       u.last_name,
       u.email,
       u.avatar_url
FROM shift_assignments sa
JOIN shifts s ON sa.shift_id = s.id
JOIN users u ON sa.user_id = u.id;

-- ===== ROW LEVEL SECURITY (RLS) — F-07 =====
-- STATUS: schema-correct and fail-closed, NOT YET ACTIVE for the app.
-- The app currently connects as a superuser/owner, which bypasses RLS; the
-- enforced access control today is the app-layer requireAuth/requireSelfOrRole.
-- ACTIVATION CHECKLIST (Step 2.6b — do all four together):
--   1. Create a login role:  CREATE ROLE scheduler_app LOGIN PASSWORD '...';
--                            GRANT authenticated TO scheduler_app;
--      plus the GRANTs at the bottom of this file.
--   2. Point DB_USER/DATABASE_URL at scheduler_app (never postgres).
--   3. App DB layer: on every request transaction, inject identity:
--        SET LOCAL app.user_id  = '<uuid of authenticated user>';
--        SET LOCAL app.user_role = '<student|supervisor|admin>';
--      (SET LOCAL scopes to the transaction — mandatory with a connection pool.)
--   4. Run tests/rls.smoke.sql against a staging DB.
-- FAIL-CLOSED PROPERTY: if the app forgets to SET LOCAL, current_user_id()
-- returns NULL, every USING/WITH CHECK comparison is not-true, and zero rows
-- are visible/writable. Misconfiguration denies, never exposes.

-- Policy target role (NOLOGIN group role; idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

-- Identity of the application-level user for this transaction (NULL if unset)
CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

-- Role of the application-level user for this transaction (NULL if unset)
CREATE OR REPLACE FUNCTION current_user_role() RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_role', true), '');
$$;

-- Enable RLS on sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_test_dates ENABLE ROW LEVEL SECURITY;

-- Own-row access for students; admin/supervisor see all (mirrors the
-- app-layer requireSelfOrRole('admin','supervisor') contract).
-- WITH CHECK mirrors USING so users cannot INSERT/UPDATE rows they could not read.
DROP POLICY IF EXISTS users_own_data ON users;
CREATE POLICY users_own_data ON users FOR ALL TO authenticated
  USING (id = current_user_id() OR current_user_role() IN ('admin', 'supervisor'))
  WITH CHECK (id = current_user_id() OR current_user_role() IN ('admin', 'supervisor'));

DROP POLICY IF EXISTS sessions_own_data ON user_sessions;
CREATE POLICY sessions_own_data ON user_sessions FOR ALL TO authenticated
  USING (user_id = current_user_id() OR current_user_role() IN ('admin', 'supervisor'))
  WITH CHECK (user_id = current_user_id() OR current_user_role() IN ('admin', 'supervisor'));

DROP POLICY IF EXISTS availability_own_data ON student_availability;
CREATE POLICY availability_own_data ON student_availability FOR ALL TO authenticated
  USING (user_id = current_user_id() OR current_user_role() IN ('admin', 'supervisor'))
  WITH CHECK (user_id = current_user_id() OR current_user_role() IN ('admin', 'supervisor'));

DROP POLICY IF EXISTS contracts_own_data ON student_contracts;
CREATE POLICY contracts_own_data ON student_contracts FOR ALL TO authenticated
  USING (user_id = current_user_id() OR current_user_role() IN ('admin', 'supervisor'))
  WITH CHECK (user_id = current_user_id() OR current_user_role() IN ('admin', 'supervisor'));

DROP POLICY IF EXISTS test_dates_own_data ON student_test_dates;
CREATE POLICY test_dates_own_data ON student_test_dates FOR ALL TO authenticated
  USING (user_id = current_user_id() OR current_user_role() IN ('admin', 'supervisor'))
  WITH CHECK (user_id = current_user_id() OR current_user_role() IN ('admin', 'supervisor'));

-- ===== COMMENTS =====

COMMENT ON TABLE users IS 'User accounts for students, supervisors, and admins';
COMMENT ON TABLE schedules IS 'Monthly schedules for each institution';
COMMENT ON TABLE shifts IS 'Individual shifts within schedules';
COMMENT ON TABLE shift_assignments IS 'Student assignments to shifts';
COMMENT ON TABLE student_availability IS 'Student availability submissions';
COMMENT ON TABLE student_contracts IS 'Individual student contract assignments';
COMMENT ON TABLE swap_requests IS 'Student-initiated shift swap requests';
COMMENT ON TABLE notification_queue IS 'Queued notifications for delivery';
COMMENT ON TABLE audit_log IS 'Audit trail for all system changes';

-- ===== GRANTS =====

-- Create application user (adjust as needed for your setup)
-- CREATE USER scheduler_app WITH PASSWORD 'your_secure_password';
-- GRANT CONNECT ON DATABASE scheduler_db TO scheduler_app;
-- GRANT USAGE ON SCHEMA public TO scheduler_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO scheduler_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO scheduler_app;
