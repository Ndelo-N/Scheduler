# Hours Tracking System Reference
### StudentShiftScheduler — Hours-Worked vs Hours-Owed Ledger

**Version:** 1.3 · **Last updated:** 2026-06-30 · **Status:** System reference
**Companion to:** the scheduling engine (scheduler-assigned hours = the **adherence baseline**) **and** the **worked-hours pipeline** (payroll ingest → effective-roster reconciliation, `Documentation/prelude.md` §0), which produces the **clocked** `Stud` figures this ledger consumes (v1.3). **As of E3 (this build) the clocked feed is wired end-to-end:** `AppStateManager` runs the reconciliation per month and, when `hoursLedger.studSource === 'clocked'`, feeds reconciled minutes into `Stud` (admin-accepted UNROSTERED pool minutes fold in per §4.4); `studSource === 'assigned'` (the default) preserves the **v1.2 baseline** behaviour. `HoursLedger.buildStudentLedger` echoes `version`/`studSource` on every report for provenance.

> Keep this header and version line. If the model changes, bump the version here so a stale copy is detectable at a glance.

**Changelog**
- **1.3** — **`Stud` source changes** from scheduler-**assigned** hours to **clocked/reconciled** worked minutes from the worked-hours pipeline (payroll ingest → effective-roster reconciliation, `prelude.md` §0). Reworded **I6**: the clock system owns `Stud`; the scheduler-assigned total is the **adherence baseline**; the assigned-vs-clocked gap is an **adherence signal**, not a sync bug. Added the **Adherence** series (scheduled − worked, weekly) as a second output (Glossary, §12). Added **§7.5 Worked-hours input** (weekly full dump, natural key `username|shiftStartedISO`, monthly attribution, prelude §0 normalization) and §8 self-check **A5** (`Σ worked_minutes` per month = Σ session `worked_minutes`). Updated Glossary, §1, §11.2, §11.6, §12, §13.1–§13.2 for the clocked source. **Contract-period arithmetic (§4, §9, I1–I5, I7–I10) is unchanged.** v1.2 (assigned `Stud`) remains the valid **interim** definition until the clocked feed ships in **Prompt E3**.
- **1.2** — Corrected carry semantics: the ±10h tolerance is keyed to **contract-period boundaries**, not calendar months. A period-boundary carry above ±10h escalates to a reduced-contract plan (I10) rather than compounding. The hard zero-balance ceiling is scoped to the **final contract period (the one containing November)** only; all earlier boundaries use the softer carry rule. Added the ledger-granularity-vs-policy-granularity note (§11). Updated I8, I9, §11.4–§11.6, §13.
- **1.1** — §11 promoted from *open questions* to *resolved policy*. Added: claimable-hours cap (I7), carry tolerance (I8), the dead-cap (I9), bounded budget-neutral contract reduction (I10). Added the balance-SSD reconciliation and rebalance cadence (§13). Added policy-constrained worked examples (§11). The original raw-formula anchor (§9) is retained unchanged.
- **1.0** — Initial model, invariants I1–I6, spreadsheet layout (Appendix A).

---

## 1. Purpose

The scheduler assigns student assistants to shifts. In **v1.3**, the per-assistant-per-month figure for **hours actually worked** (`Stud`) comes from the **worked-hours pipeline** — actual **clocked** time reconciled against the effective roster (`prelude.md` §0) — while the scheduler-assigned total becomes the **adherence baseline** (a separate series, not the contract balance). This document defines how those worked hours are reconciled against each assistant's **contracted** and **claimed** hours to produce a single, signed **running balance** — the count of hours an assistant is *owed* or *owes* at any point in the term — and now also defines the **policy** that governs how that balance is driven to zero. *(In the **v1.2 interim**, `Stud` is the scheduler-assigned total directly, until Prompt E3 wires the clocked feed; §7.5.)*

The model is described **abstractly** (§2–§8, §11) so it holds whether implemented in a spreadsheet or a code module. The current spreadsheet column layout and its exact cell formulas are kept separately in **Appendix A**.

This is also the substrate for the planned **swap marketplace**: the "contractual hour debt" tracked there *is* the balance defined here, and peer-to-peer debt transfer is an operation on these balances (§12, §13).

---

## 2. Glossary

