# Student Shift Scheduler PWA — Project Directory Map

**Purpose.** Single reference for folder layout, UI routing, script load order, module boundaries, and naming conventions. Use this when adding views, files, or navigation so routing stays consistent across Cursor, Claude, and local dev.

**Last aligned:** 2026-06-30 · **Repo root:** `Student Scheduler PWA/`

**Exclude from AI project uploads:** `node_modules/` (restore with `npm install`).

---

## 1. UI routing (SPA — no URL router)

The PWA is a **single-page app** with **view switching**, not hash/history routing. All navigation goes through `window.app.navigateToView(viewName)`.

### 1.1 Primary views (top nav)

| Order | `data-view` / `viewName` | DOM container | View class | Script | Shortcut |
|------:|--------------------------|---------------|------------|--------|----------|
| 1 | `dashboard` | `#dashboard-view` | `DashboardView` | `src/js/views/dashboard.js` | Ctrl/Cmd+1 |
| 2 | `schedule` | `#schedule-view` | `ScheduleView` | `src/js/views/schedule.js` | Ctrl/Cmd+2 |
| 3 | `swaps` | `#swaps-view` | `SwapsView` | `src/js/views/swaps.js` | Ctrl/Cmd+3 |
| 4 | `students` | `#students-view` | `StudentsView` | `src/js/views/students.js` | Ctrl/Cmd+4 |
| 5 | `analytics` | `#analytics-view` | `AnalyticsView` | `src/js/views/analytics.js` | Ctrl/Cmd+5 |
| 6 | `settings` | `#settings-view` | `SettingsView` | `src/js/views/settings.js` | Ctrl/Cmd+6 |

**Registration points (must stay in sync):**

| File | What to update when adding a primary view |
|------|---------------------------------------------|
| `index.html` | `<button class="nav-item" data-view="…">` **and** `<div id="…-view" class="view">` |
| `src/js/app.js` | `this.views = { … }`, shortcut array in `handleKeyboardShortcuts` |
| `src/js/app.js` | `initViews()` assigns `this.<name> = this.views.<name>` if exposed globally on app |

**Navigation flow:**

```
nav-item click / navigateToView(name)
  → toggle .active on [data-view]
  → toggle .active on #<name>-view
  → await this.views[name].init()
  → saveAppState() (persists currentView)
```

### 1.2 Sub-views (in-view tabs — not top-level routes)

| Parent view | Tab attribute | Tab values | State property | Handler |
|-------------|---------------|------------|----------------|---------|
| **Students** | `data-tab` | `students`, `contracts`, `availability`, `tests`, `ledger` | `StudentsView.currentTab` | `switchTab()` |
| **Swaps** | `data-swap-view` | `requests`, `marketplace` | `SwapsView.viewMode` | tab click → `this.viewMode = tab.dataset.swapView` |

**Settings** has no tab bar; content is stacked `<section class="config-card">` blocks in one scrollable page.

### 1.3 Cross-view navigation (programmatic)

| From | Trigger | Target view |
|------|---------|-------------|
| `DashboardView` | quick actions | `schedule`, `swaps` |
| `StudentsView` | “Schedule” on student row | `schedule` |
| `ScheduleView` | config link | `settings` |
| `NotificationManager` | notification actions | `schedule`, `swaps` |

**Rule:** cross-view jumps must call `window.app.navigateToView('<name>')`, never manipulate `#*-view` DOM directly.

### 1.4 Schedule view keyboard shortcuts (when `currentView === 'schedule'`)

| Key | Action |
|-----|--------|
| Ctrl/Cmd+R | Generate schedule |
| Ctrl/Cmd+B | Rebalance (SSD) |
| Ctrl/Cmd+T | Toggle 3-month view |
| Ctrl/Cmd+V | Validate schedule |
| Ctrl/Cmd+E | Export CSV |
| Ctrl/Cmd+I | Export ICS |

Global (any view): Ctrl/Cmd+S save state, Ctrl/Cmd+O load state, Ctrl/Cmd+P print, Escape close modals.

---

## 2. Script load order (`index.html`)

Scripts load via `<script>` tags (no bundler at runtime). **Order is dependency order** — do not reorder casually.

```
vendor/xlsx.full.min.js
config.js
core/utils.js → logger.js → contracts.js → hoursLedger.js
core/payrollParser.js → identityMap.js → workedHoursNormalizer.js
core/availability.js → assessment.js → policyFlags.js
core/effectiveRoster.js → reconcile.js
data/students.js → data/csv.js
core/state.js          ← depends on HoursLedger, StorageManager pattern
core/schedulingEngine.js → export.js
utils/storage.js → api.js → notifications.js
views/*.js (dashboard → schedule → swaps → students → analytics → settings)
app.js                 ← bootstrap last; creates ShiftSchedulerApp → window.app
```

