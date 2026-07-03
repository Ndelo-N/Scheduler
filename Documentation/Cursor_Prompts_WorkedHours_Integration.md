# Cursor Prompt Set — Worked-Hours Tracking Integration

**Purpose.** Integrate actual-clocked-hours ingestion (weekly VeraLab payroll `.xls` upload) into StudentShiftScheduler: documents first, then the build. Each prompt below is self-contained — paste one at a time, in order.

**Session start (required).** Guardrails, repository snapshot, and **§0 Canonical Spec** live in **`Documentation/prelude.md`** — not in this file. At the start of every fresh thread, ask the agent to read `prelude.md` before pasting a prompt below.

**Fresh thread (🧵 markers).**
- **🧵 Fresh thread: Yes** — New chat → agent reads **`prelude.md`** → pick listed model manually (Auto off) → paste prompt. Auto OK for acceptance/debug loops within that prompt.
- **🧵 Fresh thread: Optional** — May continue same chat if prior acceptance passed and context is clean.
- **Why:** Big steps accumulate wrong assumptions in long threads. Fresh thread + **`prelude.md`** beats one marathon session.

---

## Prompt index — status vs repo

| Prompt | Action | 🧵 Fresh thread | Notes |
|---|---|---|---|
| A1 | **RUN** | **Yes** | Doc only: bump reference v1.2 → v1.3 (Opus) |
| A2 | **RUN** | **Yes** | Create `Worked_Hours_Feature_Spec.md` if missing |
| A3 | **RUN** | **Yes** | Register worked-hours module; no stale boot-blocker claims |
| A4 | **RUN** | Optional | Prerequisites checklist; may follow A3 |
| B1 | **RUN** | **Yes** | SheetJS — first code dependency |
| B2 | **RUN** | **Yes** | IndexedDB migration + `timeEntries` (data-loss risk) |
| B3 | **RUN** | Optional | Month-key fix; may follow B2 if migration context is fresh |
| C1 | **RUN** | **Yes** | `PayrollParser` — new data contract |
| C2 | **RUN** | Optional | Identity map; pairs with C1 |
| D1 | **RUN** | **Yes** | Normalizer — rounding rules are easy to get wrong |
| D2 | **RUN** | Optional | Policy flags; may follow D1 |
| E1 | **RUN** | **Yes** | Effective roster (Opus) — swap-chain replay |
| E2 | **RUN** | **Yes** | Full reconciliation pipeline |
| E3 | **EXTEND** | **Yes** | Ledger v1.3 + clocked `Stud` — touches policy |
| F1 | **RUN** | **Yes** | Hours golden-master harness |
| Final review | **RUN** | **Yes** | End-to-end security audit (**Opus 4.8 MAX**) — after F1 green |
| Scheduling Track A | **Parallel** | **Yes** | `SchedulingEngine_Test_Strategy.md` — separate from this file |

**Canonical spec & repo state:** `Documentation/prelude.md` (read once per fresh thread — do not re-read this file for that content).

---

## Model & Budget Strategy — fit the whole feature inside $20 Pro

**How the plan meters (verified June 2026).** Pro is $20/mo and includes **$20 of usage credits that third-party models (Sonnet, Opus) draw from**. **Auto mode is unlimited and does not touch the pool.** **Composer** is Cursor's first-party model and the cheapest of the three.

**The tactic that makes it fit:** scaffold on Composer, reason on Sonnet, spend Opus only on the 2–3 subtle sessions, and run **every follow-up / debug / "run-and-fix" loop on Auto**.

