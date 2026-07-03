# Worked-Hours Feature Spec

**Version:** v1.0 · **Spec source:** `Documentation/prelude.md §0` (canonical)  
**Status:** Phase A documentation — implementation NOT STARTED (Phases B–F)  
**Last updated:** 2026-06-30

---

## 1. Purpose

Add ingestion of weekly **VeraLab "DetailedPayroll" `.xls`** exports so the browser PWA can track *actually-clocked* hours alongside *scheduled* hours. This produces two new outputs:

1. **Adherence series** — scheduled vs clocked, per student per ISO week.
2. **Contract ledger v1.3** — `Stud` redefined as clocked/reconciled minutes per month (replaces the interim assigned-hours `Stud` from ledger v1.2).

The feature is **engine-independent** and additive; it does not modify scheduling-assignment logic or `performSwap`.

---

## 2. Data Source

**Source:** weekly full-dump VeraLab "DetailedPayroll" `.xls` export (browser upload).

**Raw columns** (header text contains non-breaking spaces `\u00a0` — normalize to regular spaces on parse):

```
Username, First Name, Last Name, Shift Started, Shift Ended, Pay Rate,
Total Time, Total Pay, Sign On IP Address, Sign Out IP Address,
Edited By, Editor's First Name, Editor's Last Name, Date Edited
```

**Timezone:** SAST (UTC+2). All clock timestamps are **naïve local wall-clock** — never UTC-convert on ingest.

---

## 3. Identity Map

Map payroll `Username` + names to scheduler students.

| Priority | Method | Fallback |
|---|---|---|
| 1 | u-number via email prefix (`u21494534@…` → `u21494534`) | → next |
| 2 | Normalized full name match | → next |
| 3 | **Pending bucket** — never silently drop | — |

A persisted admin-override table (settings store) allows manual resolution of pending mappings. (Implements-in: Prompt C2.)

---

## 4. Ingestion Rules

*(Source: prelude.md §0)*

- **Full-dump every week, idempotent:** upsert on natural key `username|shiftStartedISO`. Re-uploading overlapping data updates, never duplicates.
- **Drop** `Sign On IP Address` and `Sign Out IP Address` on ingest (PII minimization; not needed downstream).
- **`Total Time` is redundant** — recompute duration from `Shift Started`/`Shift Ended`; use `Total Time` only as a parse sanity-check (must match within 1 min).
- **Open session** = `Shift Ended` empty → store with `status:'open'`, no duration, excluded from totals, flagged `OPEN_SESSION`.
- **Admin-edited row** = `Edited By` non-empty → accept clock times **verbatim** (no rounding, no caps, overtime allowed, no late/early flags); set `edited:true`.
- **Monthly attribution** is by `Shift Started` **date** (SAST). No shift crosses midnight (all shifts end ≤ 20:00; operational window max 22:00).

---

## 5. Normalization

*(Reproduced verbatim from prelude.md §0 — canonical source of truth.)*

### Shift grid

Scheduled shifts are 1-hour slots on the **:30 grid** (06:30–18:30; opening 06:30; closing 17:30–18:30). A clocked *session* spans a **contiguous block** of assigned slots; let `[S, E]` be that block's scheduled start/end (both on :30).

### Normalization (non-admin rows)

Per session matched to its block `[S, E]`:

- `round_in(t)`  : let `H` = hour of `t`, `m` = minute. `m ≤ 44 → H:30`, else `→ (H+1):00`.
- `round_out(t)` : `m ≥ 20 → H:30`, else `→ H:00`.
- `recorded_start = max(round_in(clock_in), S)`   // no early credit
- `recorded_end   = min(round_out(clock_out), E)` // no overtime credit
- `worked_minutes = max(0, recorded_end − recorded_start)`

### Flags (non-admin rows)

Constants are tunable (`LATE_GRACE_MIN = 0`):