| Term | Symbol | Definition |
|---|---|---|
| Contract period | — | A block of one or more months sharing a single contract. The academic year comprises several contract periods (e.g. Mar–May, then Jun–Jul, … through the final period containing November). Carry (I8), the dead-cap (I9), and contract-reduction plans (I10) are evaluated at **period boundaries**, while the balance arithmetic (§4) ticks monthly. |
| Contracted hours | `Contr` | Hours the assistant is obligated to work in the month — the monthly baseline. May be *reduced* for a catch-up period (I10, §11.6). Pre-contract months have no contract (§4). |
| Reduced contract | `R` | A temporarily lowered `Contr` used to let a capacity-bound under-worked student retire prior work-debt (§11.6). |
| Claimed hours | `Claimed` | Hours recorded as payable for the month, in addition to / as part of pay. Bounded by the claimable cap (I7, §11.1). May include current-month overtime and tail hours carried from the prior month (§7). |
| Claimable hours | `Claimable` | The hard ceiling on `Claimed` for a month: banked owed-pay, capped by remaining cap headroom (I7). |
| Worked hours | `Stud` | Hours the assistant actually worked — in **v1.3**, **clocked/reconciled minutes** from the worked-hours pipeline (`prelude.md` §0), expressed in hours (`Σ worked_minutes / 60`); the single source of truth for work performed (I6). *(v1.2 interim: scheduler-assigned hours, until Prompt E3.)* |
| Assigned hours | `Assigned` | The scheduler-assigned total for the month (effective-roster scheduled hours). In v1.3 this is the **adherence baseline**, **not** `Stud`; in the v1.2 interim it *is* `Stud`. |
| Adherence | — | The scheduled-vs-clocked series: `Σ scheduled_minutes − Σ worked_minutes` per assistant per ISO week (`prelude.md` §0). An attendance/punctuality signal kept **separate** from the contract balance; the assigned-vs-clocked gap is adherence, not a ledger sync error (I6). |
| Credit | `Credit = Contr + Claimed` | Total hours the assistant is paid for in the month. Capped per month at 72 (§6). For pre-contract months, `Credit = Claimed`. |
| Month delta | `Δ = Credit − Stud` | The month's standalone contribution to the balance. |
| Running balance | `Bal` | Cumulative signed hour bank at a month's end (§3, §4). |
| Pre-claim balance | `Bal_pre(N)` | `Bal(N−1) + Contr(N) − Stud(N)` — the balance after this month's work but before this month's claim. Drives `Claimable` (§11.1). |
| Carry tolerance | — | The ±10h allowance for a small work-debt to roll from one contract period into the next (I8). A boundary carry above ±10h escalates to a reduced contract (I10), so it never compounds. |
| Catch-up assignment | — | Above-contract hours assigned in a later period to retire prior work-debt (§11.4, §11.6). |
| Dead cap | — | The single inviolable deadline: all contracted hours worked in full by the close of the **final contract period** (the one containing November) — the only hard zero-balance ceiling (I9, §11.5). |
| Tail / spillover | — | Hours worked at the tail end of one month but claimed in the next, for record-keeping (§7). |

---

## 3. Sign convention — read before touching any figure

The balance is a **single signed number**: the assistant's hour bank.

- **Negative balance → the assistant is OWED hours.** They worked more than they were credited; the surplus is bankable and still claimable (within the claimable cap, §11.1) — typically because the monthly cap (§6) throttled what could be claimed this month. **Negative is recoverable after the contracted period, via pay.**
- **Positive balance → the assistant OWES hours.** They were credited for more than they worked — a work debt to be made up. **Positive is *not* recoverable after the contracted period — there is no time left to work the hours — which is why under-work is the priority failure to prevent (§11.2, §11.3).**
- **Zero → settled.**

This asymmetry — over-work settles via pay after the term; under-work cannot settle once the term ends — is the principle behind every policy decision in §11.

Quick check of the direction: an assistant works 99h against a 50h contract and claims 22h → `Credit = 72`, `Stud = 99`, so `Δ = 72 − 99 = −27` → **owed 27 hours**.

---

## 4. The balance formula

The balance is **cumulative** — every month carries the previous month's balance forward:

```
Bal(month) = Bal(previous month) + Contr + Claimed − Stud
```

Pre-contract months (which carry only Claim/Worked, no contract):

```
Bal(month) = Bal(previous month) + Claimed − Stud
```

Equivalently, the balance at any month equals **total credit minus total worked, summed from the first month up to that month**:

```
Bal(month) = Σ(Contr + Claimed) − Σ(Stud)        [first month … this month]
```

This identity is the basis of the self-check in §8. Where a reduced contract `R` applies (§11.6), substitute `R` for `Contr` in that month.

---

## 5. Invariants

These must hold at all times. Most failures this project has hit are violations of one of these. I1–I6 are the ledger mechanics; I7–I10 are the policy rules (introduced v1.1; carry semantics refined to contract-period granularity in v1.2).

**I1 — The balance is cumulative.** Every month's balance already contains every prior month.

> **I2 — The term balance is the LATEST populated month's balance — NEVER the sum of the monthly balance cells.**
> Summing the monthly balances counts the same hours once per subsequent month: a silent, compounding over-count. Read overall balance from the most recent month alone. **The single most common and most damaging error in this system.**

**I3 — Every month's balance formula must include that month's `Claimed` term.** Omitting it understates the balance by exactly the claimed amount. Invisible whenever `Claimed = 0`. Treat a missing `Claimed` reference as a defect even if every current row reads correctly today.

**I4 — Tail hours are excluded from the originating month's `Stud`.** A tail is hours worked in month *N* but claimed in *N+1*; they must appear in *N+1*'s `Claimed` (or a dedicated tail column) and must **not** be inside month *N*'s `Stud` (§7).

**I5 — Credit is capped per month: `Contr + Claimed ≤ 72`.** No single month pays for more than 72 hours (§6).