| Prompt | Model | 🧵 Fresh thread | Why |
|---|---|---|---|
| A1 — ledger v1.3 / I6 (doc) | **Opus** | **Yes** | invariant ripple through reference §§8/11/13 |
| A2 — feature spec | Sonnet | **Yes** | structured synthesis from prelude §0 |
| A3 — architecture doc update | Sonnet | **Yes** | read repo; no false boot-blocker claims |
| A4 — prerequisites checklist | Composer | Optional | mechanical list |
| B1 — SheetJS | Composer | **Yes** | plumbing |
| B2 — `timeEntries` store | Sonnet | **Yes** | migration + idempotency |
| B3 — month key + re-key | Composer | Optional | well-specified |
| C1 — `PayrollParser` | Sonnet | **Yes** | data contract |
| C2 — identity map | Sonnet | Optional | matching edge cases |
| D1 — `WorkedHoursNormalizer` | Sonnet | **Yes** | rounding edge cases |
| D2 — `PolicyFlags` | Composer | Optional | rule application from prelude §0 |
| E1 — effective-roster builder | **Opus** | **Yes** | swap-chain replay |
| E2 — reconciliation | Sonnet | **Yes** | aggregation |
| E3 — extend `HoursLedger` v1.3 | Sonnet | **Yes** | extend existing module |
| F1 — hours determinism harness | Sonnet | **Yes** | regression anchor |
| Final — security review | **Opus 4.8 MAX** | **Yes** | end-to-end audit; report-only |

---

## Phase A — Documentation integration (do first, minimal code)

### Prompt A1 — Bump the Hours Tracking ledger to v1.3 (the I6 change)  ·  **Model: Opus**  ·  **🧵 Fresh thread: Yes**
> Open `Documentation/Hours_Tracking_System_Reference.md` (currently **v1.2**, matches `src/js/core/hoursLedger.js`). Using **prelude.md §0**, produce v1.2 → **v1.3**:
> - Reword **I6**: clock system owns `Stud`; scheduler-assigned total = **adherence baseline** only; assigned-vs-clocked gap = adherence signal, not sync bug.
> - Update §8, §11, §13 wherever they assume assigned `Stud`.
> - Add **Worked-hours input** subsection (weekly full dump, natural key, monthly attribution, cite prelude §0 normalization).
> - Changelog v1.3 + self-check: `Σ worked_minutes` per month = sum of session `worked_minutes`.
> - Note v1.2 remains valid for the **interim** assigned-hours implementation until E3 ships.
> **Acceptance:** reference doc v1.3; contract-period math unchanged.

### Prompt A2 — Create the Worked-Hours feature spec  ·  **Model: Sonnet**  ·  **🧵 Fresh thread: Yes**
> Create `Documentation/Worked_Hours_Feature_Spec.md` if it does not exist. Structure: Purpose; Data source; Identity map; Ingestion; Normalization (prelude §0 verbatim); Effective roster; Outputs (adherence + v1.3 `Stud`); Persistence (`timeEntries`, dbVersion); Dependencies (SheetJS); **Already implemented (v1.2 ledger, engine exam rules, swap persistence)**; Out-of-scope (engine assignment logic, backend). Open questions: **student↔module enrolment** (Decisions Log §12.5). Cite prelude §0.
> **Acceptance:** self-contained; matches prelude §0; names open questions.

### Prompt A3 — Register worked-hours module in architecture docs  ·  **Model: Sonnet**  ·  **🧵 Fresh thread: Yes** *(rewritten for current repo)*
> Open `SchedulingEngine_Architecture_Review.md` and `SchedulingEngine_Action_Plan.md`. Add **Worked-Hours / Reconciliation** to the module map (engine-independent): `PayrollParser → IdentityMap → EffectiveRoster → Reconcile → HoursLedger v1.3 feed`.
>
> **Do not** list `SchedulerUtils` or `AppStateManager` as boot blockers — both are implemented (`src/js/core/utils.js`, `src/js/core/state.js`).
>
> Document instead:
> - **Existing:** v1.2 `HoursLedger`, `AppStateManager.swapDebts`, IndexedDB schedules/swaps.
> - **Gap:** no payroll ingestion, no `timeEntries`, no adherence series, reference still v1.2.
> - **Reconciliation read boundary:** IndexedDB + export payload (`swapDebts`, schedules, approved swaps) — headless modules must not require live `AppStateManager` instance.
>
> Add action items for B1–F1. Do not implement code.
> **Acceptance:** accurate repo snapshot; no stale boot-blocker claims.