| Flag | Rule |
|---|---|
| `LATE_IN` | `clock_in > S` — any lateness after the scheduled start (grace 0); rounding still snaps to grid |
| `EARLY_OUT` | `recorded_end < E` (relative to scheduled end) |
| `OUTSIDE_HOURS` | `recorded_start < opStart(date)` OR `recorded_end > opEnd(date)` — op-hours **per date** from operational-hours config (varies with public/batch holidays and special hours; never hardcode 06:00–19:00; window may extend to max 22:00, never past midnight) |
| `OVER_5H` | a single contiguous worked block > 5h |
| `TEST_CONFLICT` | session violates assessment policy — **exam** (June/Nov calendar months): any work on **D−1** or on **D** before `exam_end + 1h`; **test**: overlap + 1h after. **Interim:** derive assessments from `AssessmentManager.allExamsForStudent` until module timetable upload lands (Decisions Log §12.5) |
| `UNROSTERED` | session has no matching scheduled block on the effective roster (§6); **zero Stud credit**; uncredited minutes preserved for admin accept/reject (§7.3) |
| `ABSENCE` | an effective-roster block has no matching clocked session → route to swap-market view, not a hard error |
| `ZERO_DURATION` / `OPEN_SESSION` / `NEGATIVE_DURATION` | data anomalies |
| `EDITED` | informational (admin-edited row) |

**Policy on flags:** flag-for-review, never auto-discard. All flagged rows are visible and overridable.

---

## 6. Effective Roster

*(Source: prelude.md §0)*

The "scheduled" baseline for reconciliation is **not** the frozen publication. For a given date, start from the **saved month schedule** (IndexedDB `schedules` store, `shifts` array via `StorageManager.getMonthSchedule`), then apply in `createdAt` order:

1. **Approved swap-requests** (`swaps` store, `status:'approved'`)
2. The persisted **`swapDebts`** log in schedule meta/export (`{from, to, shift:"date start", createdAt}` — chainable A→B→C ⇒ C)
3. **Admin overrides** on shifts (`adminOverrideBy`/`adminOverrideAt`)

An approved swap counts even if not re-applied to the saved month. Read from IndexedDB/export — **do not** depend on the legacy monolith runtime.

(Implements-in: Prompt E1.)

---

## 7. Outputs

### 7.1 Adherence (weekly delta)

`Σ scheduled_minutes − Σ worked_minutes`, per student per ISO week.

- Scheduled minutes are derived from the effective roster (§6).
- Published as a separate series alongside the contract ledger.

### 7.2 Contract Ledger v1.3 — `Stud` (clocked)

`Stud(month) = Σ worked_minutes` per student per calendar month — **clocked**, not scheduler-assigned.

This redefines invariant **I6** from v1.2:

| Version | I6 definition |
|---|---|
| v1.2 (current) | `Stud` = scheduler-assigned hours (`ContractManager.computeAssignedHours`) |
| v1.3 (target) | `Stud` = clocked/reconciled minutes from payroll; assigned total = adherence baseline only |

The gap between assigned and clocked is an **adherence signal**, not a sync bug. All other ledger invariants (I7–I10: claimable cap, carry, dead-cap, reduced-contract) are unchanged. The assigned-hours path remains the fallback until payroll data exists for a given month.

**Credited vs uncredited.** Only **credited** `worked_minutes` enter `Stud`. `UNROSTERED` sessions (no effective-roster block) contribute **zero** credit but retain **uncredited minutes** (grid-rounded clock span without block clamp) for admin review.

### 7.3 Uncredited clocked time (UNROSTERED pool)

Per student per month: `Σ uncredited_minutes` from `UNROSTERED` sessions, surfaced **separately** from credited `Stud` in the ledger report.

| Admin action | Effect |
|---|---|
| *(default)* | Uncredited; excluded from `Stud` and contract balance |
| **Accept** | Minutes added into the register / `Stud` for that month (sanctioned work that was not rostered) |
| **Reject** | Remains excluded |

Decisions are persisted. Implements-in: Prompt E3 (ledger report + accept/reject UI/persistence).

(Implements-in: Prompts A1, E2, E3.)

---

## 8. Persistence

### 8.1 `timeEntries` IndexedDB store

New store added to `src/js/utils/storage.js` alongside the existing `schedules` and `swaps` stores.

| Field | Description |
|---|---|
| Key | `username\|shiftStartedISO` (natural upsert key) |
| Indexes | `username`, `dateISO`, `monthKey` (calendar `YYYY-MM`) |
| `status` | `'complete'` \| `'open'` |
| `edited` | `true` if admin-edited row |
| IP columns | **dropped on ingest** |
| `worked_minutes` | computed after normalization; absent for open sessions |

