# Phase 11 — Aligned Plan (reconciled with bricks 1–5 and `schema.sql`)

This supersedes the original Phase 11 plan **where they conflict**. Everything the
original got right (mapper layer, optimistic concurrency, offline-first + opt-in
sync, `_stub.js` factory, route order) still stands. The changes below exist
because the original was written without knowledge of the auth work already built
and verified, and without accounting for what `schema.sql` already defines.

---

## A. Locked auth architecture (Cursor MUST follow this)

Bricks 1–5 already implement authentication + authorization, verified against an
in-memory Postgres over real HTTP. The approach is **not** the JWT/bcrypt/Bearer
design in the original 11.1. Do not regenerate that — it would reintroduce the
F-12 XSS finding (token in `localStorage`).

**In force:**
- Password hashing: **scrypt** via Node's built-in `crypto` (`server/security/passwordHasher.js`). No bcrypt, no native build.
- Sessions: **server-side, opaque token in `user_sessions`**, only the token's SHA-256 hash stored; the raw token lives in an **httpOnly + Secure + SameSite=Lax, host-only cookie** (`server/security/sessionStore.js`). No JWT, no Bearer header, no `localStorage`.
- Login handle: the `users.student_number` column (u-Number for students; an assigned handle for staff).
- Transport/origin: **same-origin** — the PWA and the API are served from the same `scheduler.local` origin, so there is **no CORS** and no `CLIENT_URL`. (This also means `api.js` uses `credentials:'include'`, not a Bearer header.)

**Do NOT:** add `JWT_SECRET`, issue Bearer tokens, store tokens in `localStorage`, add a bcrypt dependency, or enable cross-origin CORS.

---

## B. Already built & verified (maps onto the original milestones)