### Prompt A4 — Worked-hours prerequisites checklist  ·  **Model: Composer**  ·  **🧵 Fresh thread: Optional** *(may follow A3)*
> Update `SchedulingEngine_Action_Plan.md` (or `Locked_Decisions_Log.md` §9) with **Worked-hours prerequisites**:
> - (a) SheetJS — **NOT STARTED** → B1
> - (b) `timeEntries` store, `dbVersion` 1→2 — **NOT STARTED** → B2
> - (c) `OUTSIDE_HOURS` uses per-date op-hours — engine has config; payroll **PolicyFlags** **NOT STARTED** → D2
> - (d) Contract-period calendar in ledger module — **DONE** (`hoursLedger.js` DEFAULT_CONTRACT_PERIODS) → E3 extends for clocked Stud only
> - (e) Month keys: standardize on **calendar `YYYY-MM`**; fix `monthScheduleId` vs `HoursLedger.monthKey` mismatch + legacy `saveSchedule` ids — **PARTIAL** → B3
>
> **Acceptance:** five items with correct DONE/NOT STARTED status and prompt links.

---

## Phase B — Foundation

### Prompt B1 — Add SheetJS (xls parsing) without a build step  ·  **Model: Composer**  ·  **🧵 Fresh thread: Yes**
> PWA loads via tags. Add SheetJS: vendored or CDN `window.XLSX`; add `xlsx` devDependency for Node harness. Do not reorder existing app script tags.
> **Acceptance:** `window.XLSX` in browser; `node -e "require('xlsx')"` succeeds.

### Prompt B2 — Add the `timeEntries` store  ·  **Model: Sonnet**  ·  **🧵 Fresh thread: Yes**
> In `src/js/utils/storage.js`, bump `dbVersion` 1→2; add `timeEntries` store keyed by `username|shiftStartedISO` with indexes on `username`, `dateISO`, `monthKey` (calendar `YYYY-MM`). Methods: `upsertTimeEntries`, `getTimeEntriesForMonth`, `getTimeEntriesForStudent`, `clearTimeEntries`. Idempotent upsert.
> **Acceptance:** double upload → same count; query by month/username works.

### Prompt B3 — Standardize month-schedule key (calendar month)  ·  **Model: Composer**  ·  **🧵 Fresh thread: Optional** *(may follow B2)*
> Align all schedule ids on **calendar month**: `${year}-${String(calendarMonth).padStart(2,'0')}` where `calendarMonth = jsMonthIndex + 1`. Fix `StorageManager.monthScheduleId` (currently pads 0-indexed month incorrectly). Update legacy `saveSchedule` default id. One-time migration re-keys existing `schedules` records. Match `HoursLedger.monthKey(year, monthIndex)` semantics.
> **Acceptance:** `getMonthSchedule(2025, 8)` reads September as `2025-09`; no duplicate month records.

---

## Phase C — Parser + identity map

### Prompt C1 — `PayrollParser`  ·  **Model: Sonnet**  ·  **🧵 Fresh thread: Yes**
> New file `src/js/core/payrollParser.js` → `window.PayrollParser.parseWorkbook(arrayBuffer)`. Per **prelude.md §0**: sheet `report`, `\u00a0` header normalize, prototype-pollution-safe header map, drop IPs, duration sanity-check, anomaly flags, deterministic output. Include in `index.html` after SheetJS.
> **Acceptance:** real export parses; no IP fields; open sessions flagged.

