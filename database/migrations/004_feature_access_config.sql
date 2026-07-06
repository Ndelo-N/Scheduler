-- 004_feature_access_config.sql
-- Shared PWA feature-access overrides (admin-editable; all roles read on login).

CREATE TABLE IF NOT EXISTS feature_access_config (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO feature_access_config (id, overrides)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE feature_access_config IS 'Singleton row: admin overrides for student/team-lead PWA feature visibility';
