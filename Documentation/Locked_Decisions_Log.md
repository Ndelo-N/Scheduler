# StudentShiftScheduler — Locked Decisions Log

**Version:** v1.2 · **Owner:** Lindelo ("the Don") · **Status:** living document  
**Repo snapshot:** modular PWA at `Student Scheduler PWA/` · **Last aligned:** 2026-06-26

**Purpose.** Single source of truth for every decision that has been *locked* for the scheduler, the worked-hours feature, and the hours ledger. Supersedes decisions scattered across chat, prompt files, and reference docs. When a decision changes, edit it here and bump the version + changelog.

**Status legend**

| Tag | Meaning |
|---|---|
| **[LOCKED]** | Decided — build to this |
| **[OPEN]** | Needs a decision before dependent work |
| **[IMPLEMENTED]** | Locked decision is reflected in the current repo |
| **[PARTIAL]** | Started in repo; gaps noted |
| **[NOT STARTED]** | Locked target; no code yet |
| **[TARGET]** | Future state (usually v1.3 / worked-hours track) |

**Implements-in** points at the track / prompt that carries the decision into code (see §10; prompt IDs A1–F1 refer to `Cursor_Prompts_WorkedHours_Integration.md`).

**Companion docs (unchanged by this log):** `Working_Around_Your_Studies.md` is **aspirational** student copy — describes target behaviour, not a repo audit.

---

## 0. Repository implementation snapshot (2026-06-26)

Use this table before reading §§1–12. It reflects the **modular PWA** (`index.html`, `src/js/`), not the legacy monolith in `Scheduler/index.html`.

| Area | In repo today | Key paths | Notes |
|---|---|---|---|
| **PWA boot** | ✅ Runnable | `index.html`, `src/js/core/utils.js` (`SchedulerUtils`), `src/js/app.js` | Global script load order; no bundler required for daily use |
| **State / swaps** | ✅ | `src/js/core/state.js` (`AppStateManager`) | `swapDebts`, `executeApprovedSwap`, persist via IndexedDB meta + export |
| **Scheduling engine** | ✅ | `src/js/core/schedulingEngine.js` | `rebalance()` → `rebalanceSSD()`; exam rules in engine + `AssessmentManager` |
| **Exam policy (Jun/Nov)** | ✅ [PARTIAL] | `assessment.js`, `schedulingEngine.js` | Strict D−1 + post-exam buffer in **June/November** via `testDates` + `unavailable_dates` (exam-flagged). **Not** yet from uploaded assessment timetable (§8.5) |
| **Early opening (large tests)** | ✅ | `state.js`, `settings.js` | `suggestEarlyOpeningForLargeTests`, `adjustTestShiftCapacity` |
| **Hours ledger v1.2** | ✅ | `src/js/core/hoursLedger.js` (`VERSION: '1.2'`), `students.js` (Hours ledger tab) | Full policy: claimable cap, period carry, reduced-contract suggestion. **`Stud` = scheduler-assigned** hours from saved schedules |
| **Hours reference doc** | ✅ v1.2 | `Hours_Tracking_System_Reference.md` | Matches code I6 (scheduler-owned Stud). **v1.3 doc bump not done** (Prompt A1) |
| **Worked-hours / payroll** | ❌ | — | No `PayrollParser`, `timeEntries`, SheetJS, reconciliation pipeline |
| **Assessment timetable Excel** | ❌ | — | Per-student `testDates` UI exists; unified module-keyed upload is **target** (§8.5) |
| **Automated tests** | ❌ | — | Jest configured; **zero** project test files; **no** scheduling or hours golden master |
| **Storage** | ✅ [PARTIAL] | `src/js/utils/storage.js` | `dbVersion: 1`. `saveMonthSchedule` uses padded `YYYY-MM`; legacy `saveSchedule` may use unpadded `${year}-${month}` — see §9.3 |
| **Backend / Phase 11** | Scaffold only | `server/index.js`, `database/schema.sql` | Not part of shippable PWA |

**Architecture-review note:** Older docs (`SchedulingEngine_Architecture_Review.md`) listed missing `SchedulerUtils` and a non-runnable PWA. Those findings are **resolved** in the current modular tree. Worked-hours reconciliation should still read **persisted** IndexedDB/export payloads rather than assuming a live in-memory session — but **`AppStateManager` is implemented** and is the normal write path for `swapDebts` and schedules.

---

## 1. Scope & domain framing

