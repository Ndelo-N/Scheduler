# Worked-Hours Integration — Session Prelude

**When to use.** At the start of every **fresh thread** (🧵 **Fresh thread: Yes** prompts in `Cursor_Prompts_WorkedHours_Integration.md`), paste this first:

> Read `Documentation/prelude.md` in full. Acknowledge guardrails accepted, canonical spec noted, and that you will not modify scheduling assignment logic or the monolith's `performSwap`. Then wait for my prompt.

Do **not** start implementing until the numbered prompt arrives.

**Paths.** All repo paths below are under `Student Scheduler PWA/`.

---

## Standing guardrails

Work in tiny, runnable steps, security-first, one module at a time. Trust actual run output over assumptions. Surface any assumption you make rather than adopting it silently.

**Out of scope for this track — do not modify:**
- The scheduling engine's scheduling / assignment logic
- The monolith's `performSwap`
- Any scheduling algorithm

New code is **additive**. After each change, show how to run/verify it.

**Sequencing.** Documents (Phase A) → foundation (B) → parser (C) → normalization (D) → reconciliation (E) → tests (F). Verify the stated acceptance check after each prompt before moving on.

**Governance.** Locked decisions and repo truth: `Documentation/Locked_Decisions_Log.md` (v1.2). Student-facing aspirational copy: `Documentation/Working_Around_Your_Studies.md` — **not** a repo audit.

---

## Repository snapshot (aligned 2026-06-26)

### Already in the modular PWA — do not rebuild

| Component | Path | Notes |
|---|---|---|
| PWA boot + globals | `index.html`, `src/js/core/utils.js` | `window.SchedulerUtils` defined |
| Application state | `src/js/core/state.js` | `class AppStateManager` — swaps, `swapDebts`, `executeApprovedSwap`, ledger persistence |
| Scheduling engine | `src/js/core/schedulingEngine.js` | `rebalance()` → `rebalanceSSD()`; Jun/Nov exam rules |
| Assessment helpers | `src/js/core/assessment.js` | `EXAMINATION_MONTHS`, `allExamsForStudent`, `testDates` + exam-flagged `unavailable_dates` |
| Early opening | `state.js`, `views/settings.js` | `suggestEarlyOpeningForLargeTests`, `adjustTestShiftCapacity` |
| **Hours ledger v1.2** | `src/js/core/hoursLedger.js` | `VERSION: '1.2'`; contract periods, I7–I10, golden anchor self-check |
| Ledger UI | `views/students.js` | Hours ledger tab; claims; reduced-contract approve |
| Storage (partial) | `src/js/utils/storage.js` | `dbVersion: 1`; `saveMonthSchedule` / `getMonthSchedule` |
| Reference doc | `Documentation/Hours_Tracking_System_Reference.md` | **v1.2** — matches code (assigned `Stud`) |

### Not in repo — built by prompt set B–F

| Component | Prompt |
|---|---|
| SheetJS / `window.XLSX` | B1 |
| `timeEntries` IndexedDB store | B2 |
| Month-key standardization (calendar month) | B3 |
| `PayrollParser`, `IdentityMap` | C1, C2 |
| `WorkedHoursNormalizer`, `PolicyFlags` | D1, D2 |
| `EffectiveRoster`, `Reconcile` | E1, E2 |
| Clocked `Stud` feed + ledger **v1.3** extension | A1 (doc), E3 (code) |
| Hours pipeline golden master | F1 |

### Known gaps (fix during B–F; not blockers for starting)

1. **Month keys:** `HoursLedger.monthKey(year, monthIndex)` uses **calendar month** (`monthIndex + 1`). `StorageManager.monthScheduleId(year, month)` currently pads JS **0-indexed** `month` without `+1` — B3 must align on **calendar `YYYY-MM`** everywhere.
2. **Legacy `saveSchedule`:** may write unpadded `${year}-${month}` ids — B3 migrates.
3. **Assessment source (interim):** engine + `PolicyFlags` should use `AssessmentManager.allExamsForStudent` until timetable upload (Decisions Log §12.5) exists.
4. **I6 transition:** v1.2 ledger uses **assigned** hours for `Stud`; v1.3 switches to **clocked** after `Reconcile` — **extend** `hoursLedger.js`, do not duplicate the module.
5. **SSD rebalance** shipped without scheduling golden master — separate debt; do not conflate with F1.

### Superseded assumptions — do not repeat

Older architecture-review text listed missing `SchedulerUtils` and undefined `AppStateManager`. **Both exist in the current repo.** Reconciliation should read **persisted** IndexedDB/export data; it does not need the monolith runtime.

---

## §0 — Canonical Spec (single source of truth)

**CANONICAL SPEC v1** — all prompts in `Cursor_Prompts_WorkedHours_Integration.md` reference this section.

### Context

The app is a browser PWA (scripts via tags, no bundler required) that schedules student assistants. It already has a **v1.2 hours ledger** (`src/js/core/hoursLedger.js`) where **`Stud` = scheduler-assigned hours** from saved schedules. This track adds ingestion of weekly **VeraLab "DetailedPayroll" `.xls`** exports so **`Stud` becomes clocked/reconciled minutes** (v1.3), with a separate **adherence** series (scheduled vs clocked). Timezone is **SAST (UTC+2)**; clock timestamps are **naïve local wall-clock** — never UTC-convert on ingest. Target auth uses **u-number** (e.g. `u21494534`); not required for ingestion MVP.

### Raw payroll columns

Header text uses non-breaking spaces (`\u00a0`) — normalize to regular spaces first.