**Adding a new core module:** insert after its dependencies, before `state.js` if state consumes it, or before views if UI-only.

---

## 3. Module map (`window.*` globals)

| Global | File | Role |
|--------|------|------|
| `APP_CONFIG` | `config.js` | App constants |
| `SchedulerUtils` | `core/utils.js` | Shared helpers |
| `SchedulerLogger` | `core/logger.js` | Logging |
| `ContractManager` | `core/contracts.js` | Assigned-hours / contract helpers |
| `HoursLedger` | `core/hoursLedger.js` | Contract ledger v1.2 (v1.3 clocked feed — E3) |
| `PayrollParser` | `core/payrollParser.js` | VeraLab `.xls` ingest |
| `IdentityMap` | `core/identityMap.js` | u-number / name → student |
| `WorkedHoursNormalizer` | `core/workedHoursNormalizer.js` | Clock rounding/capping |
| `AvailabilityManager` | `core/availability.js` | Availability rules |
| `AssessmentManager` | `core/assessment.js` | Exam/test dates |
| `PolicyFlags` | `core/policyFlags.js` | Payroll policy flags |
| `EffectiveRoster` | `core/effectiveRoster.js` | Reconciliation roster |
| `Reconcile` | `core/reconcile.js` | Full reconciliation pipeline |
| `StudentData` | `data/students.js` | Sample / seed student data |
| `CSVParser` | `data/csv.js` | CSV import |
| `AppStateManager` | `core/state.js` | Central state, swaps, ledger persistence |
| `SchedulingEngine` | `core/schedulingEngine.js` | Assignment / rebalance |
| `SchedulerExport` | `core/export.js` | CSV/ICS export |
| `StorageManager` | `utils/storage.js` | IndexedDB |
| `APIClient` | `utils/api.js` | REST client (optional backend) |
| `NotificationManager` | `utils/notifications.js` | Toasts / push hooks |
| `*View` classes | `views/*.js` | UI controllers |
| `app` | `app.js` (on DOMContentLoaded) | `ShiftSchedulerApp` instance |

**Classes without `window` export:** `ShiftSchedulerApp` (only via `window.app` after init).

---

## 4. Worked-hours pipeline (data flow, not UI routes)

```
PayrollParser → IdentityMap → EffectiveRoster → WorkedHoursNormalizer
  → PolicyFlags + Reconcile (UNROSTERED/ABSENCE)
  → { clockedStud, adherence, flaggedSessions, absences }
  → HoursLedger v1.3 (E3) → AppStateManager.getHoursLedgerReport
  → Students view tab: ledger
```

Canonical spec: `Documentation/prelude.md` §0.

---

## 5. Persistence (IndexedDB — `StorageManager`)

**Database:** `ShiftSchedulerDB` · **Version:** `2`

| Store | Key | Purpose |
|-------|-----|---------|
| `schedules` | month id (`YYYY-MM` calendar) | Saved month schedules + meta (`swapDebts`) |
| `students` | student id | Student records |
| `swaps` | auto | Swap requests |
| `pendingChanges` | — | Offline sync queue |
| `settings` | string key | App settings, identity-map overrides |
| `timeEntries` | `username\|shiftStartedISO` | Payroll clock rows (B2) |

Month keys must use **calendar month** (`HoursLedger.monthKey` semantics). See `Documentation/prelude.md` known gaps.

---

## 6. Backend / API (optional — scaffold only)

| Path | Status |
|------|--------|
| `server/index.js` | Express + Socket.IO entry; **references routes not present in repo** |
| `server/routes/*`, `server/middleware/*`, etc. | **Not shipped** — referenced by `index.js` only |

**Client API surface** (`src/js/utils/api.js`): `/api/schedules`, `/api/shifts`, `/api/students`, `/api/swaps`, auth, availability, contracts, notifications.

**Runtime today:** PWA runs **offline-first** from IndexedDB; backend is future/SaaS path.

---

## 7. Service worker cache (`sw.js`)

Caches shell: `index.html`, CSS, `config.js`, `app.js`, icons. API patterns: `/api/schedules`, `/api/shifts`, `/api/students`, `/api/swaps`.

**Note:** SW static list is minimal; most `src/js/core/*` modules are **not** in `STATIC_FILES` — extend cache if offline-first must cover full app.

---

## 8. Full directory tree

*(Excludes `node_modules/` — not part of project knowledge.)*