| # | Decision | Status |
|---|---|---|
| 1.1 | The system is a **scheduler and tracker of scheduled-vs-contracted hours**. Worked-hours (payroll clock) ingestion is a **new feature** — not in repo yet. | [LOCKED] · today = scheduler + assigned-hours ledger |
| 1.2 | Worked-hours will introduce a **third quantity** — *actually-clocked* hours — distinct from *scheduled* and *contracted*. | [LOCKED] · [NOT STARTED] |
| 1.3 | Two reconciliations are required: **(a) adherence** = scheduled vs clocked (weekly); **(b) contract ledger** = worked vs contracted+claimed (per contract period). Today only **(b)** exists in simplified form using assigned hours as `Stud`. | [LOCKED] · (a) [NOT STARTED]; (b) [IMPLEMENTED] v1.2 interim |

---

## 2. Worked-hours ingestion

Source (target): weekly **VeraLab "DetailedPayroll" `.xls`** export. See `Cursor_Prompts_WorkedHours_Integration.md` §0.

| # | Decision | Status | Implements-in |
|---|---|---|---|
| 2.1 | **Full dump every week**, idempotent **upsert** on `username \| shiftStartedISO`. | [LOCKED] · [NOT STARTED] | B2, C1 |
| 2.2 | **Drop both IP columns** on ingest. | [LOCKED] · [NOT STARTED] | C1 |
| 2.3 | Recompute duration; `Total Time` sanity-check only (±1 min). | [LOCKED] · [NOT STARTED] | C1 |
| 2.4 | **Monthly attribution by `Shift Started` date (SAST).** Max operational end **22:00**; no midnight cross. | [LOCKED] · [NOT STARTED] | C1, E2 |
| 2.5 | **Open session** → `status:'open'`, excluded from totals, flagged. | [LOCKED] · [NOT STARTED] | C1 |
| 2.6 | Clock timestamps **naïve SAST wall-clock** — never UTC-convert on ingest. | [LOCKED] · [NOT STARTED] | C1, E1, E2 |
| 2.7 | Store **both** clocked and scheduled. **Target:** ledger `Stud` = clocked; scheduled = adherence baseline. **Today:** only assigned `Stud` in v1.2 ledger. | [LOCKED] · [TARGET] v1.3 | E2, E3, A1 |

---

## 3. Clock-time normalization policy

Each clocked session matched to scheduled block `[S, E]` on the **:30 grid**. **All [NOT STARTED]** — spec in Cursor prompts §0.

| # | Decision | Status |
|---|---|---|
| 3.1 | `round_in`: minute ≤ 44 → `H:30`; ≥ 45 → next `H:00`. | [LOCKED] · [NOT STARTED] |
| 3.2 | `round_out`: minute ≥ 20 → `H:30`; ≤ 19 → `H:00`. | [LOCKED] · [NOT STARTED] |
| 3.3 | `recorded_start = max(round_in(clock_in), S)` — no early credit. | [LOCKED] · [NOT STARTED] |
| 3.4 | `recorded_end = min(round_out(clock_out), E)` — no overtime credit. | [LOCKED] · [NOT STARTED] |
| 3.5 | Admin-edited rows bypass rounding/caps; overtime allowed. | [LOCKED] · [NOT STARTED] |
| 3.6 | `LATE_GRACE_MIN = 0`. | [LOCKED] · [NOT STARTED] |

---

## 4. Policy flags

| # | Decision | Status |
|---|---|---|
| 4.1 | Full flag set (`LATE_IN`, `EARLY_OUT`, `OUTSIDE_HOURS`, `OVER_5H`, `TEST_CONFLICT`, `UNROSTERED`, `ABSENCE`, anomalies, `EDITED`). Engine enforces exam/test **scheduling** rules today; payroll flags **[NOT STARTED]**. | [LOCKED] · scheduling [PARTIAL]; payroll [NOT STARTED] |
| 4.2 | **Flag-for-review, never auto-discard.** | [LOCKED] · [NOT STARTED] for payroll |
| 4.4 | **`UNROSTERED` credit:** no scheduled block ⇒ `worked_minutes = 0` toward `Stud`; uncredited clock duration preserved and surfaced separately; admin **accept** adds into register/`Stud`, **reject** leaves excluded (default uncredited). | [LOCKED] · [NOT STARTED] · E3 |
| 4.3 | `OUTSIDE_HOURS` uses **per-date** operational window (max 22:00). Engine has per-date op-hours; payroll path **[NOT STARTED]**. | [LOCKED] |

---

## 5. Effective-roster reconciliation

