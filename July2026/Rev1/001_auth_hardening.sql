-- migrations/001_auth_hardening.sql
-- Additive auth hardening for the users table. Adds:
--   • student_number        — the u-Number, the login handle (unique, stored lowercase)
--   • failed_login_attempts — brute-force counter
--   • locked_until          — temporary lockout timestamp (backoff after N failures)
--   • must_change_password  — set true when an admin provisions a temp password
--   • password_changed_at   — audit of last self-set password
--
-- Every change is additive; nothing existing is altered or dropped. Reversal is
-- listed at the bottom. Run via: node setup.js migrate

ALTER TABLE users ADD COLUMN IF NOT EXISTS student_number        VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until          TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at   TIMESTAMP WITH TIME ZONE;

-- u-Number is the login handle. A UNIQUE constraint lets non-student rows keep a
-- NULL student_number (Postgres treats NULLs as distinct) while guaranteeing one
-- account per u-Number. The constraint also provides the lookup index used by the
-- `WHERE student_number = $1` login query.
ALTER TABLE users ADD CONSTRAINT uq_users_student_number UNIQUE (student_number);

-- Reversal (manual):
--   ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_student_number;
--   ALTER TABLE users
--     DROP COLUMN IF EXISTS student_number,
--     DROP COLUMN IF EXISTS failed_login_attempts,
--     DROP COLUMN IF EXISTS locked_until,
--     DROP COLUMN IF EXISTS must_change_password,
--     DROP COLUMN IF EXISTS password_changed_at;
