# Student Shift Scheduler — System Installation Guide

This guide walks you through a **verified** installation: every requirement has a check command, and each phase ends with a confirmation step before you continue.

The project supports **two run modes**. Pick the one you need:


| Mode                                      | What you get                                                      | Requires Postgres? |
| ----------------------------------------- | ----------------------------------------------------------------- | ------------------ |
| **A — Offline PWA**                       | Scheduling, swaps, worked-hours ledger in the browser (IndexedDB) | No                 |
| **B — Auth server (recommended for lab)** | Same PWA + login, sessions, account provisioning                  | **Yes**            |


Most lab and integration work uses **Mode B**. Mode A is useful when you only need the offline scheduler without sign-in.

---



## 1. Requirements checklist

Confirm each item before installing. Run the **Verify** command in PowerShell from any directory.


| #   | Requirement                      | Minimum                           | Verify                         | Expected                              |
| --- | -------------------------------- | --------------------------------- | ------------------------------ | ------------------------------------- |
| 1   | **Node.js**                      | 18.x                              | `node -v`                      | `v18.x` or higher (e.g. `v22.19.0`)   |
| 2   | **npm**                          | 8.x                               | `npm -v`                       | `8.x` or higher (e.g. `10.9.3`)       |
| 3   | **Git**                          | 2.x                               | `git --version`                | `git version 2.x`                     |
| 4   | **PostgreSQL** (Mode B only)     | 12.x                              | `psql --version`               | `psql (PostgreSQL) 12+`               |
| 5   | **Modern browser**               | Chrome 80+, Edge 80+, Firefox 75+ | —                              | PWA + service worker supported        |
| 6   | **Disk space**                   | ~500 MB                           | —                              | For `node_modules` + database         |
| 7   | **Port 3000** free (Mode B)      | —                                 | `netstat -ano | findstr :3000` | No listener (or stop conflicting app) |
| 8   | **Port 8080** free (Mode A only) | —                                 | `netstat -ano | findstr :8080` | No listener                           |


**Your machine (last checked):** Node and npm are OK. PostgreSQL CLI (`psql`) was **not** on PATH — install Postgres before Mode B (Section 3).

---



## 2. Get the project

```powershell
cd "c:\PW\Student Scheduler PWA"
```

If cloning fresh:

```powershell
git clone https://github.com/up-ac-za/student-shift-scheduler-pwa.git
cd student-shift-scheduler-pwa
```

**Confirm:** `Test-Path package.json` → `True`

---



## 3. Install PostgreSQL (Mode B only)

Skip this section for **Mode A (offline only)**.

### Windows

1. Download the installer from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/) (16.x is fine).
2. During setup, note:
  - **Port:** `5432` (default)
  - **Superuser password:** choose one and remember it (used as `DB_PASSWORD` in `.env`)
3. Ensure **“Command Line Tools”** is selected so `psql` is on PATH.
4. Restart PowerShell, then verify:

```powershell
psql --version
```



### Create database (optional — `npm run db:setup`  can create it)

```powershell
psql -U postgres -c "SELECT version();"
```

If that works, Postgres is ready.

**Confirm:** `psql --version` prints a version ≥ 12.

---



## 4. Install Node dependencies

From the project root:

```powershell
cd "c:\PW\Student Scheduler PWA"
npm install
```

**Confirm:**

```powershell
Test-Path node_modules
```

→ `True`

---



## 5. Configure environment (Mode B)

Copy the example env file and edit credentials:

```powershell
Copy-Item .env.example .env
notepad .env
```

Minimum settings for **local HTTP development**:

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=shift_scheduler
DB_USER=postgres
DB_PASSWORD=your_postgres_password_here

# Required for login cookies on plain http://localhost (no TLS)
AUTH_INSECURE_COOKIES=1

