-- migrations/003_team_lead_role.sql
-- Rename supervisor role → team-lead (display: Team-Lead).

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE users SET role = 'team-lead' WHERE role = 'supervisor';

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('student', 'team-lead', 'admin'));

-- RLS policies: replace supervisor with team-lead
DROP POLICY IF EXISTS users_own_data ON users;
CREATE POLICY users_own_data ON users FOR ALL TO authenticated
  USING (id = current_user_id() OR current_user_role() IN ('admin', 'team-lead'))
  WITH CHECK (id = current_user_id() OR current_user_role() IN ('admin', 'team-lead'));

DROP POLICY IF EXISTS sessions_own_data ON user_sessions;
CREATE POLICY sessions_own_data ON user_sessions FOR ALL TO authenticated
  USING (user_id = current_user_id() OR current_user_role() IN ('admin', 'team-lead'))
  WITH CHECK (user_id = current_user_id() OR current_user_role() IN ('admin', 'team-lead'));

DROP POLICY IF EXISTS availability_own_data ON student_availability;
CREATE POLICY availability_own_data ON student_availability FOR ALL TO authenticated
  USING (user_id = current_user_id() OR current_user_role() IN ('admin', 'team-lead'))
  WITH CHECK (user_id = current_user_id() OR current_user_role() IN ('admin', 'team-lead'));

DROP POLICY IF EXISTS contracts_own_data ON student_contracts;
CREATE POLICY contracts_own_data ON student_contracts FOR ALL TO authenticated
  USING (user_id = current_user_id() OR current_user_role() IN ('admin', 'team-lead'))
  WITH CHECK (user_id = current_user_id() OR current_user_role() IN ('admin', 'team-lead'));

DROP POLICY IF EXISTS test_dates_own_data ON student_test_dates;
CREATE POLICY test_dates_own_data ON student_test_dates FOR ALL TO authenticated
  USING (user_id = current_user_id() OR current_user_role() IN ('admin', 'team-lead'))
  WITH CHECK (user_id = current_user_id() OR current_user_role() IN ('admin', 'team-lead'));

DROP POLICY IF EXISTS notification_prefs_own_data ON notification_preferences;
CREATE POLICY notification_prefs_own_data ON notification_preferences FOR ALL TO authenticated
  USING (user_id = current_user_id() OR current_user_role() IN ('admin', 'team-lead'))
  WITH CHECK (user_id = current_user_id() OR current_user_role() IN ('admin', 'team-lead'));