### Prompt C2 — Identity map  ·  **Model: Sonnet**  ·  **🧵 Fresh thread: Optional** *(may follow C1)*
> New `src/js/core/identityMap.js` → `window.IdentityMap.resolve(entries, students)`. Email prefix, then name, then pending; persisted override table in settings store.
> **Acceptance:** resolves or pending with label; override persists.

---

## Phase D — Normalization + flags

### Prompt D1 — `WorkedHoursNormalizer`  ·  **Model: Sonnet**  ·  **🧵 Fresh thread: Yes**
> New `src/js/core/workedHoursNormalizer.js` per **prelude.md §0**. Pure functions; admin bypass; worked examples in comments.
> **Acceptance:** canonical examples pass.

### Prompt D2 — `PolicyFlags`  ·  **Model: Composer**  ·  **🧵 Fresh thread: Optional** *(may follow D1)*
> New `src/js/core/policyFlags.js` → `PolicyFlags.evaluate(session, ctx)`. Per-date op-hours from `state.operationalHours` pattern. **Interim assessments:** `AssessmentManager.allExamsForStudent`; infer exam vs test by whether `exam.date` falls in `EXAMINATION_MONTHS` for strict vs buffer rules. UNROSTERED/ABSENCE in E2 only.
> **Acceptance:** OUTSIDE_HOURS, OVER_5H, TEST_CONFLICT cases pass; special-hours date respected.

---

## Phase E — Reconciliation + ledger feed

### Prompt E1 — Effective-roster builder  ·  **Model: Opus**  ·  **🧵 Fresh thread: Yes**
> New `src/js/core/effectiveRoster.js` → `EffectiveRoster.forRange(start, end)`. Load via `StorageManager.getMonthSchedule`; apply approved swaps + **`swapDebts` from IndexedDB meta/export** (same shape as `AppStateManager` persists) + admin overrides; chain swaps. Read-only; no monolith; no requirement to instantiate `AppStateManager` in Node harness (pass data in).
> **Acceptance:** post-swap assignee correct; A→B→C chain resolves.

### Prompt E2 — Reconciliation  ·  **Model: Sonnet**  ·  **🧵 Fresh thread: Yes**
> New `src/js/core/reconcile.js` → `Reconcile.run({ monthKey })`. Full pipeline per **prelude.md §0**; output adherence + monthly clocked `Stud` + flagged sessions + absences.
> **Acceptance:** hand-checked totals on real fixture; swap does not false-flag absence/unrostered.

### Prompt E3 — Extend `HoursLedger` to v1.3  ·  **Model: Sonnet**  ·  **🧵 Fresh thread: Yes** *(extend, not create)*
> **Extend** existing `src/js/core/hoursLedger.js` (v1.2, assigned Stud). Bump `VERSION` to `'1.3'` when clocked feed is wired. Add:
> - `buildStudentLedgerFromClocked(...)` or parameter `studSource: 'assigned' | 'clocked'`
> - Adherence series helper (weekly scheduled − worked; UNROSTERED sessions count as 0 worked)
> - **UNROSTERED credit rule (prelude §0):** no matching scheduled block ⇒ `worked_minutes = 0` toward `Stud`; preserve **uncredited minutes** on flagged sessions (grid-rounded clock span, no block clamp). Ensure `Reconcile` output exposes `uncreditedMinutes` per UNROSTERED session if not already present.
> - **Uncredited pool:** surface monthly `Σ uncredited_minutes` (UNROSTERED only) separately from credited `Stud` in the ledger report — not folded into contract balance until admin acts.
> - **Admin accept/reject:** persist per-session (or per-month bulk) decisions; **accept** adds uncredited minutes into the register/`Stud` for that month; **reject** leaves them excluded. Default: uncredited until accepted.
> - Keep existing contract periods, I7–I10, golden anchor
>
> Update `AppStateManager.getHoursLedgerReport` to use clocked Stud when reconciliation data exists; retain assigned fallback until upload. Align with Prompt A1 reference doc.
> **Acceptance:** §8 self-check holds on clocked sample (credited minutes only); UNROSTERED session shows uncredited figure, does not inflate `Stud` until accepted; v1.2 assigned path still works when no payroll data.