| # | Decision | Status |
|---|---|---|
| 5.1 | "Scheduled" for reconciliation = **effective roster**, not frozen publication. | [LOCKED] · [NOT STARTED] |
| 5.2 | Effective roster = saved month schedule + approved swaps + `swapDebts` chain + admin overrides. | [LOCKED] · [NOT STARTED] |
| 5.3 | Approved swap counts even if month schedule not re-saved. | [LOCKED] · swap execution [IMPLEMENTED] in `AppStateManager`; effective-roster builder [NOT STARTED] |
| 5.4 | Reconciliation reads **persisted** `swapDebts`, saved schedules, and approved swap-requests (IndexedDB / export). It must **not require** a separate monolith runtime. **`AppStateManager` exists** and persists these fields — use storage/export as the read boundary for headless reconciliation, not "undefined class" workarounds. | [LOCKED] · [IMPLEMENTED] persistence; [NOT STARTED] `EffectiveRoster` module |
| 5.5 | Match each clocked session to contiguous scheduled block on :30 grid. | [LOCKED] · [NOT STARTED] |

---

## 6. Identity mapping

| # | Decision | Status |
|---|---|---|
| 6.1 | Students log in with **u-number** (target / Phase 11+). | [LOCKED] · auth [NOT STARTED] |
| 6.2 | Map u-number → student via email prefix, else name, else **pending bucket**. | [LOCKED] · [NOT STARTED] |
| 6.3 | Persisted admin override table for pending mappings. | [LOCKED] · [NOT STARTED] |

---

## 7. Hours ledger & contract policy

**Reference:** `Hours_Tracking_System_Reference.md` **v1.2** (matches code). **Target:** v1.3 when clocked `Stud` lands (Prompt A1 + E3 extension).

### 7A — Implemented now (v1.2, assigned `Stud`)

| # | Decision | Status | Repo |
|---|---|---|---|
| 7A.1 | **I6 (interim):** `Stud` = **scheduler-assigned** hours from saved monthly schedules (`ContractManager.computeAssignedHours`). | [IMPLEMENTED] | `state.js` → `HoursLedger.buildStudentLedger` |
| 7A.2 | Claimable-hours cap **I7**; claims validated on save. | [IMPLEMENTED] | `hoursLedger.js`, Students → Hours ledger tab |
| 7A.3 | Contract-period calendar Mar–May … Nov-final in **ledger module**, not contract manager. | [IMPLEMENTED] | `hoursLedger.js` `DEFAULT_CONTRACT_PERIODS` |
| 7A.4 | ±10h carry **I8**, final-period dead-cap **I9**, reduced contract **I10** suggestion + approve flow. | [IMPLEMENTED] | `HoursLedger.evaluatePeriodBoundary`, `suggestReducedContract`, `state.approveReducedContract` |
| 7A.5 | Policy escalation ladder & term-balance SSD **documented** in reference §11/§13; **not wired** into engine rebalance yet. | [LOCKED] · [NOT STARTED] in engine | reference only |

### 7B — Target (v1.3, clocked `Stud`) — locked, not in code

| # | Decision | Status |
|---|---|---|
| 7B.1 | **I6 redefined:** `Stud` owned by **clock/payroll**; assigned total = **adherence baseline** only. Gap = adherence signal, not sync bug. | [LOCKED] · [TARGET] · Prompt A1, E2–E3 |
| 7B.2 | Weekly **adherence** series published alongside ledger. | [LOCKED] · [NOT STARTED] |
| 7B.3 | Bump `Hours_Tracking_System_Reference.md` and `HoursLedger.VERSION` together when switching Stud source. | [LOCKED] · reference still v1.2; code `VERSION: '1.2'` |

---

## 8. Scheduling-engine decisions

| # | Decision | Status | Repo |
|---|---|---|---|
| 8.1 | **Test-day policy.** **Exams** (June & November calendar months): block **all shifts on D−1**; on **D** allow shifts only from **`exam_end + 1h`**. **Tests** (other months): overlap + 1h post buffer. **Today:** times from `student.testDates` + exam-flagged `unavailable_dates` via `AssessmentManager.allExamsForStudent` — **not** module timetable (§8.5). Payroll `TEST_CONFLICT` **[NOT STARTED]**. | [LOCKED] · [IMPLEMENTED] engine · [PARTIAL] data source | `schedulingEngine.js`, `assessment.js` |
| 8.2 | **Early opening for large tests:** keep monolith behaviour. | [IMPLEMENTED] | `state.suggestEarlyOpeningForLargeTests`, Settings UI |
| 8.3 | **Rebalance:** replace gap heuristic with **SSD** (`H_a − H_b > h` gate + pair + consistency passes). | [IMPLEMENTED] | `schedulingEngine.rebalanceSSD` — **golden master not captured** (§10.1 gap) |
| 8.4 | **Rebalance evolution:** monthly-hours SSD → **term-balance SSD** `Φ = Σ Bal²` with lexicographic final-period mode. Gated on ledger. | [LOCKED] · [NOT STARTED] | |
| 8.5 | **Unified assessment-timetable ingestion** (Excel: date, module, start, end, type). **Target** replaces date-only `testDates` as canonical source. | [LOCKED] · [NOT STARTED] | Students → Test dates tab is interim UI |