**I6 — Worked hours are owned by the clock system (v1.3).** `Stud` is **clocked/reconciled worked minutes** from the worked-hours pipeline (payroll ingest → effective-roster reconciliation, `prelude.md` §0) — **not** the scheduler. The ledger never originates `Stud`; it consumes it. The **scheduler-assigned total is the adherence baseline**, a separate series; the difference between assigned and clocked is an **adherence signal** (attendance/punctuality), **not a sync bug** to be reconciled away. Equating assigned with worked — the v1.2 assumption — would silently mask real under-attendance. *(v1.2: `Stud` = scheduler-assigned hours, and an assigned-vs-`Stud` mismatch is a sync bug; that interim definition stays valid until the clocked feed ships in Prompt E3, §7.5.)*

> **I7 — Claims never outrun banked owed-pay.** For any month *N*: `Claimed(N) ≤ Claimable(N) = min( max(0, −Bal_pre(N)), 72 − Contr(N) )`. A claim can at most lift an owed balance up to zero, and is **0 whenever the student still owes work**. This structurally prevents the cumulative-claims overshoot (§11.1). Claims act only on the **negative** (owed-pay) side; they are orthogonal to the under-work mechanisms (I8, I10).

**I8 — Contract-period carry tolerance.** At the boundary between two consecutive contract periods, a positive (owes-work) balance of up to **+10h** may carry into the next period, where it is retired by catch-up assignment (§11.4). If the boundary balance **exceeds +10h** (mitigating circumstances), a reduced-contract plan (I10, §11.6) is triggered for the next period instead — so the carry **never compounds indefinitely**. This rule governs every period boundary **except** the exit from the final (November-containing) period, which is hard-capped by I9. It deliberately relaxes zero-balance enforcement through the year to reduce pressure.

**I9 — Final-period dead-cap (the only hard ceiling).** The hard zero-balance requirement applies **only** to the final contract period of the academic year — the one that includes November. By the close of that period, `Bal ≤ 0` for **every** student — all contracted hours worked in full, "come hell or high water" — and **no positive balance may exit it**. Any residual `Bal < 0` (owed pay) is acceptable at year-end and settles via claims/payout. Intermediate period boundaries are governed by the softer carry rule (I8), not by this ceiling.

**I10 — Contract reduction is bounded and budget-neutral.** A reduced contract `R` may be applied to an under-worked student so that full-capacity work retires prior debt, **provided the total reduction over the catch-up period does not exceed the outstanding work-debt** (`Σ(Contr − R) ≤ B₀`). Reduction lowers the *contractual/budget baseline only* — never the operational assignment (§11.6).

---

## 6. The 72-hour monthly cap