SESSION_TTL_MS=43200000
LOG_LEVEL=info
```


| Variable                  | Purpose                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `DB_*`                    | PostgreSQL connection (required for `npm start`)                 |
| `AUTH_INSECURE_COOKIES=1` | Allows session cookies over HTTP on localhost                    |
| `PWA_DIR`                 | Optional; default serves PWA from repo root                      |
| `TLS_KEY` / `TLS_CERT`    | Production/lab HTTPS — see `Documentation/Brick7_TLS_Runbook.md` |


**Do not add** `JWT_SECRET` — auth uses **httpOnly cookies + scrypt**, not JWT (see `Documentation/Phase11_Aligned_Plan.md`).

**Confirm:** `Test-Path .env` → `True`

---



## 6. Initialize the database (Mode B)

```powershell
npm run db:setup
```

This will:

1. Connect to Postgres (create `shift_scheduler` DB if missing)
2. Run `database/schema.sql` (20 base tables)
3. Run migrations in `database/migrations/` (`001_auth_hardening.sql`, `002_notification_preferences.sql`, …)
4. Seed baseline reference data

**Confirm — connection test:**

```powershell
npm run db:test
```

Expected: `✅ Database connection test successful:` with a timestamp.

**Confirm — migrations applied:**

```powershell
psql -U postgres -d shift_scheduler -c "SELECT filename, executed_at FROM migrations ORDER BY id;"
```

You should see at least `001_auth_hardening.sql`.

---



## 7. Provision user accounts (Mode B)

Accounts are created by an admin via CLI — there is no public self-registration.

### Admin account

```powershell
npm run provision -- - admin@lab.local admin "Lab Admin"
```

Save the **temporary password** printed in the terminal. The user must change it on first login.

### Test student (matches worked-hours harness fixture)

```powershell
npm run provision:test-student
```

Defaults: u-number `u11111111`, name Alice Anderson. Override with env vars `TEST_STUDENT_UNUMBER`, `TEST_STUDENT_EMAIL`, `TEST_STUDENT_NAME`.

### Custom student

```powershell
npm run provision -- u12345678 u12345678@up.ac.za student "Thabo Mokoena"
```

**Confirm:** CLI prints `✅ Provisioned ...` and a temporary password.

---



## 8. Start the system



### Mode B — Auth server + PWA (single origin)

```powershell
npm run start:server
```

Expected console output:

```
Auth server on :3000 (HTTP — set AUTH_INSECURE_COOKIES=1 for cookie login on plain HTTP)
PWA static root: ...
Health: http://localhost:3000/api/health
```

Open in browser: **[http://localhost:3000](http://localhost:3000)**

- Auth gate appears automatically (detected via `/api/health`)
- Sign in with u-number + temp password
- Forced password change on first login
- Header avatar → **Sign out** when logged in

For auto-restart during development:

```powershell
npm run dev:server
```



### Mode A — Offline PWA only

No `.env` or Postgres required.

```powershell
npm run serve
```

Open: **[http://localhost:8080](http://localhost:8080)**

- No login screen (auth auto-detect fails without `/api/health`)
- Data lives in browser IndexedDB

**Confirm — health (Mode B):**

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Expected JSON: `status: ok`, `db: postgres`.

---



## 9. Verify the full installation

Run these after Mode B is up. All should pass before you consider the system installed.

### Automated tests

```powershell
npm run test:server    # Auth + health routes (Jest)
npm run test:smoke     # Payroll parser, identity map, roster, reconcile
npm run harness:hours  # Worked-hours ledger harness (33 checks)
```


| Command         | Expected                |
| --------------- | ----------------------- |
| `test:server`   | All tests pass (5/5)    |
| `test:smoke`    | 96 assertions, 0 failed |
| `harness:hours` | 33/33                   |




### Manual browser checks (Mode B)


| Step | Action                                              | Pass if                        |
| ---- | --------------------------------------------------- | ------------------------------ |
| 1    | Open [http://localhost:3000](http://localhost:3000) | Login overlay shown            |
| 2    | Sign in with provisioned u-number                   | App loads (dashboard visible)  |
| 3    | First login                                         | Change-password screen appears |
| 4    | Set new password                                    | Dashboard loads                |
| 5    | Click header avatar → Sign out                      | Login overlay returns          |
| 6    | DevTools → Application → Service Worker             | Registered (offline capable)   |




### Manual checks (Mode A)


| Step | Action                                              | Pass if                             |
| ---- | --------------------------------------------------- | ----------------------------------- |
| 1    | Open [http://localhost:8080](http://localhost:8080) | App loads without login             |
| 2    | Students → Load sample / import                     | Data appears                        |
| 3    | Disconnect network                                  | App still navigable (cached assets) |


---



## 10. Installation confirmed — final checklist

Tick when complete:

- [ ] Node ≥ 18 and npm ≥ 8 verified
- [ ] `npm install` completed (`node_modules` exists)
- [ ] **(Mode B)** PostgreSQL installed and `psql` on PATH
- [ ] **(Mode B)** `.env` created from `.env.example` with correct `DB_PASSWORD`
- [ ] **(Mode B)** `AUTH_INSECURE_COOKIES=1` set for localhost HTTP
- [ ] **(Mode B)** `npm run db:setup` succeeded
- [ ] **(Mode B)** `npm run db:test` succeeds
- [ ] **(Mode B)** At least one account provisioned
- [ ] **(Mode B)** `npm run start:server` running; `/api/health` returns `ok`
- [ ] **(Mode B)** Login, password change, and logout work in browser
- [ ] `npm run test:smoke` passes
- [ ] **(Optional)** `npm run harness:hours` passes

When every applicable box is checked, the system installation is **confirmed**.

---



## 11. npm scripts reference


| Script                               | Purpose                                   |
| ------------------------------------ | ----------------------------------------- |
| `npm start` / `npm run start:server` | Start auth server + serve PWA             |
| `npm run dev:server`                 | Same with nodemon (auto-restart)          |
| `npm run serve`                      | Offline PWA only on port 8080             |
| `npm run db:setup`                   | Full DB init (schema + migrations + seed) |
| `npm run db:test`                    | Test Postgres connection                  |
| `npm run db:migrate`                 | Run pending migrations only               |
| `npm run provision`                  | Create/reset a user account               |
| `npm run provision:test-student`     | Create harness-aligned test student       |
| `npm run test:smoke`                 | Core pipeline smoke tests                 |
| `npm run harness:hours`              | Worked-hours regression harness           |
| `npm run test:server`                | Server/auth unit tests                    |
| `npm run build`                      | Production CSS/JS build                   |


---



## 12. Troubleshooting



### `psql` is not recognized (Windows)

PostgreSQL is not installed or not on PATH. Re-run the installer with command-line tools, or add `C:\Program Files\PostgreSQL\16\bin` to your user PATH, then restart PowerShell.

### `Server failed to start: connect ECONNREFUSED`

Postgres is not running. On Windows: Services → start **postgresql-x64-16** (name may vary).

### `password authentication failed for user "postgres"`

`DB_PASSWORD` in `.env` does not match the Postgres superuser password.

### Login works on HTTPS lab but not on `http://localhost`