```
Student Scheduler PWA/
├── index.html                 # App shell, nav, view containers, script tags
├── manifest.json              # PWA manifest
├── sw.js                      # Service worker
├── package.json               # npm scripts + dependencies
├── package-lock.json          # Lockfile (optional for AI uploads)
├── README.md
├── IMPLEMENTATION_GUIDE.md
├── PHASE1_SETUP_GUIDE.md
├── PWA_Development_Action_Plan.md
├── generate-icons.html        # Dev utility — icon generator
│
├── assets/
│   ├── icons/
│   │   ├── icon-72x72.png
│   │   ├── icon-192x192.png
│   │   └── icon-512x512.png
│   └── screenshots/           # (empty or PWA store assets)
│
├── database/
│   ├── schema.sql             # PostgreSQL schema (backend track)
│   └── setup.js               # DB setup CLI
│
├── server/
│   └── index.js               # Express server scaffold (routes TBD)
│
├── Documentation/
│   ├── prelude.md                         # Worked-hours canonical spec §0
│   ├── Cursor_Prompts_WorkedHours_Integration.md
│   ├── Locked_Decisions_Log.md
│   ├── Hours_Tracking_System_Reference.md
│   ├── Worked_Hours_Feature_Spec.md
│   ├── Working_Around_Your_Studies.md
│   ├── SchedulingEngine_Architecture_Review.md
│   ├── SchedulingEngine_Action_Plan.md
│   ├── SchedulingEngine_Test_Strategy.md
│   ├── SchedulingEngine_Refactoring_Guide.md
│   ├── SchedulingEngine_Performance_Optimization.md
│   └── Project_Directory_Map.md           # ← this file
│
├── tests/
│   ├── payrollParser.smoke.js
│   ├── identityMap.smoke.js
│   ├── effectiveRoster.smoke.js
│   └── reconcile.smoke.js
│
└── src/
    ├── styles/
    │   ├── main.css
    │   ├── components.css
    │   └── responsive.css
    │
    └── js/
        ├── app.js             # ShiftSchedulerApp bootstrap → window.app
        ├── config.js
        │
        ├── vendor/
        │   └── xlsx.full.min.js   # SheetJS vendored for browser (B1)
        │
        ├── core/                    # Domain logic — no DOM
        │   ├── utils.js
        │   ├── logger.js
        │   ├── contracts.js
        │   ├── hoursLedger.js       # Ledger v1.2 → v1.3 (E3)
        │   ├── payrollParser.js
        │   ├── identityMap.js
        │   ├── workedHoursNormalizer.js
        │   ├── availability.js
        │   ├── assessment.js
        │   ├── policyFlags.js
        │   ├── effectiveRoster.js
        │   ├── reconcile.js
        │   ├── state.js             # AppStateManager
        │   ├── schedulingEngine.js
        │   └── export.js
        │
        ├── data/                    # Static / sample data helpers
        │   ├── students.js
        │   └── csv.js
        │
        ├── utils/                   # Infrastructure
        │   ├── storage.js           # IndexedDB
        │   ├── api.js               # REST client
        │   └── notifications.js
        │
        └── views/                   # UI — one class per primary view
            ├── dashboard.js
            ├── schedule.js
            ├── swaps.js
            ├── students.js          # incl. ledger tab
            ├── analytics.js
            └── settings.js
```

---

## 9. Naming conventions (keep routing consistent)

| Layer | Convention | Example |
|-------|------------|---------|
| Primary view id | lowercase single word | `dashboard`, `schedule` |
| DOM container | `#<view>-view` | `#students-view` |
| Nav button | `data-view="<view>"` | `data-view="students"` |
| View class | `<Name>View` | `StudentsView` |
| View file | `src/js/views/<view>.js` | `students.js` |
| Core module file | `camelCase.js` in `core/` | `hoursLedger.js` |
| Global export | `window.PascalCase` or descriptive | `HoursLedger`, `SchedulerUtils` |
| IndexedDB store | plural camelCase | `timeEntries`, `swapDebts` (in schedule meta) |
| Month key | calendar `YYYY-MM` | `2025-09` |

**Adding a primary view checklist:**

1. `index.html` — nav button + `#<name>-view` container
2. `src/js/views/<name>.js` — class with `constructor(app)`, `init()`, `this.container = document.getElementById('<name>-view')`
3. `index.html` — script tag before `app.js`
4. `app.js` — register in `this.views` and shortcut array
5. Optional: notification/deep-link targets in `notifications.js`

**Adding a students-style sub-tab:** use `data-tab` (or a view-specific prefix like `data-swap-view`), keep tab state on the view class, do **not** add top-level nav entries.

---

## 10. Documentation index (by concern)

| Concern | Primary doc |
|---------|-------------|
| Worked-hours build prompts | `Cursor_Prompts_WorkedHours_Integration.md` |
| Worked-hours spec §0 | `prelude.md` |
| Locked decisions | `Locked_Decisions_Log.md` |
| Hours ledger math | `Hours_Tracking_System_Reference.md` |
| Scheduling engine | `SchedulingEngine_Architecture_Review.md` |
| This map | `Project_Directory_Map.md` |

---

*When in doubt: primary navigation = `data-view` + `navigateToView`; sub-navigation = view-local tabs; data modules live in `core/`; DOM lives in `views/`.*