---

## 9. Persistence & dependencies

| # | Decision | Status | Repo |
|---|---|---|---|
| 9.1 | IndexedDB **`timeEntries`** store; `dbVersion` bump + migration. | [LOCKED] · [NOT STARTED] | `storage.js` `dbVersion: 1` |
| 9.2 | **SheetJS** for browser + Node harness. | [LOCKED] · [NOT STARTED] | not in `package.json` |
| 9.3 | **Standardize month-schedule key** to zero-padded `YYYY-MM` (JS month 0-indexed → **calendar month** in key). Known issue: `StorageManager.monthScheduleId(year, month)` pads `month` without `+1` while `HoursLedger.monthKey(year, monthIndex)` uses `monthIndex + 1` — reconcile before worked-hours reads schedules. | [LOCKED] · [PARTIAL] | Prompt B3 |
| 9.4 | Prototype-pollution guard on CSV/JSON header mapping. | [LOCKED] · [PARTIAL] | `SchedulerExport.escapeCsvCell`; payroll parser [NOT STARTED] |

---

## 10. Sequencing & tracks

```
Track A — Safety net (golden master + tests)        ← NOT STARTED; still gates *future* output changes
        │
        ├──► Worked-hours ingestion (B–F)            ← NOT STARTED
        │         │
        │         └──► Ledger v1.3 (extend v1.2)     ← TARGET after/alongside ingestion
        │
        ├──► Engine-quality (partially done)         ← SSD, exam policy, early opening IN REPO
        │         └──► term-balance SSD              ← gated on ledger + tests
        │
        └──► Robustness & structure                  ← after behaviour pinned
```

| # | Decision | Status |
|---|---|---|
| 10.1 | **Track A first** for any *new* output-changing work. SSD rebalance shipped **without** golden master — **technical debt**; capture baseline before next engine change. | [LOCKED] · [PARTIAL] — engine changed, tests missing |
| 10.2 | **v1.2 ledger policy** implemented on assigned hours (interim). **v1.3** Stud source switches when ingestion live. | [LOCKED] · v1.2 [IMPLEMENTED]; v1.3 [TARGET] |
| 10.3 | Term-balance SSD gated on ledger + tests. | [LOCKED] · [NOT STARTED] |
| 10.4 | Worked-hours track is **engine-independent**. Does **not** block on legacy boot-blockers (already fixed). | [LOCKED] |

---

## 11. Cross-cutting principles

| # | Principle | Status |
|---|---|---|
| 11.1 | **No silent assumptions** — surface open questions. | [LOCKED] |
| 11.2 | **Correctness → tests → structure.** | [LOCKED] · tests [NOT STARTED] |
| 11.3 | **Golden master is the contract** for output-changing steps. | [LOCKED] · scheduling GM [NOT STARTED]; hours GM [NOT STARTED] |
| 11.4 | **Empirical grounding** — real export + real schedule fixtures. | [LOCKED] |
| 11.5 | Version headers on docs + `HoursLedger.VERSION` stay in sync. | [LOCKED] · both at **1.2** today |

---

## 12. Open questions & resolutions

| # | Question | Status |
|---|---|---|
| 12.1 | `LATE_GRACE_MIN` value. | **RESOLVED → 0** |
| 12.2 | Exam/test time **source**. | **TARGET →** uploaded assessment timetable (§8.5). **INTERIM (repo) →** `testDates` + exam-flagged `unavailable_dates`. |
| 12.3 | Midnight-crossing. | **RESOLVED →** impossible; op window max **22:00**. |
| 12.4 | Fold exam rule into payroll `TEST_CONFLICT`? | **RESOLVED → yes** when payroll track ships (§0/D2). Engine already enforces scheduling side. |
| 12.5 | **Student↔module enrolment** for module-keyed timetable. | **[OPEN]** — blocks §8.5 and payroll `TEST_CONFLICT` with timetable source. Does **not** block current interim `testDates` engine rules. |

---

## Changelog

- **v1.2** — Aligned to current modular PWA repo (2026-06-26). Added §0 implementation snapshot. Corrected stale claims (`SchedulerUtils`, `AppStateManager` boot blockers). Split §7 into **7A implemented v1.2** vs **7B target v1.3**. Marked §8 engine items implemented with file refs. Updated §5.4, §9.3, §10, §12.2. Supersedes v1.1 boot-blocker and "ledger not in code" assumptions.
- **v1.1** — Resolved §12 questions: `LATE_GRACE_MIN = 0`; assessment timetable target (8.5); midnight max 22:00; exam rule in payroll flags. Added 12.5.
- **v1.0** — Initial consolidation of worked-hours, ledger, engine, persistence, sequencing, and open questions.
