-- rls.smoke.sql — F-07 RLS enforcement gauntlet. Run against a STAGING db only
-- (creates probe users/role):  psql -d <staging_db> -f tests/rls.smoke.sql
-- Expected: P2=2, P4=0, P3=1(Alice)+UPDATE 0+RLS error on insert, P5=2.
\set ON_ERROR_STOP off

-- ── Setup: two students + a login role that is a member of authenticated ──
INSERT INTO users (id, email, password_hash, role, first_name, last_name) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','a@up.ac.za','x','student','Alice','A'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b@up.ac.za','x','student','Bob','B');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rls_probe') THEN
    CREATE ROLE rls_probe LOGIN PASSWORD 'probe';
  END IF;
END $$;
GRANT authenticated TO rls_probe;
GRANT USAGE ON SCHEMA public TO rls_probe;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rls_probe;

-- ── PROPERTY 2: superuser (today's app) still sees everything ──
\echo '=== P2: superuser sees both students (expect 2) ==='
SELECT count(*) AS superuser_sees FROM users WHERE role='student';

-- ── Switch to the non-superuser probe role ──
SET ROLE rls_probe;

-- ── PROPERTY 4 first: identity UNSET → fail closed (expect 0) ──
\echo '=== P4: probe with NO app.user_id set (expect 0 rows) ==='
SELECT count(*) AS unset_sees FROM users;

-- ── PROPERTY 3: identity = Alice → sees only Alice (expect 1 / Alice) ──
\echo '=== P3: probe AS Alice (expect 1, and it is Alice) ==='
BEGIN;
SET LOCAL app.user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
SET LOCAL app.user_role = 'student';
SELECT count(*) AS alice_sees FROM users;
SELECT first_name FROM users;
-- P3b: Alice cannot UPDATE Bob (expect UPDATE 0)
UPDATE users SET phone='0820000000' WHERE id='bbbbbbbb-0000-0000-0000-000000000002';
-- P3c: WITH CHECK — Alice cannot INSERT a row owned by someone else (expect ERROR)
INSERT INTO users (id,email,password_hash,role,first_name,last_name)
 VALUES ('cccccccc-0000-0000-0000-000000000003','c@up.ac.za','x','student','Carol','C');
COMMIT;

-- ── PROPERTY 5: admin role sees all (expect 2) ──
\echo '=== P5: probe AS admin (expect 2) ==='
BEGIN;
SET LOCAL app.user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
SET LOCAL app.user_role = 'admin';
SELECT count(*) AS admin_sees FROM users WHERE role='student';
COMMIT;

RESET ROLE;
\echo '=== gauntlet complete ==='