Set `AUTH_INSECURE_COOKIES=1` in `.env` and restart the server. Without TLS, cookies need this flag.

### Login overlay never appears (offline mode when you wanted auth)

You are probably on `npm run serve` (port 8080) instead of `npm run start:server` (port 3000). The auth gate auto-detects the server via `/api/health` on the same origin.

### `npm run db:setup` fails on schema (relation already exists)

Database was partially set up. For a **dev reset** (destroys data):

```powershell
psql -U postgres -c "DROP DATABASE IF EXISTS shift_scheduler;"
npm run db:setup
```



### PWA install button missing

Install prompts require HTTPS in production. On localhost, use Chrome/Edge and check DevTools → Application → Manifest for errors.

### Provision fails: `student accounts require a u-Number`

Students must include a u-number: `npm run provision -- u12345678 email@lab student "Name"`.

---



## 13. Production / UP deployment pointers

- **TLS:** `Documentation/Brick7_TLS_Runbook.md`
- **Auth architecture:** `Documentation/Phase11_Aligned_Plan.md`
- **DB TLS:** set `DB_CA_CERT` in production (see `.env.example`)
- **Reverse proxy:** set `TRUST_PROXY=1` when behind UP infrastructure
- Remove `AUTH_INSECURE_COOKIES` in production (cookies require Secure + HTTPS)

---



## 14. Related documentation


| Document                                     | Contents                                                      |
| -------------------------------------------- | ------------------------------------------------------------- |
| `README.md`                                  | Feature overview                                              |
| `PHASE1_SETUP_GUIDE.md`                      | Historical Phase 1 notes (partially superseded by this guide) |
| `IMPLEMENTATION_GUIDE.md`                    | Full development roadmap (Phases 0–15)                        |
| `Documentation/Worked_Hours_Feature_Spec.md` | Payroll / worked-hours pipeline                               |
| `Documentation/Brick7_TLS_Runbook.md`        | HTTPS lab setup                                               |


---

*Last updated for Rev1 auth server (cookie sessions, scrypt, Postgres required for* `npm start`*).*