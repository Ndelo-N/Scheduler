-- 002_notification_preferences.sql — F-14
-- Persist per-user notification preferences (previously in-memory, lost on restart).
-- Idempotent: safe to run on an existing database.

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_prefs_own_data ON notification_preferences;
CREATE POLICY notif_prefs_own_data ON notification_preferences FOR ALL TO authenticated
  USING (user_id = current_user_id() OR current_user_role() IN ('admin', 'supervisor'))
  WITH CHECK (user_id = current_user_id() OR current_user_role() IN ('admin', 'supervisor'));