| Original milestone | Status | Delivered files |
|---|---|---|
| 11.1 Auth & users | **Substantially DONE** (corrected approach) | `server/security/{passwordHasher,credentialVerifier,sessionStore,loginService,authMiddleware,cookies}.js`, `server/rateLimit.js`, `server/routes/auth.js`, `server/routes/protected.js`, `server/app.js`, `provision.js`, `migrations/001_auth_hardening.sql` |
| — login / logout / me | DONE (brick 3) | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` — cookie session, lockout, rate limit |
| — change password | DONE (brick 5) | `POST /api/auth/change-password` — verify current, rotate hash, clear must-change, revoke other sessions |
| — requireRole / object-level authz | DONE (brick 4) | `requireAuth`, `requireRole`, `requireSelfOrRole` (IDOR guard), `enforcePasswordChange` |
| — admin user provisioning | DONE (brick 2) | `provision.js` (temp password + forced change) |

**Remaining in the auth milestone:** a `users` admin router (`GET /`, `GET /:id`,
`PUT /:id` for admin/supervisor) — `server/routes/protected.js` currently has a
`GET /api/admin/users` example to extend. **`POST /refresh` is not needed** —
sliding-expiry server sessions replace refresh tokens.

---

## C. Migration reconciliation (the big simplification)

`schema.sql` already `CREATE`s all 20 base tables (users, user_sessions,
institutions, schedules, shifts, shift_assignments, student_availability,
availability_periods, availability_access, student_contracts, contract_history,
contract_templates, test_periods, student_test_dates, assessment_schedules,
swap_requests, swap_offers, swap_transactions, notification_queue, audit_log).
`setup.js` already runs **schema.sql first, then `migrations/*.sql`**.

So: **schema.sql is the source of truth for base structure; the `migrations/`
folder is for ADDITIVE deltas only.** The original plan's 002–007 "create
scheduling/availability/contracts/swaps/notifications" migrations are redundant —
those tables already exist. The genuinely missing pieces (verified by grep):

| Migration | Why | Notes |
|---|---|---|
| `001_auth_hardening.sql` | **DONE** | `student_number` (0 hits in schema), lockout, must-change on `users` |
| `002_optimistic_concurrency.sql` | 409 conflict support | `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;` (idempotent — safe whether or not it already exists) |
| `003_notification_preferences.sql` | `notification_preferences` is **absent** (0 hits) | `notification_preferences(user_id, prefs JSONB, ...)` — fixes the live `notifications.js` caller |
| `004_time_entries.sql` *(optional, 11.6)* | `time_entries` is **absent** (0 hits) | only if payroll moves server-side; 11.6 is sync-only/deferred |
| student profile extras / swap_debts | map first | `color`/`weekly_max_hours` may map to existing columns via the mappers; derive swap_debts from approved swaps rather than a new table |

**One migration runner, not two.** `setup.js` already tracks applied migrations in
a `migrations` table. Do **not** add `database/migrate.js` with a separate
`schema_migrations` table (original 8.4) — extend the existing runner. `run via:
node setup.js migrate`.

---

## D. Corrections to specific original items

- **11.0 boot skeleton** (you built this in Cursor): keep it, but the app must mount auth the way `server/app.js` already does — `app.use('/api/auth', createAuthRouter(pool))` **before** `app.use('/api', requireAuth(pool), enforcePasswordChange, protectedRouter)`, then static, then 404. Reconcile your 11.0 `index.js`/`app.js` with the delivered `server/app.js` (the delivered one is the auth-aware version).
- **11.1** → reframed from "build JWT auth" to "integrate the existing cookie/scrypt auth" (see §B). `api.js` edits (orig 1.10, 7.4): switch to `credentials:'include'` cookies, not Bearer.
- **8.8 static serving** → **security fix.** `express.static('.')` from the repo root would serve `.env` (DB password!), `.git/`, `server/`, `database/`, and all source to any LAN client. Serve a **scoped** directory only (e.g. `public/` or a built `dist/`); keep `.env`, `server/`, `database/` outside it.
- **CORS** → removed; same-origin (§A). Drop `CLIENT_URL` and the CORS middleware.
- **11.6 parser extraction** → do **not** `vm`-load the browser `PayrollParser`, and do not port it in a way that risks the golden-master worked-hours harness. 11.6 is optional/sync-only; if server-side parsing is ever needed, write a thin Node-native parser. Keep the browser parser authoritative.
- **CSP (8.8)** → externalize `index.html`'s inline scripts so a strict CSP can ship (no `unsafe-inline`); relevant now that sessions exist.

---

## E. Revised remaining work order

```
[DONE] Auth foundation (bricks 1–5): hashing, sessions, login/logout/me,
       change-password, role + object-level authz, provisioning, 001 migration
  ↓
Brick 6  Client wiring: api.js → cookies; PWA login gate + must-change redirect; 401/403 handling
  ↓
11.2     Students + schedules: mappers (users+contracts ↔ flat DTO), services, routes
         (guarded with requireSelfOrRole / requireRole); 002_optimistic_concurrency
  ↓
11.4     notification_preferences (003) — fixes notifications.js; import/export/analytics
  ↓
11.3     Swaps / availability / contracts routes (tables already exist; add services + mappers)
  ↓
11.5     Sync bridge (offline default; syncMode:'online' opt-in)
  ↓
Brick 7 / 11.7 / 11.8   TLS (mkcert scheduler.local) + static (scoped) + concurrency 409 + tests/CI
  ↓
11.6     (optional) server-side payroll / time_entries — deferred, sync-only
```

---

## F. Updated acceptance checklist

- [ ] `node setup.js migrate` applies `schema.sql` then additive migrations via the **single** `migrations` runner
- [ ] Auth is **cookie + scrypt sessions** (no JWT/Bearer/localStorage/bcrypt anywhere)
- [ ] Same-origin: PWA + API on `scheduler.local`, no CORS, `api.js` uses `credentials:'include'`
- [ ] Static serving is scoped to a public dir — `.env`/`server/`/`database/` are **not** web-reachable
- [ ] `notification_preferences` exists; `POST /api/notifications/preferences` succeeds
- [ ] Schedule writes use `schedules.version` + 409 on conflict
- [ ] Object-level authz enforced: a student cannot read another student's records (403)
- [ ] must-change users are confined to change-password until they set a new password
- [ ] PWA default offline; `syncMode:'online'` opt-in works
- [ ] Supertest suite green in CI
