# Student Shift Scheduler PWA — Complete Implementation Guide

This document is the master step-by-step guide for building the PWA. It integrates the vision and feature scope from `PWA_Development_Action_Plan.md` with accurate codebase status and actionable tasks.

**Source of truth for scheduling logic:** `../Scheduler/index.html` (monolith, fully working)  
**Partial modular extraction:** `../modules/` (CSV parser, utils, state shape — not yet wired into the PWA)  
**Vision reference:** `PWA_Development_Action_Plan.md` (long-term roadmap)

---

## Vision Statement

Transform the single-page Student Shift Scheduler into a world-class Progressive Web Application that serves as a comprehensive schedule management and maintenance system for educational institutions — offline-capable, installable, and eventually multi-user.

---

## Table of Contents

1. [Phase Cross-Reference](#phase-cross-reference)
2. [Feature Status Matrix](#feature-status-matrix)
3. [Current State Summary](#1-current-state-summary)
4. [Prerequisites](#2-prerequisites)
5. [Development Paths](#3-development-paths)
6. [Phase 0 — Fix Blockers](#phase-0--fix-blockers-do-first)
7. [Phase 1 — Foundation & Architecture](#phase-1--foundation--architecture)
8. [Phase 2 — Core Modules & Data Layer](#phase-2--core-modules--data-layer)
9. [Phase 3 — Scheduling Engine Port](#phase-3--scheduling-engine-port)
10. [Phase 4 — Configuration & Rules UI](#phase-4--configuration--rules-ui)
11. [Phase 5 — Calendar UI & Interactions](#phase-5--calendar-ui--interactions)
12. [Phase 6 — Swaps, Admin & Feedback](#phase-6--swaps-admin--feedback)
13. [Phase 7 — Export, Save/Load & Print](#phase-7--export-saveload--print)
14. [Phase 8 — Student Contracts & Compliance](#phase-8--student-contracts--compliance)
15. [Phase 9 — Student Self-Service Availability](#phase-9--student-self-service-availability)
16. [Phase 10 — Test Period & Assessment Workflow](#phase-10--test-period--assessment-workflow)
17. [Phase 11 — Backend & Multi-User](#phase-11--backend--multi-user)
18. [Phase 12 — UX, Dashboards & Notifications](#phase-12--ux-dashboards--notifications)
19. [Phase 13 — Analytics & Intelligence](#phase-13--analytics--intelligence)
20. [Phase 14 — Testing & Quality](#phase-14--testing--quality)
21. [Phase 15 — Deployment & Launch](#phase-15--deployment--launch)
22. [Future Backlog](#future-backlog)
23. [Technical Reference](#technical-reference)
24. [Scheduler Function Port Map](#scheduler-function-port-map)
25. [Success Metrics](#success-metrics)
26. [Verification Checklists](#verification-checklists)
27. [Troubleshooting](#troubleshooting)
28. [Related Documents](#related-documents)

---

## Phase Cross-Reference

Maps this guide to `PWA_Development_Action_Plan.md` weeks and focus areas.

| This Guide | Action Plan | Weeks (est.) | Focus |
|------------|-------------|--------------|-------|
| Phase 0 | Pre-work | — | Fix runtime blockers |
| Phase 1 | Phase 1.1–1.2 | 1–2 | PWA core, DB schema, env setup |
| Phase 2 | Phase 1.2 + 5.1 | 2–3 | Data layer, CSV, persistence |
| Phase 3 | Phase 2.1 | 3–4 | Scheduling engine + rebalancing |
| Phase 4 | Phase 2.2, 2.9 (partial) | 4–5 | Ops hours, assessment, test shifts |
| Phase 5 | Phase 3.2 | 5–6 | Calendar UI, drag-drop, 3-month view |
| Phase 6 | Phase 2.3, 2.5, 2.7 | 6–7 | Admin override, swaps, toasts |
| Phase 7 | Phase 2.6, 5.1 | 7 | Save/load, CSV/ICS export, print |
| Phase 8 | Phase 2.4 | 8 | Individual student contracts |
| Phase 9 | Phase 2.8 | 9–10 | Student availability self-service |
| Phase 10 | Phase 2.9 | 10–11 | Full assessment workflow + notifications |
| Phase 11 | Phase 1.2, 3.1 | 11–14 | Backend, auth, WebSockets |
| Phase 12 | Phase 3.1–3.2 | 14–15 | Role dashboards, push notifications |
| Phase 13 | Phase 4 | 15–16 | Analytics, ML (optional) |
| Phase 14 | Ongoing | — | Tests, lint, build pipeline |
| Phase 15 | Phase 5.3, Launch | 16–17 | Production deploy, beta, launch |

**Monolith parity (Phases 0–7):** ~4–6 weeks  
**Full action plan scope (Phases 0–15):** ~16–17 weeks

---

## Feature Status Matrix

Legend: ✅ Done | 🔶 Partial | ⬜ Not started | 🚀 Action plan (post–monolith)

**Last updated:** reflects Phases 0–8 work in codebase (not every polish item closed).

| Feature | Monolith | PWA | Target Phase |
|---------|----------|-----|--------------|
| Service worker + offline cache | — | 🔶 | 1 |
| Web app manifest + install | — | 🔶 | 1 |
| Responsive design | ✅ | 🔶 | 1, 5 |
| Scheduling algorithm | ✅ | ✅ | 3 |
| Rebalancing + fill open/close | ✅ | ✅ | 3 |
| Assessment period override | ✅ | ✅ | 3, 4 |
| Test shift rules | ✅ | 🔶 | 3, 4 |
| Admin override | ✅ | ✅ | 6 |
| 3-month view | ✅ | ✅ | 4, 5 |
| Drag-and-drop | ✅ | ✅ | 5 |
| Swap + debts (calendar) | ✅ | ✅ | 6 |
| Swap marketplace / requests | — | ✅ | 6, 9 |
| Save/load JSON state | ✅ | ✅ | 7 |
| CSV/ICS export (schedule) | ✅ | ✅ | 7 |
| Per-student contracts (basic) | ✅ | ✅ | 4, 8 |
| Contract dashboard + history | — | ✅ | 8 |
| Student availability self-service | — | ✅ | 9 |
| Test period admin workflow | — | 🚀 | 10 |
| Multi-user auth + API | — | ⬜ | 11 |
| Role-based dashboards | — | 🔶 | 12 |
| Analytics / ML | — | 🔶 | 13 |
| Push / email / SMS notifications | — | ⬜ | 10, 12 |

---

## Implementation Status Snapshot (Phases 0–9)

| Phase | Status | Summary |
|-------|--------|---------|
| **0** | ✅ ~90% | View lifecycle, `window.app.*`, SW path, config — formal audit not documented |
| **1** | 🔶 ~75% | PWA shell, trimmed manifest, SW — offline/build pipeline not fully verified |
| **2** | 🔶 ~85% | CSV, IndexedDB, state — no `persistence.js`; analytics uses live compliance data |
| **3** | ✅ ~90% | Single-file engine, generate/rebalance/fill — not split into guide modules |
| **4** | 🔶 ~85% | Settings UI complete — template presets & some assessment UI deferred |
| **5** | 🔶 ~85% | DnD, modals, summary, 3-month — week grid not full month; Add Shift stub |
| **6** | ✅ ~90% | Admin + calendar swap/debts + marketplace tab (post/offer/approve) |
| **7** | 🔶 ~90% | JSON save/load, CSV/ICS, print — backup docs / MakeTTBL verify pending |
| **8** | ✅ **lite complete** | Compliance export, analytics card, templates, history, engine prioritization |
| **9** | ✅ **core complete** | Availability tab, draft/submit/lock, validation, CSV export; onboarding copy deferred |
| **10** | ✅ **core complete** | Test dates, period templates, assessment schedule gen + review/publish workflow |

**Remaining polish:** Add Shift modal, template presets, full-month calendar, formal smoke-test checklist, Phase 11 API sync.

---

## 1. Current State Summary

### What actually works today

| Area | Status | Notes |
|------|--------|-------|
| PWA shell (HTML/CSS) | ✅ Partial | All main views wired; Schedule + Settings fully interactive |
| View classes | ✅ | `init()` → `render()` on all views |
| Service worker (`sw.js`) | 🔶 | Registered from `app.js`; offline not formally verified |
| IndexedDB wrapper | ✅ | Students, schedules, settings, swaps |
| Scheduling algorithm | ✅ | `schedulingEngine.js` — generate, rebalance, fill |
| Admin mode + override | ✅ | localStorage, engine bypass, audit log |
| Configuration UI | ✅ | Settings: ops hours, templates, assessment, tests |
| Calendar + export | ✅ | DnD, 3-month, swap/debts, JSON/CSV/ICS, print |
| Contract management | ✅ | Phase 8 — compliance tab, templates, history, analytics export |
| Availability self-service | ✅ | Phase 9 — weekly editor, submit/lock, admin access dashboard |
| PostgreSQL schema | Done | `database/schema.sql` (Phase 11+) |
| API server | ⬜ | Stub — Phase 11 |
| Build pipeline | ⬜ | Phase 14 |

### Former Phase 0 bugs — resolved

All eight original blockers fixed (view lifecycle, SW path, `window.app.*`, API config, storage, manifest icons). Duplicate DOM pattern remains but is functional.

### Key success factors (from action plan)

1. Shift swap system — core differentiator  
2. Assessment period management — critical for institutions  
3. Admin override — emergency scheduling  
4. Enhanced scheduling algorithm — fairness + constraints  
5. Offline-first architecture — reliability  
6. Real-time collaboration — multi-user (Phase 11+)  
7. Mobile-first design  
8. Student self-service availability (Phase 9)  
9. Individual contract management (Phase 8)  
10. Scalable backend architecture (Phase 11+)

---

## 2. Prerequisites

### Required (client-only path — Phases 0–7)

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | Dev server, tooling |
| npm | 8+ | Dependencies |
| Modern browser | Chrome 90+, Edge 90+, Firefox 90+ | PWA testing |
| Git | Any recent | Version control |

### Additional (Phases 8–15)

| Tool | Version | Purpose |
|------|---------|---------|
| PostgreSQL | 12+ | Multi-user persistence |
| Redis | 6+ (optional) | Sessions/cache |
| SMTP / SMS provider (optional) | — | Notifications (Phase 10, 12) |

### Reference materials

- `../Scheduler/index.html` — working scheduling engine  
- `../Scheduler/README.md` — user-facing feature reference  
- `PWA_Development_Action_Plan.md` — full vision and API design  
- `PHASE1_SETUP_GUIDE.md` — quick env setup commands

### Technology stack (actual vs planned)

| Layer | Action plan | **Current codebase** | Target |
|-------|-------------|----------------------|--------|
| Frontend | React/Vue + TypeScript | **Vanilla JS** (ES classes) | Stay vanilla until Phase 14; consider framework later |
| Backend | Node.js + Express | Express stub only | Phase 11 |
| Database | PostgreSQL + Redis | Schema only | Phase 11 |
| Real-time | Socket.io | Referenced, not implemented | Phase 11 |
| PWA | SW + manifest | Partial | Phase 1 |

---

## 3. Development Paths

### Path A — Client-only PWA (recommended first)

**Goal:** Monolith feature parity offline in the browser.  
**Phases:** 0–7 (minimum), then 8 if contracts needed.

```bash
cd "Student Scheduler PWA"
npm install
npm run serve
# Open http://localhost:8080
```

### Path B — Institution platform (full action plan)

**Goal:** Multi-user, self-service availability, assessment workflows, analytics.  
**Phases:** 0–15.  
**Requires:** Path A stable + PostgreSQL + implemented server.

---

## Phase 0 — Fix Blockers (Do First)

**Status:** ✅ ~90% complete | **Effort:** 1–2 days

Most blockers resolved. Remaining: formal console/404 audit, optional DOM architecture cleanup.

### Step 0.1 — Fix view lifecycle

- [x] Add `init()` to each view calling `await this.render()`
- [x] Verify Dashboard → Schedule → Students navigation without errors

### Step 0.2 — Expose view instances on `window.app`

- [x] Set `this.dashboard`, `this.schedule`, `this.swaps`, `this.students`, `this.analytics`, `this.settings`
- [x] Swap method aliases (`approveSwap` → `approveRequest`)

### Step 0.3 — Fix script and service worker paths

- [x] Remove broken `src/js/service-worker.js` reference
- [x] Register root `/sw.js` from `app.js`

### Step 0.4 — Fix browser API config

- [x] `window.APP_CONFIG?.apiBaseUrl` in `api.js`
- [x] `src/js/config.js`

### Step 0.5 — Fix IndexedDB storage

- [x] `saveSchedule()` / `saveStudents()` respect store `keyPath`
- [ ] Document `getAll()` shapes per store (low priority)

### Step 0.6 — Resolve duplicate DOM

- [ ] Optional refactor: views own markup vs static shell (works as-is)

### Step 0.7 — Fix manifest assets

- [x] Trim `manifest.json` to existing icon sizes (72, 192, 512)

### Phase 0 verification

- [ ] Console: zero errors on load (manual checklist)
- [x] All nav views render
- [x] Service worker registers
- [x] No script/icon 404s (known icons only)

---

## Phase 1 — Foundation & Architecture

**Effort:** 1 week | **Action plan:** Phase 1 (Weeks 1–2)

### 1.1 PWA core setup

#### Service worker (`sw.js`)

- [ ] Offline-first cache for static assets (CSS, JS, icons)
- [ ] Cache-first for static files; network-first for API (when Phase 11 live)
- [ ] Background sync queue stub for schedule updates
- [ ] Push notification handler stub (activate in Phase 12)

#### Web app manifest (`manifest.json`)

- [ ] App name, short name, theme/background colors
- [ ] All referenced icon sizes present
- [ ] `display: standalone`, `start_url`, `scope`
- [ ] Shortcuts (optional): Today, Swap, Analytics — after routes work

#### Responsive design (`src/styles/`)

- [ ] Mobile-first layout verified on phone/tablet/desktop
- [ ] Touch targets ≥ 44px for buttons and nav
- [ ] Independent scroll for settings sidebar vs calendar (monolith behavior)
- [ ] WCAG 2.1 basics: contrast, focus states, keyboard nav

#### Install prompts (`app.js`)

- [ ] `beforeinstallprompt` handler
- [ ] Install button visibility toggle

### 1.2 Database & backend architecture (scaffold only)

- [ ] Confirm `database/schema.sql` runs via `npm run db:schema`
- [ ] Document tables: users, schedules, shifts, swaps, contracts, availability, test periods
- [ ] **Do not** assume `npm run dev` works — server routes missing until Phase 11

### Step 1.3 — Environment setup

```bash
cd "Student Scheduler PWA"
npm install
npm run serve
```

Create `.env` (for Phase 11+, do not commit):

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=shift_scheduler
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=generate_a_long_random_string
CLIENT_URL=http://localhost:8080
PORT=3000
NODE_ENV=development
```

| Service | URL | Status |
|---------|-----|--------|
| PWA (static) | http://localhost:8080 | After Phase 0 |
| API server | http://localhost:3000 | Phase 11 |
| Icon generator | `generate-icons.html` | Works |

### Phase 1 verification

- [ ] PWA installable on localhost
- [ ] Offline: app shell loads after first visit
- [ ] Responsive layout on mobile emulator
- [ ] `npm run db:test` passes (if PostgreSQL installed)

---

## Phase 2 — Core Modules & Data Layer

**Effort:** 3–5 days | **Action plan:** Phase 5.1 (data management foundation)

### Step 2.1 — Create module structure

```
src/js/core/
├── state.js
├── utils.js
├── logger.js
└── persistence.js
src/js/data/
└── csv.js
```

### Step 2.2 — Port utilities

**Source:** `Scheduler/index.html` ~544–598, `../modules/utils.js`

- [ ] `pad`, `parseTimeStr`, `timeStr`, `toTimeStr`, `dateISO`, `overlap`, `range`, `deepCopy`, `weekKey`
- [ ] `colorFromString`, `stableColor`

### Step 2.3 — CSV import/export foundation

**Action plan 5.1:** Google Form compatible parsing, flexible headers, validation

- [ ] Port `../modules/csv/parse.js` → `src/js/data/csv.js`
- [ ] Support native scheduler CSV + Google Form format (`parseGoogle.js`)
- [ ] Wire **Import CSV** in `StudentsView`
- [ ] Port `loadSample()` for dev/testing
- [ ] Validate required columns: `id`, `name`, `weekly_max_hours`, `contracted_monthly_hours`, `availability`

### Step 2.4 — Wire views to StorageManager

| View | Replace mock methods |
|------|---------------------|
| `dashboard.js` | `getShiftsForDate`, `getPendingSwaps`, `getQuickStats`, `getRecentActivity` |
| `schedule.js` | `getStudents`, `getShiftsForMonth`, `getShiftTemplates`, `updateShift` |
| `students.js` | `getStudents`, `updateStudents` |
| `swaps.js` | swap CRUD |
| `analytics.js` | aggregates from stored data |

### Step 2.5 — Centralize state

- [ ] `core/state.js` mirrors monolith: `students`, `schedule`, `templates`, `year`, `month`, `operationalHours`, `assessmentPeriods`, `testShifts`, `swapDebts`, `threeMonthView`, `fairness`, `logs`

### Phase 2 verification

- [ ] CSV import → students in UI → survive reload
- [ ] Dashboard stats reflect real student count
- [ ] Offline indicator when network disabled

---

## Phase 3 — Scheduling Engine Port

**Effort:** 5–8 days | **Action plan:** Phase 2.1 (critical)

Port monolith algorithm as **pure functions**. All items below exist in `Scheduler/index.html` and must be replicated.

### 3.1 Enhanced scheduling algorithm (from monolith)

- [ ] **Weekly consistency priority** — same weekday + time preferred across weeks
- [ ] **Consecutive shift management** — 2–5h preferred; max 5 consecutive hours
- [ ] **Opening/closing balance** — up to 2 people on first/last shifts; 2h extension rule
- [ ] **Strict cap enforcement** — weekly (18h) and monthly caps during assignment
- [ ] **Fairness scoring** — balance opening/closing across students
- [ ] **Chain preference** — prefer 2–5h chains; avoid isolated 1h slots

### 3.2 Advanced rebalancing system

- [ ] **Iterative hour equalization** — target gap ≤ 5h (monolith); action plan target ≤ 0.5h (tune later)
- [ ] **Weekly consistency preservation** during swaps
- [ ] **Opening/closing protection** — stable edge assignments
- [ ] **5 consecutive hour limit** in rebalance logic
- [ ] **Multiple pass strategy** with progressive fallbacks
- [ ] **`fillOpenClose()`** — prioritize unfilled open/close shifts

### 3.3 Module layout

```
src/js/core/
├── templates.js
├── operations.js
├── availability.js
├── constraints.js
├── scoring.js
├── scheduler.js      # runSchedule + runSchedulingAlgorithm
├── rebalance.js
└── validation.js     # validateSchedule
```

### 3.4 Port order

| Order | Monolith functions | Module |
|-------|-------------------|--------|
| 1 | `defaultTemplatesIfEmpty`, template CRUD | `templates.js` |
| 2 | `isOperationalDay`, `getOperationalHours` | `operations.js` |
| 3 | `buildStudentAvailability`, `isStudentAvailable` | `availability.js` |
| 4 | `canAssignStudentToShift`, `validateAssignment`, hour counters | `constraints.js` |
| 5 | `getConsistencyScore`, `getChainPreferenceScore`, `canExtendTwoHours`, … | `scoring.js` |
| 6 | `runSchedule`, `runSchedulingAlgorithm` | `scheduler.js` |
| 7 | `rebalance`, `fillOpenClose` | `rebalance.js` |
| 8 | `validateSchedule` | `validation.js` |

### 3.5 Assessment & test rules (monolith parity)

- [ ] During assessment periods: **disregard regular availability matrix**
- [ ] Only test rules: no work before test, +1h after test
- [ ] Saturday operations during assessment periods
- [ ] Dynamic capacity on overlapping test slots (1–10 assistants)
- [ ] Early opening (06:00) for large tests
- [ ] Comprehensive algorithm logging

### 3.6 Wire ScheduleView

- [ ] Replace `runSchedulingAlgorithm()` stub
- [ ] **Generate Schedule** → build slots → assign → persist → re-render
- [ ] Add **Rebalance** and **Fill Open/Close** buttons

### 3.7 Compare with monolith

- [ ] Same CSV + month + templates → compare assignment counts and hour totals
- [ ] Document differences in `PORTING_NOTES.md` if any

### Future (action plan 2.1 — not v1)

- [ ] Genetic algorithm / ML predictive scheduling — **Future Backlog**

### Phase 3 verification

- [ ] Generate fills majority of slots for sample data
- [ ] Weekly/monthly caps enforced
- [ ] Rebalance reduces hour gap
- [ ] Algorithm logs visible (toast or panel)

---

## Phase 4 — Configuration & Rules UI

**Effort:** 4–6 days | **Action plan:** Phase 2.2, 2.9 (admin setup portion)

### 4.1 Operational hours & holidays

- [ ] Default start/end times
- [ ] Public holidays (JSON)
- [ ] Special hours (single-day overrides)
- [ ] Batch holidays (school breaks)

### 4.2 Shift templates & presets

**Action plan 2.1:** Reusable templates, seasonal variations, quick setup

- [ ] List/add/remove templates (start, end, required, opening/closing flags)
- [ ] `defaultTemplatesIfEmpty()` — 06:30–18:30 hourly slots
- [ ] Template presets (standard semester, exam week, holiday reduced hours)

### 4.3 Assessment period configuration

**Action plan 2.2 — Critical**

- [ ] Date range management with naming
- [ ] Overlap detection and validation
- [ ] Visual indicators: purple highlighting, tooltips
- [ ] Logic override connected (Phase 3.5)
- [ ] ✅/🔒 availability indicators during assessment

### 4.4 Test shifts (monolith + admin UI)

- [ ] Add test date, time range, name, required assistants
- [ ] Capacity adjustment on overlapping slots
- [ ] `adjustTestShiftCapacity`, `suggestEarlyOpeningForLargeTests`
- [ ] Test shift visual flags on calendar

### 4.5 Monthly contract targets (basic)

- [ ] Default monthly target + **Apply to all students**
- [ ] Per-student override in Students view (expanded in Phase 8)

### 4.6 Three-month view

**Action plan 3.2 — Implemented in monolith**

- [ ] Toggle single vs 3-month view
- [ ] `generateThreeMonthSchedules`, `renderThreeMonthCalendar`
- [ ] Run scheduler across prev/current/next month
- [ ] Export/print includes all 3 months

### Phase 4 verification

- [ ] Public holiday → no shifts that day
- [ ] Assessment period → rules change as documented
- [ ] 3-month view shows three calendars with data

---

## Phase 5 — Calendar UI & Interactions

**Effort:** 4–5 days | **Action plan:** Phase 3.2

### 5.1 Interactive calendar (monolith features)

- [ ] Drag-and-drop with visual feedback
- [ ] 3-month view integration
- [ ] Conflict visualization — red highlighting for violations
- [ ] Availability indicators ✅/🔒
- [ ] Admin override visuals — 🔧 badges, orange border
- [ ] Assessment period indicators

### 5.2 Enhanced calendar features

- [ ] Click-to-add students modal (`openStudentSelectionModal`)
- [ ] Student avatars with color-dot fallback
- [ ] Shift capacity management (1–10 assistants)
- [ ] Test shift indicators (large tests, early opening)
- [ ] Independent scrolling: sidebar vs calendar

### 5.3 Manual editing

- [ ] Right-click remove student from shift
- [ ] Right-click shift → adjust capacity
- [ ] Port `handleDropAssign` with admin bypass
- [ ] Port `renderSummary` — hours, conflicts, unfilled shifts

**Reuse:** `../modules/ui/calendar.js`

### Phase 5 verification

- [ ] Drag between shifts persists
- [ ] Unavailable student blocked unless admin mode
- [ ] Summary totals match calendar

---

## Phase 6 — Swaps, Admin & Feedback

**Effort:** 3–4 days | **Action plan:** Phase 2.3, 2.5, 2.7

### 6.1 Admin override system (Critical — action plan 2.3)

- [ ] Persistent admin mode (`localStorage`) — partial exists
- [ ] Bypass all constraints on drag-and-drop and manual assign
- [ ] 🔧 badge + orange border on overridden shifts
- [ ] Audit metadata: timestamp, admin ID, reason (optional)
- [ ] Comprehensive override logging

### 6.2 Shift swap system (Core — action plan 2.5)

**Monolith (port first):**

- [ ] `openSwapModal`, `performSwap`, swap debt tracking
- [ ] `renderDebtsPanel`, `markDebtSettled`

**PWA enhancements (action plan):**

- [ ] Student-initiated swap requests
- [ ] Supervisor approval workflow
- [ ] Automatic conflict checking on swap
- [ ] Swap marketplace / offers (UI scaffolded in `swaps.js`)
- [ ] Swap matching suggestions (Phase 13 analytics input)

**Future:**

- [ ] Multi-way swaps (A→B→C→A)
- [ ] Swap history & analytics dashboard

### 6.3 User feedback system (Critical — action plan 2.7)

- [ ] Toast notifications — color-coded success/error/warning/info (partial in `app.js`)
- [ ] Auto-dismiss with animation
- [ ] Confirmation dialogs for destructive ops (delete, load overwrite, clear schedule)
- [ ] Keyboard shortcuts:

| Shortcut | Action |
|----------|--------|
| Ctrl+L | Load sample |
| Ctrl+R | Run scheduler |
| Ctrl+T | Toggle 3-month view |
| Ctrl+S | Save state |
| Ctrl+O | Load state |
| Ctrl+E | Export CSV |
| Ctrl+P | Print |
| Ctrl+V | Validate |
| Ctrl+B | Rebalance |
| ← / → | Change month |
| Escape | Close modal |

### Phase 6 verification

- [ ] Swap creates debt; mark settled removes it
- [ ] Admin override assigns with 🔧 badge
- [ ] All shortcuts work

---

## Phase 7 — Export, Save/Load & Print

**Effort:** 2–3 days | **Action plan:** Phase 2.6, 5.1

### 7.1 Schedule state management (Critical — action plan 2.6)

- [ ] Save full state as JSON download (`saveState`, `saveScheduleState`)
- [ ] Load with confirmation dialog (month, student count, shift count)
- [ ] Include month/year selection in saved state
- [ ] State validation on load — corrupted file handling
- [ ] Version compatibility checking
- [ ] Auto-save to IndexedDB (optional)
- [ ] Backup/recovery documentation

### 7.2 CSV export

**Action plan 5.1:** Google Form compatible, flexible format, metadata

- [ ] Port `exportCSV` — include month column in 3-month mode
- [ ] Compatible with `MakeTTBL.py` / timetable tools

### 7.3 Calendar export

- [ ] Port `exportICSPerStudent` — one `.ics` per student
- [ ] Batch export all student calendars
- [ ] Standard iCal DTSTART/DTEND (UTC)

### 7.4 Print

- [ ] Print CSS hiding controls
- [ ] Page breaks for 3-month view
- [ ] Ctrl+P / Print button

### Phase 7 verification

- [ ] Save → clear → load restores identical schedule
- [ ] CSV opens in Excel; ICS imports to Google Calendar

**Monolith parity complete after Phase 7.**

---

## Phase 8 — Student Contracts & Compliance

**Status:** 🔶 **In progress** (~60%) | **Effort:** 1–2 weeks | **Action plan:** Phase 2.4

Monolith supports `contracted_monthly_hours` per student and **Apply to all**. This phase adds contract management beyond the monolith.

**Implemented (PWA):**
- `src/js/core/contracts.js` — templates (20/40/60/72h), validation, compliance status
- Per-student contract edit modal (Students view)
- **Contract compliance** tab — assigned vs contracted from saved schedule
- Contract change history in `scheduleMeta` (IndexedDB)
- Engine `contractDeficit` scoring — prioritizes under-filled contracts
- Bulk template apply + Settings “Apply to all” logs history

### 8.1 Per-student contract assignment

- [x] Individual monthly hours per student (edit modal)
- [x] Contract types: 20h, 40h, 60h, 72h, custom
- [x] Validation: 1–72 hours/month
- [x] Override default on per-student basis

### 8.2 Contract management interface

- [x] Student contract dashboard — compliance table + filters
- [x] Bulk assign via templates + Settings default
- [x] Contract status indicators (active, at-risk, under-filled, non-compliant)
- [x] Contract templates for quick assignment
- [ ] Dedicated analytics gap-analysis card (use Analytics view — pending)

### 8.3 Contract history & notifications

- [x] `contractHistory` audit trail (IndexedDB, not PostgreSQL yet)
- [x] Log who changed what and when (`changedBy: admin`)
- [ ] Notify students on contract change (Phase 11+)

### 8.4 Contract integration with scheduling

- [x] Algorithm uses `contracted_monthly_hours` (existing + deficit boost)
- [x] Contract-based prioritization for under-filled contracts (`contractDeficit` weight)
- [x] Compliance monitoring: assigned vs contracted in Students tab
- [x] Gap analysis report export (`exportComplianceCSV` — Students + Analytics)

### Phase 8 verification

- [x] Different contracts per student respected by generator (`contractDeficit` scoring + monthly caps)
- [x] Compliance report shows accurate percentages (Analytics card + Students tab)
- [x] Contract change logged in history

---

## Phase 9 — Student Self-Service Availability

**Effort:** 2–3 weeks | **Action plan:** Phase 2.8 (Critical — new)

Replaces admin-only CSV import as primary availability capture for institutions.

### 9.1 Student availability input interface

- [x] Week-based availability form
- [x] Time pickers for start/end
- [x] Recurring weekly patterns
- [x] Class schedule integration (subject names via optional label field)
- [x] Unavailable periods (personal commitments)
- [x] Availability preview — show how input maps to scheduler format

### 9.2 Admin-controlled access

- [x] Grant/revoke student edit permissions (`availabilityAccess` in IndexedDB meta)
- [x] Submission window — edit until submit, then locked
- [x] Admin reopen for individual or bulk students
- [x] Access status dashboard — who has/hasn't submitted

### 9.3 Submission workflow

- [x] Draft → submitted → locked states
- [x] Submission confirmation (toast on submit & lock)
- [x] Submission history with timestamps (`availabilityAccess.history`)
- [x] Admin unlock override

### 9.4 New student onboarding

- [x] Add student → immediate availability access (auto on `saveStudents` / import)
- [x] Onboarding guidance copy (Availability tab steps panel)
- [x] Copy availability from existing student template
- [ ] Integrate new student into existing schedule (manual generate/rebalance)

### 9.5 Data pipeline

- [x] Convert student input → scheduler-compatible JSON (`weekly`, `unavailable_dates`)
- [x] Validation: overlaps, required fields, conflict detection
- [x] Admin export to CSV for external tools
- [ ] Real-time sync to scheduler state (Phase 11 API)

### Phase 9 verification

- [x] Student submits availability → locked → appears in scheduler (engine reads `student.availability`)
- [x] Admin export CSV matches monolith import format
- [x] Overlapping periods rejected with clear error

---

## Phase 10 — Test Period & Assessment Workflow

**Effort:** 2–3 weeks | **Action plan:** Phase 2.9 (Critical — extends monolith)

Monolith handles assessment periods + test shifts at schedule time. This phase adds the **full academic-year workflow** from the action plan.

### 10.1 Test period administration

- [x] Annual test period setup at start of year (Settings + templates)
- [x] Test period templates (midterms, finals, exam week)
- [x] Date ranges + notification timeline (`notificationDaysBefore`)
- [x] Overlap validation between periods

### 10.2 Student test date input

- [x] Students add personal test dates, times, subjects (Students → Test dates tab)
- [x] Multiple tests per day/week
- [x] Test conflict detection across students (overlap validation)
- [x] Submission deadline tracking (Settings submission status + reminders)

### 10.3 Automated notifications

- [x] Pre-assessment reminders (in-app toast on load)
- [x] Test date input reminders (deadline warnings)
- [ ] Escalation to admin for missing submissions (dashboard only — no email yet)
- [x] Channels: in-app first; email/SMS in Phase 12

### 10.4 Assessment schedule generation

- [x] Generate assessment schedules from test data + Phase 3 engine (Settings → multi-month generate)
- [x] Apply assessment period logic override (engine: ignore weekly avail during assessment)
- [x] Send schedules to students for review (`pending_review` + Schedule banner)
- [x] Collect feedback / change requests (`addAssessmentFeedback`)
- [x] Version control for schedule iterations (`assessmentSchedules[]` with version history)

### 10.5 Admin override & publication

- [x] Admin modify any generated assessment schedule (Load in calendar → manual DnD)
- [ ] Emergency override access (uses existing admin mode on calendar)
- [ ] Bulk updates across periods
- [x] Approval workflow → publish final schedule (review → approve → publish)
- [x] Change audit trail (version history + feedback log in Settings)

### Phase 10 verification

- [x] End-to-end workflow completes without CSV manual step
- [x] Notifications fire on schedule (in-app toasts on app load)
- [x] Published schedule matches assessment rules (engine respects test dates + assessment days)

---

## Phase 11 — Backend & Multi-User

**Effort:** 2–4 weeks | **Action plan:** Phase 1.2, 3.1

**Only after Phases 0–7 stable.**

### 11.1 Implement server files

```
server/
├── index.js              (exists)
├── database/manager.js
├── middleware/auth.js
├── middleware/error.js
├── utils/logger.js
└── routes/
    ├── auth.js
    ├── users.js
    ├── schedules.js
    ├── shifts.js
    ├── swaps.js
    ├── availability.js
    ├── contracts.js
    └── notifications.js
```

### 11.2 Core API (see [Technical Reference](#technical-reference))

- [ ] JWT auth: login, logout, refresh
- [ ] Schedules, shifts, assignments CRUD
- [ ] Availability + access control endpoints
- [ ] Contracts + templates endpoints
- [ ] Test periods + student test dates
- [ ] Swap requests + offers + approve/reject

### 11.3 Client integration

- [ ] `APIClient` → `http://localhost:3000/api`
- [ ] Online: API; offline: IndexedDB + sync queue
- [ ] Role-based route guards (student, supervisor, admin)

### 11.4 Real-time & sync

- [ ] Socket.io: schedule changes, swap events
- [ ] Background sync flush on `online`
- [ ] Audit trails in DB for all mutations

### Phase 11 verification

- [ ] Two sessions see live updates
- [ ] Offline edits sync when reconnected
- [ ] Roles enforced server-side

---

## Phase 12 — UX, Dashboards & Notifications

**Effort:** 1–2 weeks | **Action plan:** Phase 3.1–3.2

### 12.1 Role-based dashboards

- [ ] **Student:** my schedule, request swaps, submit availability/tests
- [ ] **Supervisor:** approve swaps, manage students, team analytics
- [ ] **Admin:** settings, users, contracts, assessment workflow, reports

### 12.2 Real-time collaboration (action plan 3.1)

- [ ] Live schedule updates via WebSocket
- [ ] In-app notification center (`notifications.js` — expand)
- [ ] Optional future: chat, video — **Future Backlog**

### 12.3 Smart notifications (action plan 3.2)

- [ ] Push notifications (VAPID + service worker)
- [ ] Email integration (nodemailer — in package.json)
- [ ] SMS alerts for critical changes — optional
- [ ] User notification preferences per type

### Phase 12 verification

- [ ] Each role sees appropriate nav and data
- [ ] Push received on swap approval (test device)

---

## Phase 13 — Analytics & Intelligence

**Effort:** 1–2 weeks | **Action plan:** Phase 4

Replace mock data in `analytics.js`.

### 13.1 Business intelligence

- [ ] Schedule utilization reports
- [ ] Efficiency metrics (fill rate, unfilled shifts)
- [ ] Swap frequency and patterns
- [ ] Availability reliability scores
- [ ] Contract compliance dashboards (Phase 8 data)

### 13.2 Predictive / ML (future — action plan 4.2)

- [ ] Forecast staffing needs
- [ ] Anomaly detection (unusual swap patterns)
- [ ] **Future Backlog** — not required for v1 launch

### Phase 13 verification

- [ ] Charts reflect real stored data
- [ ] Export report downloads valid CSV/PDF

---

## Phase 14 — Testing & Quality

**Effort:** Ongoing | **Action plan:** Success metrics (technical)

### 14.1 Unit tests (Jest)

- [ ] `core/utils.js`, `core/constraints.js`, `core/scheduler.js`, `data/csv.js`
- [ ] Contract compliance calculations (Phase 8)
- [ ] Availability conversion (Phase 9)

### 14.2 Lint & format

```bash
npm run lint
npm run format
```

### 14.3 Manual test matrix

| Scenario | Browsers |
|----------|----------|
| Generate + rebalance | Chrome, Firefox, Edge |
| CSV round-trip | Chrome |
| PWA install + offline | Chrome Android, Safari iOS |
| Save/load JSON | Desktop |
| Assessment workflow | Chrome |
| Role-based access | Chrome + API |

### 14.4 Build pipeline

- [ ] Add `webpack.config.js` **or** remove webpack from `package.json`
- [ ] Verify PostCSS build if used

### 14.5 Performance targets (action plan)

- [ ] App load < 2 seconds
- [ ] API response < 100ms (Phase 11)
- [ ] Error rate < 1%

---

## Phase 15 — Deployment & Launch

**Effort:** 1–2 weeks | **Action plan:** Phase 5.3, Launch Strategy

### 15.1 Static PWA hosting (Path A)

1. HTTPS required  
2. Preserve file paths  
3. Cache headers: short for `index.html` / `sw.js`; long for assets  
4. Validate manifest in DevTools  

### 15.2 Full-stack hosting (Path B)

1. Managed PostgreSQL  
2. `npm run db:schema` on deploy  
3. Node API with env vars  
4. PWA + API same origin or CORS configured  

### 15.3 Security & compliance (action plan 5.3)

- [ ] HTTPS everywhere
- [ ] GDPR considerations for student data
- [ ] FERPA if US educational data
- [ ] Rate limiting active (server)
- [ ] Security audit before public launch

### 15.4 Launch strategy (action plan)

| Stage | Activities |
|-------|------------|
| **Beta (Week 13)** | Internal testing, perf optimization, bug fixes |
| **Soft launch (Week 14)** | Limited institutions, monitor, iterate |
| **Full launch (Week 15)** | Public release, onboarding, support activation |

### 15.5 Post-launch support

- [ ] Monitoring and alerting
- [ ] Support ticketing
- [ ] Monthly feedback sessions
- [ ] Quarterly feature releases

### Phase 15 verification

- [ ] Production checklist complete (see [Verification Checklists](#verification-checklists))
- [ ] Rollback procedure documented

---

## Future Backlog

From action plan — not required for initial launch:

| Item | Action plan section |
|------|---------------------|
| Genetic / ML scheduling optimization | 2.1 |
| Schedule template sharing between institutions | 2.1 |
| Multi-way swap chains | 2.5 |
| Swap marketplace bidding / gamification | 6.2 |
| Google Calendar / Outlook sync | 5.2 |
| Slack / Teams / Discord integrations | 5.2 |
| HR / payroll / SIS integrations | 5.2 |
| Native iOS/Android apps | 6.1 |
| Group / department-wide swaps | 6.2 |
| Chat / video for shift discussions | 3.1 |
| SOC 2 certification | 5.3 |

---

## Technical Reference

From `PWA_Development_Action_Plan.md` — use when implementing Phases 8–11.

### Database schema (key tables)

Already defined in `database/schema.sql`. Core groups:

| Group | Tables |
|-------|--------|
| Auth | `users`, `user_sessions` |
| Scheduling | `schedules`, `shifts`, `shift_assignments`, `institutions` |
| Availability | `student_availability`, `availability_periods`, `availability_access` |
| Contracts | `student_contracts`, `contract_history`, `contract_templates` |
| Assessment | `test_periods`, `student_test_dates`, `assessment_schedules`, `schedule_feedback`, `notification_queue` |
| Swaps | `swap_requests`, `swap_offers`, `swap_transactions` |
| Notifications | `notifications`, `notification_preferences` |

### API endpoints (implement in Phase 11)

```
Authentication:
POST /api/auth/login | logout | refresh

Scheduling:
GET/POST/PUT/DELETE /api/schedules
GET/POST/PUT/DELETE /api/shifts

Availability:
GET/POST/PUT/DELETE /api/availability
GET/PUT /api/availability/access/{user_id}
GET /api/availability/status          (admin)
POST /api/availability/bulk-access    (admin)

Contracts:
GET/POST/PUT/DELETE /api/contracts
GET /api/contracts/templates
POST /api/contracts/bulk-assign       (admin)

Test periods:
GET/POST/PUT/DELETE /api/test-periods
POST/PUT/DELETE /api/student-test-dates
GET/POST/PUT /api/assessment-schedules
POST /api/schedule-feedback

Swaps:
GET/POST /api/swaps/requests
PUT /api/swaps/requests/{id}/approve|reject
GET/POST /api/swaps/offers
```

### Availability data flow (Phase 9)

1. Student input → validation → DB storage  
2. Admin export → CSV generation → scheduler import  
3. Access control → permission check → UI lock state  
4. Changes → sync → scheduler state update  

### Contract + scheduling integration (Phase 8)

- `canAssignStudentToShift` checks individual `monthlyHours` contract  
- Prioritize students further from contract fulfillment  
- `generateComplianceReport()` after each schedule run  

---

## Scheduler Function Port Map

| Domain | Monolith functions | PWA target | Phase |
|--------|-------------------|------------|-------|
| Utils | `pad`, `parseTimeStr`, `dateISO`, … | `core/utils.js` | 2 |
| CSV | `parseCSV`, `loadSample` | `data/csv.js` | 2 |
| Operations | `isOperationalDay`, holidays, … | `core/operations.js` | 4 |
| Templates | `addTemplate`, `defaultTemplatesIfEmpty`, … | `core/templates.js` | 4 |
| Assessment | `isAssessmentPeriod`, … | `core/assessment.js` | 3–4 |
| Tests | `addTestShift`, … | `core/testShifts.js` | 4 |
| Availability | `buildStudentAvailability`, … | `core/availability.js` | 3 |
| Constraints | `canAssignStudentToShift`, … | `core/constraints.js` | 3 |
| Scoring | `getConsistencyScore`, … | `core/scoring.js` | 3 |
| Engine | `runSchedule`, `runSchedulingAlgorithm` | `core/scheduler.js` | 3 |
| Rebalance | `rebalance`, `fillOpenClose` | `core/rebalance.js` | 3 |
| Calendar UI | `renderCalendar`, `renderChip`, … | `ui/calendar.js` | 5 |
| Drag/drop | `handleDropAssign` | `ui/dragDrop.js` | 5 |
| Swaps | `performSwap`, `renderDebtsPanel`, … | `views/swaps.js` | 6 |
| Admin | `toggleAdminMode` | `ScheduleView` | 6 |
| Export | `exportCSV`, `exportICSPerStudent` | `core/export.js` | 7 |
| Persistence | `saveState`, `loadState` | `core/persistence.js` | 7 |
| 3-month | `toggleThreeMonthView`, … | `ui/calendar.js` | 4–5 |

---

## Success Metrics

From action plan — measure after Phase 15.

### User experience

- [ ] App load time < 2 seconds
- [ ] 99.9% uptime (hosted)
- [ ] < 1% client error rate
- [ ] 4.5+ user satisfaction (survey)

### Business impact

- [ ] 50% reduction in scheduling conflicts
- [ ] 30% faster schedule generation vs manual
- [ ] 80% user adoption at pilot institution
- [ ] 25% reduction in admin scheduling overhead
- [ ] 90% reduction in availability data entry errors (Phase 9)
- [ ] 95% reduction in test date coordination errors (Phase 10)
- [ ] 80% improvement in contract compliance tracking (Phase 8)

### Technical performance (Phase 11+)

- [ ] Support 1,000+ concurrent users (scale to 10,000)
- [ ] < 100ms API response times (p95)
- [ ] 99.9% data consistency
- [ ] Zero data loss incidents

---

## Verification Checklists

### Minimum viable PWA (after Phase 3)

- [ ] App loads without console errors
- [ ] CSV import works
- [ ] Generate Schedule assigns students
- [ ] Data persists across reload
- [ ] Works offline after first load

### Monolith parity (after Phase 7)

- [ ] All monolith header actions have equivalents
- [ ] Assessment periods and test shifts work
- [ ] 3-month view works
- [ ] Admin override works
- [ ] Swaps and debts work
- [ ] Export CSV, ICS, JSON, print

### Institution platform (after Phase 10)

- [ ] Student self-service availability
- [ ] Individual contracts + compliance reports
- [ ] Full assessment workflow with notifications
- [ ] Role-based access (Phase 11+)

### Production ready (after Phase 15)

- [ ] HTTPS + installable PWA
- [ ] Tests passing
- [ ] No mock data in production paths
- [ ] Monitoring and support active
- [ ] `README.md` updated

---

## Troubleshooting

### App shows blank screen

→ Phase 0.1 (`init` vs `render`), Phase 0.3 (script 404s)

### Generate Schedule does nothing

→ Expected until Phase 3; then verify students + templates in state

### IndexedDB not saving

→ Phase 0.5 keyPath fix; check DevTools → IndexedDB → `ShiftSchedulerDB`

### PWA won't install

→ HTTPS/localhost, fix manifest icons (Phase 0.7), service worker registered

### `npm run dev` crashes

→ Server incomplete until Phase 11; use `npm run serve`

### `npm run build` fails

→ Phase 14.4 — add webpack config or remove script

### Schedule differs from monolith

→ Same CSV/month/templates; check assessment + test config; compare logs

### Contract compliance wrong

→ Phase 8 — verify `contracted_monthly_hours` wired into `constraints.js`

### Student availability not in scheduler

→ Phase 9 — verify `convertToSchedulerFormat()` output matches CSV `availability` JSON

---

## Related Documents

| Document | Purpose |
|----------|---------|
| `PWA_Development_Action_Plan.md` | Full vision, API design, TypeScript interface examples |
| `PHASE1_SETUP_GUIDE.md` | Quick install commands |
| `README.md` | User-facing overview |
| `../Scheduler/README.md` | Monolith user manual |
| `../Scheduler/index.html` | Working engine source |
| `../modules/` | Early ES module extraction |

---

## Recommended Timeline

| Phase | Focus | Duration |
|-------|-------|----------|
| 0 | Fix blockers | 1–2 days |
| 1 | PWA foundation | 3–5 days |
| 2 | Data layer | 3–5 days |
| 3 | Scheduling engine | 5–8 days |
| 4 | Configuration UI | 4–6 days |
| 5 | Calendar UI | 4–5 days |
| 6 | Swaps + admin | 3–4 days |
| 7 | Export + save/load | 2–3 days |
| **→ Monolith parity** | **~4–6 weeks** | |
| 8 | Contracts | 1–2 weeks |
| 9 | Self-service availability | 2–3 weeks |
| 10 | Assessment workflow | 2–3 weeks |
| 11 | Backend | 2–4 weeks |
| 12 | Dashboards + notifications | 1–2 weeks |
| 13 | Analytics | 1–2 weeks |
| 14 | Testing | Ongoing |
| 15 | Launch | 1–2 weeks |
| **→ Full action plan** | **~16–17 weeks** | |

---

*Last updated: June 2026 — aligned with `PWA_Development_Action_Plan.md` and codebase state in `Student Scheduler PWA/` + `Scheduler/`.*