---

## Phase F — Freeze with a determinism harness

### Prompt F1 — Node golden-master harness (hours pipeline)  ·  **Model: Sonnet**  ·  **🧵 Fresh thread: Yes**
> `tests/harness/hours.js` + `npm run harness:hours`. Fixtures: real DetailedPayroll `.xls` + saved schedule JSON. Pipeline: PayrollParser → IdentityMap → EffectiveRoster → Reconcile → HoursLedger (v1.3). Two runs → byte-identical snapshot. **Separate** from scheduling engine golden master (`SchedulingEngine_Test_Strategy.md`).
> **Acceptance:** consecutive runs diff clean; totals hand-verified.

---

## After Phase F

### Final — Production + security review  ·  **Model: Opus 4.8 MAX**  ·  **🧵 Fresh thread: Yes**

**Prerequisites (gate before running):** F1 harness green (two consecutive byte-identical snapshots); E3 acceptance passed (clocked `Stud`, assigned fallback, UNROSTERED uncredited pool if implemented). Also read `Documentation/Project_Directory_Map.md` for module boundaries and routing.

> **Audit-only session — do not implement fixes unless I explicitly ask in a follow-up.**
>
> Review the completed worked-hours pipeline (B1–F1) end-to-end against `prelude.md` §0 and `Locked_Decisions_Log.md`. Read actual source — do not trust docs alone.
>
> **Scope modules:** `payrollParser.js`, `identityMap.js`, `workedHoursNormalizer.js`, `policyFlags.js`, `effectiveRoster.js`, `reconcile.js`, `hoursLedger.js`, `storage.js` (`timeEntries`), `state.js` (`getHoursLedgerReport`), relevant view wiring, `tests/harness/hours.js`, smoke tests.
>
> **Security & privacy:** PII dropped on ingest (IPs); prototype-pollution guards on payroll header map; XSS surfaces in flagged-session / ledger UI; IndexedDB data exposure; export/import payload integrity; no secrets in repo.
>
> **Correctness & policy:** idempotent upsert natural key; SAST naïve wall-clock (no UTC drift); normalization + admin bypass; effective roster + swap-chain + `swapDebts`; UNROSTERED zero-credit + uncredited pool + accept/reject (§4.4); flag-for-review never auto-discard; ledger v1.3 I6 / §8 A5 self-check; I7–I10 unchanged.
>
> **Production readiness:** error handling on corrupt `.xls`; migration safety (`dbVersion` 1→2); offline/PWA cache gaps (`sw.js` vs full script list); missing backend routes vs client `api.js` assumptions.
>
> **Output format (required):**
> 1. **Executive summary** (3–5 bullets: ship / ship-with-fixes / block)
> 2. **Findings table** — ID, severity (Critical / High / Medium / Low / Info), area, file(s), finding, recommendation
> 3. **Acceptance gaps** — which B1–F1 acceptance checks fail or were never verified
> 4. **Out of scope confirmed** — scheduling engine assignment logic, `performSwap`, monolith untouched
> 5. **Suggested fix order** — numbered, for follow-up Auto/Composer threads
>
> Report findings only; fixes in follow-up threads (Auto OK for small fixes).

1. Wire adherence + clocked ledger into Analytics/dashboard (separate prompt set).
2. Optionally capture **scheduling** golden master (Track A in test strategy) — outstanding debt from SSD rebalance.
3. Assessment timetable upload (§8.5) when §12.5 enrolment is resolved.
4. Term-balance SSD (`Φ = Σ Bal²`) — gated on ledger + tests (`Locked_Decisions_Log` §8.4).

**Not prerequisites for this feature:** legacy monolith runtime; boot-blocker fixes (already done in modular PWA).