`Contr + Claimed ≤ 72` for any single month. This cap is *why owed-hours accumulate*: an assistant who works far beyond contract cannot claim it all at once, so the surplus banks as a negative balance and is drawn down in later months (as additional `Claimed`, within each month's remaining cap headroom — the outer term of I7). A correct ledger lets this backlog grow and shrink across months; it must not silently discard hours worked above the cap.

---

## 7. Tail / spillover hours

Some hours are worked at the very end of a month after that month's claim is finalised, and are claimed in the *following* month. Two requirements, both instances of I4:

1. The tail is **excluded** from the originating month's `Stud`.
2. The tail is **recognised exactly once** later — folded into that month's `Claimed`, or held in a dedicated tail column the formula nets out.

**Current handling:** tails are folded into the following month's `Claimed`, and the legacy dedicated tail columns are retained but **zeroed** (removing them would shift every downstream column reference — Appendix A).

---

## 7.5 Worked-hours input (v1.3 — clocked source)

**New in v1.3.** `Stud` is no longer the scheduler-assigned total; it is **clocked time reconciled against the effective roster**. This subsection defines the input feed. The contract-period arithmetic (§4) and every invariant total are **unchanged** — only the *source* of `Stud` changes.

**Source & cadence.** Weekly **VeraLab "DetailedPayroll" `.xls`** export, ingested as a **full dump every week**. Ingestion is **idempotent**: rows upsert on the **natural key `username|shiftStartedISO`**, so re-uploading overlapping weeks updates rows, never duplicates them (`prelude.md` §0).

**Monthly attribution.** Each session is attributed to the calendar month of its **`Shift Started` date** in **SAST (UTC+2)**; clock timestamps are naïve local wall-clock and are never UTC-converted on ingest. No shift crosses midnight (operational window ends ≤ 22:00), so every session belongs to exactly one month.

**Normalization → `worked_minutes`.** Per `prelude.md` §0, each **non-admin** session is matched to its scheduled block `[S, E]` on the **:30 grid** and snapped:

```
recorded_start = max(round_in(clock_in),  S)     # no early credit
recorded_end   = min(round_out(clock_out), E)     # no overtime credit
worked_minutes = max(0, recorded_end − recorded_start)
```

**Admin-edited** rows (`Edited By` non-empty) are accepted **verbatim** — no rounding, no caps, overtime allowed. Open / zero / negative-duration sessions are flagged and excluded from totals (never silently discarded).

**Feed into the ledger.** The monthly clocked total is what §4 consumes as `Stud`:

```
Stud(assistant, month) = Σ worked_minutes (reconciled sessions in that month) / 60      # hours
```

The **scheduler-assigned** total is retained as the **adherence baseline** and produces the separate adherence series (`Σ scheduled − Σ worked` per ISO week); it does **not** feed the contract balance (I6).

**Interim (v1.2).** Until Prompt **E3** wires this clocked feed, `Stud` continues to be sourced from the scheduler-assigned total exactly as v1.2 specifies; this subsection then supersedes that source.

---

## 8. Validation / self-check

A ledger is internally consistent for an assistant when:

```
latest-month balance  ==  Σ(Contr + Claimed) − Σ(Stud)      over all populated months
```

computed **independently** of the running-balance chain. A mechanical, value-exact check suited to a regression harness. Mismatch localises to a specific month's formula: most often a missing `Claimed` term (I3) or a double-counted tail (I4).

**v1.1/1.2 policy assertions** (run alongside the consistency check, against real exported data):
- **A1 (I7):** for every month, `Claimed ≤ Claimable`. Flag any month where a recorded claim exceeds the cap.
- **A2 (I8):** at every intermediate contract-period boundary, the carried positive balance is ≤ +10h, *or* a reduced-contract plan (I10) is active for the next period.
- **A3 (I9):** at the close of the final (November) period, every student's balance is `≤ 0`.
- **A4 (I10):** for any active reduced contract, cumulative reduction `≤` the work-debt outstanding when the reduction began.
- **A5 (I6, v1.3 clocked source):** for every assistant-month, the ledger's `Stud(month)` equals the sum of that month's **reconciled session `worked_minutes`**, converted to hours (`Σ worked_minutes / 60`). No session is double-counted (enforced by the natural key `username|shiftStartedISO`) and no rounding drift creeps in between the per-session figures and the monthly total. *(Active once the clocked feed ships, Prompt E3; in the v1.2 interim `Stud` is the assigned total and this check is vacuous.)*

Per assistant: (1) recompute the cumulative chain from raw `(Contr|R, Claimed, Stud)` inputs; (2) recompute `Σcredit − Σworked`; (3) assert both equal the reported balance; (4) assert A1–A5. Run against **real exported data**, not a reimplementation of the inputs.

---

## 9. Worked reference case (raw-formula regression anchor)

One assistant, five populated months (anonymised real data). This anchor tests the **cumulative formula and I1–I4 only** — it predates the v1.1 claim policy and deliberately uses free-form claims, so its Apr/May claims exceed the I7 cap. **Policy-constrained behaviour is shown separately in §11.1, §11.4 and §11.6.** Keep this table as-is for formula regression.

| Month | Contr | Claimed | Stud | Δ (Credit − Stud) | Running balance |
|---|---|---|---|---|---|
| Feb (pre-contract) | — | 51 | 51 | 0 | 0 |
| Mar | 50 | 22 | 99 | −27 | −27 |
| Apr | 33 | 30.5 | 31 | +32.5 | +5.5 |
| May | 50 | 11 | 57 | +4 | +9.5 |
| Jun (in progress) | 57 | 0 | 26 | +31 | **+40.5** |

- **Term balance = +40.5** → the assistant *owes* 40.5 hours.
- Cross-check: `Σcredit (51+72+63.5+61+57 = 304.5) − Σworked (51+99+31+57+26 = 264) = 40.5`. ✔
- **Reading caveat:** June is mid-month; full contract (57) is credited before those hours are worked (26 so far), inflating the "owes" side until the month closes (§10).

Any implementation that does not reproduce this table exactly has a defect.

---

## 10. Known pitfalls

- **Double-counting the balance (violates I2).** Summing the monthly balance cells instead of reading the latest. Symptom: balances drift upward and exceed any single month's figure.
- **Dropped `Claimed` term (violates I3).** Correct for everyone who claimed 0; wrong *only* for claimants — easy to ship undetected.
- **Tail double-count (violates I4).**
- **Claim outrunning the bank (now prevented by I7).** Before v1.1, cumulative claims could overshoot cumulative over-work and flip the balance positive. The claimable cap (§11.1) eliminates this; a recorded claim above `Claimable` is now a defect (A1).
- **Compounding carry (now prevented by I8).** A work-debt allowed to roll period after period without bound. The ±10h tolerance + the reduced-contract escalation (§11.4, §11.6) caps it; anything above +10h at a boundary triggers a plan to clear it next period.
- **Capacity-bound under-worked student "stuck" (now resolved by I10).** A student whose contract equals their availability can never retire a work-debt by working to contract (Δ=0). Contract reduction (§11.6) is the resolution.
- **In-progress-month inflation.** Full contract is credited up front, so a partially-worked current month carries a positive (owes) bias that resolves as hours accrue. The balance is a *live snapshot*, not a closed-month figure.

---

## 11. Resolved policy (was: open policy questions)

The three gaps surfaced in v1.0 are now decided. The governing principle is the §3 asymmetry: **over-work settles via pay after the term; under-work cannot settle once the term ends.** Therefore the system spends its scheduling effort feeding under-worked students during the term, and settles over-worked students with claims rather than more shifts.

> **Two granularities.** The **balance arithmetic** (§4) is evaluated **monthly** — each month contributes `Contr + Claimed − Stud`. The **policy** in this section is evaluated at the coarser **contract-period** granularity: carry (I8), the dead-cap (I9), and contract-reduction plans (I10) act at *period boundaries*, where a contract period is a block of months sharing one contract (e.g. Mar–May, then Jun–Jul, … through the final period containing November). The monthly ledger ticks underneath; the policy checkpoints sit at period ends.

### 11.1 Claimable-hours feature (claims never outrun overwork)

A claim must never let pay outrun work performed. The hard ceiling per month *N* (I7):

```
Bal_pre(N) = Bal(N−1) + Contr(N) − Stud(N)            # balance after this month's work, before its claim
Claimable(N) = min( max(0, −Bal_pre(N)),  72 − Contr(N) )
Constraint:  Claimed(N) ≤ Claimable(N)
```

The inner term `max(0, −Bal_pre(N))` is the **banked owed-pay** (how far negative the student is after counting this month's work); the outer term `72 − Contr(N)` is the §6 cap headroom. A claim can therefore at most lift an owed balance to zero, and is **0 whenever the student already owes work**.

**Implementation:** the operator UI exposes `Claimable(N)` as a live, read-only figure next to the claim entry, and rejects any entry above it. The ledger module returns `Claimable` per month so the swap/claims UIs share one source of truth.

**Worked example — the §9 anchor re-run under the claimable cap.** Each month, `Claimed` is clamped to `Claimable`:

| Month | `Bal_pre` | `Claimable` | Claimed (raw → capped) | Bal (raw → capped) |
|---|---|---|---|---|
| Mar | −49 | 22 | 22 → 22 | −27 → **−27** |
| Apr | −25 | 25 | 30.5 → **25** | +5.5 → **0** |
| May | −7 | 7 | 11 → **7** | +9.5 → **0** |
| Jun | +31 | 0 | 0 → 0 | +40.5 → **+31** |

The capped chain is `0, −27, 0, 0, +31`. The cap erased the Apr/May overshoot (a *claims* artefact); the residual **+31 in June is genuine under-work** (26 worked of a 57 contract) and is handled by §11.2–§11.6, not by claims. The two never overlap.

### 11.2 Flagging under-work, with an escalation ladder

Flag any student whose cumulative balance is positive (owes work) against the contracted window, with the goal of zero by term end. Mechanisms form a **preference ladder, cheapest and most budget-neutral first**:

1. **Allocation priority** — *free, budget-neutral, automatic.* Extend the engine's `contractDeficit` score weight from a *monthly* deficit to a *cumulative term-balance* deficit, so under-worked students get a scoring boost when generating future periods. They preferentially fill slots that needed filling anyway, against their availability. Primary tool: costs no extra hours, doesn't disturb published shifts. *(v1.3: this boosts **assignment**; because `Stud` is now clocked (I6), the balance improves only as the student **actually clocks** the added shifts — chronic non-attendance surfaces in the adherence series (§7.5), not as a contract credit.)*
2. **Transfer** — *budget-neutral, automatic.* Rebalance moves a droppable shift from an over-worked to an under-worked student (inequality-gated, §13).
3. **Swap** — *budget-neutral, suggested.* When a transfer needs the over-worked student to actively give up a shift, the rebalance *proposes* a pre-matched overworked→underworked swap into the marketplace (`swaps.js`). Human-in-loop (involves both people). This is the **budget-management function**.
4. **Extra-assistant / over-staffing** — *budget-expanding, suggested, last resort.* Only when 1–3 cannot supply the hours: assign the under-worked student as an additional body on an already-full slot (bump that slot's `maxCapacity`). Spends labour budget, so operator-approved and bounded by a budget cap.

### 11.3 Term-end: zero balance above all (lexicographic objective)

In the final-period settlement window the rebalance pursues a **lexicographic** objective, higher levels strictly dominating lower:

- **L0 (inviolable) — coverage.** Every required slot keeps ≥ required assignees. An over-worked student *keeps* a slot if no under-worked available student can take it. Coverage always wins.
- **L1 — drive under-work to zero.** Feed under-worked students every available hour they can legally take (within availability and their own contract + headroom). This is the irreversible failure to avoid (§3).
- **L2 — stop growing over-work.** De-prioritise over-worked students in allocation; transfer their droppable shifts to under-worked students; flag their residual owed balance for **claims settlement** rather than more shifts.
- **L3 — minimise residual dispersion** for anyone still non-zero.

### 11.4 Contract-period carry tolerance & catch-up (I8)

Zero-balance is **not** enforced at every intermediate period boundary. Instead, at the boundary from one contract period to the next:

- A positive (owes-work) balance of up to **+10h** may carry into the next period.
- That next period retires it by **catch-up assignment** — distributing up to +10h of above-contract work across the period's months.
- If the boundary balance **exceeds +10h**, the carry is *not* simply rolled; a **reduced-contract plan** (§11.6) is triggered for the next period, sized to clear the excess. This is the escalation that stops the carry compounding.

**Worked example (a period boundary).** A student finishes the Mar–May period **+8h** in deficit (≤ +10h). The Jun–Jul period absorbs it: assigning +8h of above-contract work across June–July drives the balance to 0 — contract unchanged, no formal plan needed. Had the deficit been, say, **+30h** (> +10h), §11.6's reduced contract would be applied to Jun–Jul instead.

**Why ±10h is a soft threshold, not a hard ceiling.** Below +10h, the next period self-corrects with modest above-contract work. Above +10h, a formal reduced-contract plan takes over. Either way the debt is on a bounded path to zero, so it never compounds across periods. The **only** point at which a positive balance is hard-forbidden is the exit from the final (November) period (I9, §11.5).

### 11.5 The final-period dead-cap (I9)

The single inviolable deadline applies to the **final contract period — the one that includes November**: by its close, every student has worked all contracted hours in full (`Bal ≤ 0`), and no positive balance may exit it. The looser carry rule (§11.4) at every *earlier* period boundary exists precisely because this one hard wall, at year-end, carries the enforcement weight. Residual **negative** balances (owed pay) are acceptable here and settle via claims/payout; residual **positive** balances are a violation. Where a contract reduction is in force (§11.6), the dead-cap applies to the **adjusted** contract. In this final period the rebalance runs the lexicographic settlement objective (§11.3).

### 11.6 Contract reduction for under-worked students (I10)

**When it triggers.** Either (a) a period-boundary carry exceeds the +10h tolerance (§11.4, the mitigating-circumstances case), or (b) the student is capacity-bound — monthly availability `C` at or near contract `F`, so working to contract gives `Δ = F − C ≈ 0` and a positive balance never shrinks, with no capacity above `C` for catch-up over-work. In either case a reduced-contract plan is proposed for the **next contract period**.

**Mechanism.** For a catch-up period of `k` months, lower the *contractual baseline* to a reduced contract `R` while still **assigning the full operational capacity `C`**. The surplus of work over the reduced contract (`C − R` per month) draws the debt down. *(v1.3: the formula below sets `Stud = C`, i.e. it assumes the student **clocks** the full assigned capacity each month. Since `Stud` is now clocked (I6), the draw-down is realized only as actually-clocked hours; persistent under-attendance leaves a residual positive balance — a genuine under-work signal that the v1.2 assigned-equals-worked assumption used to hide.)*

**Formula.** Let `B₀ > 0` be the work-debt at the start of the period. Requiring the balance to reach zero by period end, with `Stud = C` each month:

```
B₀ + k·(R − C) = 0   ⟹   R = C − B₀ / k
```

- Feasibility: `R ≥ 0` requires `k ≥ B₀ / C`.
- Bound (I10): total reduction `k·(F − R) = B₀` when `F = C`; in general require `k·(F − R) ≤ B₀` so you never reduce by more than the debt (over-reducing under-credits the student and flips them to owed-pay, needing a claim).

**Worked example (your case — the Mar–May → Jun–Jul boundary).** A student exits the Mar–May period `B₀ = +30` in deficit (well above the +10h tolerance, so §11.4 escalates here). Capacity `C = 60`, normal Jun–Jul contract `F = 60`, period `k = 2` (June, July):

```
R = 60 − 30/2 = 45 h/month
```

| Month | Contract used | Clocked (`Stud`) | Δ = R − Stud | Balance |
|---|---|---|---|---|
| — (May close) | — | — | — | +30 |
| Jun | **R = 45** | 60 (full capacity, attended) | −15 | +15 |
| Jul | **R = 45** | 60 (full capacity, attended) | −15 | **0** |

```
┌─────────────────────────────────────────────────┐
│  Reduced contract  R = 45 h/month (Jun–Jul)      │
│  retires the +30h debt at full 60h utilisation   │
└─────────────────────────────────────────────────┘
```

**Why this resolves operational-requirements vs budget-allocation.**

- **Operational:** assignment stays at full capacity (60h) — coverage and the student's development are unaffected. Reduction touches only the contractual baseline, never the assignment the student clocks against (and never `Stud`, which in v1.3 is the clocked total, I6). The table assumes full attendance (`Stud = 60`); any shortfall would simply leave a smaller draw-down that month.
- **Budget:** the 15h/month surplus is **not new spend** — it draws down over-credit already banked (the student was paid 30h in spring for hours not worked). Verified annually: paid `150 + 90 = 240h`, worked `120 + 120 = 240h` → balance 0. **No new budget; the books close.**
- **Feasibility:** it makes `Bal ≤ 0` reachable within capacity, which a student at `F = C` could never achieve.

**Suggestion, not silent action.** The rebalance/ledger *proposes* a reduction (`student X owes 30h, capacity 60h = contract → suggest R = 45h over Jun–Jul`); an operator approves it, because it changes a contractual/pay figure. The bound in I10 is enforced automatically.

---

## 12. Integration with the scheduler

- **Input (v1.3):** per-assistant monthly `Stud` = **clocked/reconciled worked minutes** from the worked-hours pipeline (payroll ingest → effective-roster reconciliation → `Σ worked_minutes / 60`; §7.5, `prelude.md` §0), partitioned by month (I6). The scheduler's assigned-hours total (`hoursAssigned`/`ContractManager.computeAssignedHours`) is **no longer** `Stud` — it feeds the **adherence baseline** only. `Contr` is sourced from `contracted_monthly_hours` (or its reduced value `R`, §11.6). `Claimed` is operator-entered, bounded by `Claimable` (I7). *(v1.2 interim: `Stud` = the assigned total directly, until Prompt E3.)*
- **Output:** per-assistant signed balance (owed / owes), the monthly deltas, the live `Claimable` figure, any active reduced-contract suggestion, and — new in v1.3 — the **adherence series** (`Σ scheduled − Σ worked` per ISO week), reported **separately** from the contract balance.
- **Forward link — swap marketplace:** hour-debt and debt-transfer operate on these balances. Transferring shift coverage moves balance between assistants; I5, I7 and the §11 policies bound which transfers are legal (§13).
- **Suggested module boundary:** an `HoursLedger` module taking `(assistant, [{month, contr|R, claimed, stud}])` and returning `{balance, deltas, claimable, violations, suggestions}`, with §9 + §11 examples as its golden-master tests and §8 (A1–A5) as its consistency assertions. In v1.3 the `stud` input is supplied by the reconciliation pipeline (Prompt E3 exposes a `studSource: 'clocked' | 'assigned'` switch, with `'assigned'` retained as the interim/fallback when no payroll data exists). The module should know the period calendar (which months belong to which contract period, and which period is final) so it can evaluate I8–I10 at boundaries.

---

## 13. Balance reconciliation in the rebalance function

The rebalance (your provably-convergent "Fix C") is the engine of §11. v1.1/1.2 change **what it optimises**, **how often it runs**, and **what it may do vs. only suggest**.

### 13.1 Objective: from monthly-hours spread to term-balance spread

Today the rebalance minimises the spread of a *single month's* worked hours. For the ledger it minimises the spread of **cumulative term balances**. Keep the Fix C structure exactly — only the target changes. Potential:

```
Φ = Σ_i  Bal_i²
```

Transferring a shift of length `h` from student `a` to student `b` changes only their terms:

```
ΔΦ = (Bal_a + h)² + (Bal_b − h)² − Bal_a² − Bal_b²
   = 2h·(Bal_a − Bal_b + h)

Accept the transfer  ⟺  ΔΦ < 0  ⟺  Bal_b − Bal_a > h
```

i.e. move work **to** the student who owes more, when they owe more than the donor by more than the shift length. This is the Fix C inequality with **balances** substituted for monthly hours (the direction follows the §3 sign convention: positive = owes work).

**Convergence (unchanged proof).** `Φ ≥ 0` and each accepted transfer strictly decreases it by a discrete amount; a strictly decreasing, bounded-below quantity on a discrete lattice **terminates** — at a constraint-limited optimum where no transfer satisfies `Bal_b − Bal_a > h`.

**v1.3 note.** Balances now use **clocked** `Stud` (I6), so a transfer changes a student's *assignment* and therefore their **expected** future clocked hours; the realized balance moves only as the new assignee actually clocks the shift. Past months are fixed by their reconciled clocked totals — the rebalance optimises **future-period assignment**, not historical `Stud`. Divergence between the assigned plan and what is clocked is the adherence signal (§7.5), not a balance error.

**Intermediate periods vs. the final period.** Across intermediate contract-period boundaries, `Φ = Σ Bal²` is used symmetrically (pull everyone toward zero, within the ±10h carry tolerance of I8, escalating to reduced contracts beyond it). In the **final (November) period**, the objective becomes **asymmetric/lexicographic** (§11.3): first pursue transfers that reduce *positive* balances (move work onto under-worked receivers, `Bal_b > 0`), and do **not** push an over-worked student further negative unless L0 coverage demands it — because negatives settle via claims and positives cannot.

### 13.2 Cadence

| Trigger | Scope | Cost | Automatic? | Behaviour |
|---|---|---|---|---|
| **Per monthly generation** | Full term-aware rebalance | ~16s | Yes | Correct balances using prior months as the target. The main correction point. |
| **On ledger-input change** — v1.3: **payroll upload / reconciliation** (updates clocked `Stud`), **claim entered**, or **effective-roster change** (shift edit, swap approved → updates the *adherence baseline*, not `Stud`) | **Lightweight — not a full rebalance** | O(1) | Yes | Recompute balances + each student's `Claimable` from clocked `Stud`; recompute the adherence delta from the assigned baseline; mark schedule "rebalance recommended" if drift crosses a threshold. **Do not auto-shuffle published shifts on every edit** (it churns schedules and fights the engine's consistency/pattern-lock objectives). |
| **At a contract-period boundary** | Evaluate carry (I8) | O(1) | Yes | If a student's carry > +10h, raise a reduced-contract suggestion (§11.6) for the next period. |
| **On-demand** | Full | ~16s | Manual | After bulk edits or new availability. |
| **Final-period settlement mode** (the contract period including November) | Full, L0–L3 (§11.3) | ~16s | Manual, **escalating** | Suggested frequency ramps up (e.g. weekly through the final period, then before final publication). |

**Core nuance.** In *intermediate periods*, prefer correcting balance through the **scoring of future periods** (cheap, non-disruptive — ladder rung 1) over re-shuffling already-published shifts. In the *final period*, re-shuffle aggressively, because there is no later period to absorb the correction and the dead-cap (I9) now outranks schedule stability.

### 13.3 What the rebalance MAKES vs. SUGGESTS

**Makes** (automatic, deterministic, within hard constraints):
- Balance-improving shift transfers that preserve L0 coverage (the inequality above).
- Balance-aware re-ranking of candidates in future-period generation (the cumulative `contractDeficit` boost).

**Suggests** (human-in-loop):
- Overworked→underworked **swaps**, pre-matched, posted to the marketplace (§11.2 rung 3).
- **Extra-assistant / over-staffing** assignments (budget approval, §11.2 rung 4).
- **Claims** for over-worked students (`X is owed 18h — claim up to cap headroom to settle`, bounded by I7).
- **Contract-reduction** plans when a period-boundary carry exceeds +10h or a student is capacity-bound (`R = C − B₀/k`, bounded by I10, §11.6).
- Final-period **shift-shed** recommendations for over-worked students.
- **Structural-mismatch alert.** If balances *cannot* reach the I9 target after optimal rebalancing, report the gap and cause — e.g. *"term demand exceeds contracted capacity by ~40h; either N students end over-worked and settle via claims, or add an assistant."* The rebalance must **admit when zero balance is mathematically unreachable** rather than thrashing toward it (no silent assumptions).

---

## Appendix A — Current spreadsheet implementation

The live tracking sheet realises the §4 model. Column letters are fixed by the original formulas; **verify them against the actual sheet before editing — a single inserted/removed column shifts every reference.** The v1.1/1.2 policy fields (`Claimable` cap, reduced contract `R`) are best implemented in the PWA `HoursLedger` module (§12) rather than retrofitted into the sheet; formulas below are documented for completeness.

### A.1 Column layout

| Month | Block columns | Balance cell |
|---|---|---|
| Jan | `C` Claim, `D` Stud, **`E` +/-** | `E` |
| Feb | `F` Claim, `G` Stud, **`H` +/-** | `H` |
| Mar | `I` Contr, `J` Claimed, `K` tail (=0), `L` Stud, **`M` +/-** | `M` |
| Apr | `N` Contr, `O` Claimed, `P` tail (=0), `Q` Stud, **`R` +/-** | `R` |
| May | `S` Contr, `T` Claimed, `U` Stud, **`V` +/-** | `V` |
| Jun | `W` Contr, `X` Stud, **`Y` +/-** | `Y` |

Term-balance columns referenced by the bottom section: `M, R, V, Y, AB, AE, AH, AK, AN` (one per contract month, Mar→Nov).

### A.2 Correct formulas (row 3 = first assistant; fill down)

```text
E3   =C3-D3                 Jan   balance (opening month; carries nothing)
H3   =E3+F3-G3              Feb   balance (carries Jan + Claim − Stud)
M3   =H3+I3+J3-K3-L3        Mar   balance (K3 = 0; tail folded into Claimed)
R3   =M3+N3+O3-P3-Q3        Apr   balance (P3 = 0)
V3   =R3+S3+T3-U3           May   balance  ← must include +T3 (Claimed)  [I3]
Y3   =V3+W3-X3              Jun   balance (no Claimed column this month)

Term balance cell:  =Y3      ← latest populated month only, NOT a sum  [I2]
```

### A.3 v1.1/1.2 policy fields (if implemented in-sheet)

```text
Claimable(month) :  =MIN( MAX(0, -(prev_bal + Contr - Stud)), 72 - Contr )
Claim guard      :  data-validation on the Claimed cell, ≤ its Claimable cell        [I7]
Reduced contract :  use R in place of Contr in that month's balance formula           [I10]
                    (e.g. a separate "R" column the balance formula reads instead of Contr)
Period boundary  :  carry = balance at the period's last month; if > 10 → flag plan   [I8]
```

### A.4 Maintenance notes

- **Adding a new month:** wire its balance cell to carry the previous month (`= prev_balance + Contr + Claimed − Stud`), then repoint the term-balance cell to the new month. To avoid repointing every month, wire *all* future month balances to carry forward; empty months add nothing, so the final column (`AN3`) permanently holds the running total and the term balance can stay `=AN3`.
- **June has no `Claimed` column.** If June claims are possible, a column must be inserted — which shifts `Y3` and everything after it. Inserting `Claimable`/`R` columns shifts references likewise; prefer the module.
- **Period boundaries** are evaluated at each period's last month (the carry/dead-cap checkpoints, I8–I9); the sheet has no notion of periods, so this check belongs in the module.
- Re-run the §8 self-check (consistency + A1–A5) after any structural edit.

---

*End of reference.*