`Username, First Name, Last Name, Shift Started, Shift Ended, Pay Rate, Total Time, Total Pay, Sign On IP Address, Sign Out IP Address, Edited By, Editor's First Name, Editor's Last Name, Date Edited`

### Ingestion rules

- **Full-dump every week**, idempotent: upsert on natural key `username|shiftStartedISO`. Re-uploading overlapping data updates, never duplicates.
- **Drop** `Sign On IP Address` and `Sign Out IP Address` on ingest (PII minimization; not needed).
- **Total Time is redundant** — recompute duration from `Shift Started`/`Shift Ended`; use `Total Time` only as a parse sanity-check (must match within 1 min).
- **Open session** = `Shift Ended` empty → store with `status:'open'`, no duration, excluded from totals, flagged.
- **Admin-edited row** = `Edited By` non-empty → accept clock times **verbatim** (no rounding, no caps, overtime allowed, no late/early flags); set `edited:true`.
- **Monthly attribution** is by `Shift Started` **date** (SAST). No shift crosses midnight (all shifts end ≤ 20:00; operational window max 22:00).

### Shift grid

Scheduled shifts are 1-hour slots on the **:30 grid** (06:30–18:30; opening 06:30; closing 17:30–18:30). A clocked *session* spans a **contiguous block** of assigned slots; let `[S, E]` be that block's scheduled start/end (both on :30).

### Normalization (non-admin rows)

Per session matched to its block `[S, E]`:

- `round_in(t)`  : let `H` = hour of `t`, `m` = minute. `m ≤ 44 → H:30`, else `→ (H+1):00`.
- `round_out(t)` : `m ≥ 20 → H:30`, else `→ H:00`.
- `recorded_start = max(round_in(clock_in), S)`   // no early credit
- `recorded_end   = min(round_out(clock_out), E)` // no overtime credit
- `worked_minutes = max(0, recorded_end − recorded_start)`

**UNROSTERED sessions** (no matching block on the effective roster): **`worked_minutes = 0`** for Stud credit and adherence worked totals — no scheduled block ⇒ no automatic credit. The session is still flagged `UNROSTERED` for review. Separately preserve **uncredited minutes**: grid-rounded clock span (`round_out(clock_out) − round_in(clock_in)`, no block clamp) so the admin can see what was actually clocked without it entering `Stud`.

### Flags (non-admin rows)

Constants are tunable (`LATE_GRACE_MIN = 0`):

| Flag | Rule |
|---|---|
| `LATE_IN` | `clock_in > S` — any lateness after the scheduled start (grace 0); rounding still snaps to grid |
| `EARLY_OUT` | `recorded_end < E` (relative to scheduled end) |
| `OUTSIDE_HOURS` | `recorded_start < opStart(date)` OR `recorded_end > opEnd(date)` — op-hours **per date** from operational-hours config (varies with public/batch holidays and special hours; never hardcode 06:00–19:00; window may extend to max 22:00, never past midnight) |
| `OVER_5H` | a single contiguous worked block > 5h |
| `TEST_CONFLICT` | session violates assessment policy — **exam** (June/Nov calendar months): any work on **D−1** or on **D** before `exam_end + 1h`; **test**: overlap + 1h after. **Interim:** derive assessments from `AssessmentManager.allExamsForStudent` until module timetable upload lands (Decisions Log §12.5) |
| `UNROSTERED` | session has no matching scheduled block on the **effective roster** (below); **zero Stud credit**; uncredited clock duration held for admin accept/reject (see §0 outputs) |
| `ABSENCE` | an effective-roster block has no matching clocked session → route to the swap-market view, not a hard error |
| `ZERO_DURATION` / `OPEN_SESSION` / `NEGATIVE_DURATION` | data anomalies |
| `EDITED` | informational (admin-edited row) |

**Policy on flags:** flag-for-review, never auto-discard. All flagged rows are visible and overridable.

### Effective roster (what "scheduled" means for reconciliation)

NOT the frozen publication. For a given date, start from the **saved month schedule** (IndexedDB `schedules` store, `shifts` array via `StorageManager.getMonthSchedule`), then apply in `createdAt` order:

1. **Approved swap-requests** (`swaps` store, `status:'approved'`)
2. The persisted **`swapDebts`** log in schedule meta/export (`{from, to, shift:"date start", createdAt}` — chainable A→B→C ⇒ C)
3. **Admin overrides** on shifts (`adminOverrideBy`/`adminOverrideAt`)

An approved swap counts even if not re-applied to the saved month. Read from IndexedDB/export — **do not** depend on the legacy monolith runtime.

### Outputs

- **Adherence (weekly delta)** = `Σ scheduled_minutes − Σ worked_minutes`, per student per ISO week. Only **credited** worked minutes count (UNROSTERED sessions contribute 0).
- **Contract ledger (v1.3):** `Stud(month)` = `Σ credited worked_minutes` per student per month (**clocked**, not assigned). Assigned totals feed adherence only. Redefines invariant **I6** from v1.2 (scheduler-assigned) per Prompt A1.
- **Uncredited clocked time (UNROSTERED pool):** per student per month, `Σ uncredited_minutes` from `UNROSTERED` sessions — surfaced **separately** from `Stud` in the ledger report. Admin may **accept** (add into the register / `Stud` for that month — e.g. sanctioned work that was not rostered) or **reject** (leave excluded). Persist accept/reject decisions; default is uncredited until accepted.

### Identity map

Seed from payroll `Username` + names. Map `u-number → student` via email prefix (`u21494534@…`), else normalized full name, else **pending bucket** (never silently drop).

---

*Prompt text and acceptance criteria: `Documentation/Cursor_Prompts_WorkedHours_Integration.md`*