Methods: `upsertTimeEntries`, `getTimeEntriesForMonth`, `getTimeEntriesForStudent`, `clearTimeEntries`.

(Implements-in: Prompt B2.)

### 8.2 `dbVersion` bump

`storage.js` `dbVersion` 1 → 2 to add the `timeEntries` store. Migration is additive; existing `schedules`/`swaps` data is untouched.

### 8.3 Month-key standardization

All schedule IDs and `timeEntries` `monthKey` values use **calendar `YYYY-MM`** (JS month index + 1, zero-padded). Known gap: `StorageManager.monthScheduleId` currently pads the 0-indexed JS month without `+1`. Fix in Prompt B3 before payroll reads schedules.

---

## 9. Dependencies

### 9.1 SheetJS (`window.XLSX`)

Required to parse binary `.xls` payroll exports in the browser and in the Node test harness.

- **Browser:** vendored or CDN `window.XLSX`; load before `PayrollParser` in `index.html`.
- **Node harness:** `xlsx` devDependency (`require('xlsx')`).
- No bundler required.

(Implements-in: Prompt B1.)

---

## 10. Already Implemented (do not rebuild)

| Component | Path | Notes |
|---|---|---|
| Hours ledger v1.2 | `src/js/core/hoursLedger.js` | `VERSION: '1.2'`; contract periods, I7–I10, golden anchor self-check; `Stud` = assigned (interim) |
| Ledger UI | `src/js/views/students.js` | Hours ledger tab; claims; reduced-contract approve flow |
| Engine exam rules (Jun/Nov) | `src/js/core/schedulingEngine.js`, `assessment.js` | D−1 block + post-exam buffer; `allExamsForStudent`, exam-flagged `unavailable_dates` |
| Swap persistence | `src/js/core/state.js` | `executeApprovedSwap`, `swapDebts` persisted via IndexedDB meta + export |
| Storage (base) | `src/js/utils/storage.js` | `dbVersion: 1`; `saveMonthSchedule` / `getMonthSchedule` |
| Prototype-pollution guard (partial) | `src/js/utils/storage.js` | `SchedulerExport.escapeCsvCell`; payroll parser guard NOT STARTED |

---

## 11. Out of Scope

The following are explicitly **excluded** from this feature track:

- Scheduling/assignment logic (do not modify `schedulingEngine.js` rebalance or `performSwap`)
- Backend (server, database) — `server/index.js` and `database/schema.sql` are scaffold only
- Assessment timetable upload (§8.5 of Decisions Log) — interim `testDates` + `allExamsForStudent` path is used
- Term-balance SSD (`Φ = Σ Bal²`) — gated on ledger + tests separately
- Analytics/dashboard wiring — after F1 green (post-track work item)

---

## 12. Open Questions

| # | Question | Status | Impact |
|---|---|---|---|
| 12.5 | **Student↔module enrolment** for module-keyed assessment timetable | **[OPEN]** — `Locked_Decisions_Log.md §12.5` | Blocks §8.5 (unified timetable upload) and `TEST_CONFLICT` with timetable source. **Does not block** the interim `testDates` / `allExamsForStudent` engine rules currently in use. |

Until §12.5 is resolved, `TEST_CONFLICT` in `PolicyFlags` derives assessment data from `AssessmentManager.allExamsForStudent`, with exam vs test inferred by whether the date falls in `EXAMINATION_MONTHS` (June/November).

---

## 13. Implementation Sequence

```
Phase A — Documentation (this file, A1–A4)
Phase B — Foundation: SheetJS (B1), timeEntries store (B2), month-key fix (B3)
Phase C — Parser + identity map: PayrollParser (C1), IdentityMap (C2)
Phase D — Normalization + flags: WorkedHoursNormalizer (D1), PolicyFlags (D2)
Phase E — Reconciliation: EffectiveRoster (E1), Reconcile (E2), HoursLedger v1.3 (E3)
Phase F — Golden master harness (F1)
Final   — Security + end-to-end audit (Opus)
```

Prompt IDs reference `Cursor_Prompts_WorkedHours_Integration.md`.

---

*Canonical spec: `Documentation/prelude.md §0`. All normalization rules above are reproduced verbatim from §0 — if there is a conflict, §0 wins.*
