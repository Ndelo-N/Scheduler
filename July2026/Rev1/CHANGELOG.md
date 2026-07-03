# Worked-Hours Pipeline — Fix Implementation Changelog

**Scope:** all 17 audit findings (F-01 … F-17) from the B1–F1 worked-hours audit.
**Staging:** fixes applied to writable copies, each checkpoint re-run against the
test suites. The project files I was given are **read-only**, so these patched
files are for you to drop into your real `Student Scheduler PWA/` repo.

**Final suite state (all green):**

| Suite | Before | After |
|---|---|---|
| C1 `payrollParser_smoke` | 25/25 | **25/25** |
| C2 `identityMap_smoke` | 32/32 | **32/32** |
| E1 `effectiveRoster_smoke` | 16/16 | **16/16** |
| E2 `reconcile_smoke` | 23/23 | **23/23** |
| F1 `hours` harness | 25/25 | **33/33** (deliberately re-baselined — see F-01/F-02) |
| Storage (fake-indexeddb) | — | **pass** (F-04 keypath, F-06 round-trip + guards) |

Two byte-identical F1 runs; SHA-256 stable; matches the re-captured `baseline.json`.

---

## Two decisions you should sign off on

1. **Admin-edited UNROSTERED → zero credit + pool (F-09).** An admin clock-time
   edit does **not** conjure a scheduled block, so an admin-edited session with no
   matching roster block now earns **zero `Stud` credit** and is routed to the
   uncredited pool (it can be accepted later). Previously it was credited verbatim.
   *Reversible* — see APPLY.md §“Reversing the admin-unrostered decision”.

2. **The uncredited pool value is GRID-ROUNDED, even for admin rows.** A
   `14:00→16:00` admin-unrostered session contributes **90** pool minutes
   (`round_in 14:30 … round_out 16:00`), **not** verbatim 120. This follows §0’s
   pool formula literally (`round_out(out) − round_in(in)`, no admin carve-out).
   The empirical run corrected my first assumption here. *Reversible* if you want
   verbatim-for-admin — see APPLY.md.

3. **F1 baseline was re-captured on purpose.** F-01/F-02/F-15 add new output
   fields (`uncreditedPool`, per-session `uncreditedMinutes`, sorted
   `adherenceByStudent`, ledger `version`/`studSource`), which change the golden
   JSON. The hand-verified totals were extended **first** (and pass), *then*
   `baseline.json` was regenerated. **Commit the new `baseline.json`** with these.

---

## Findings — what changed

### F-01 [High] — UNROSTERED uncredited pool (`reconcile.js`)
Added an `uncreditedMinutes` accumulator. For every UNROSTERED **complete**
session, `sessionUncredited = max(0, round_out(clockOut) − round_in(clockIn))`
(no block clamp). Surfaced three ways: `uncreditedMinutes` on each flagged
session; a sorted `uncreditedPool.{byStudent,totalMinutes}` block; and
`counts.uncreditedMinutes`. **Stud credit excludes these minutes.**
*Verified:* F1 asserts Alice’s 10:00→11:00 unrostered session = **30** pool min,
total 30, and Alice’s `Stud` still 180.

### F-02 [High] — Ledger v1.3 wired (`hoursLedger.js`, `state.js`, reference doc)
- `HoursLedger.VERSION` `1.2 → 1.3`; every report now echoes `version` +
  `studSource` for provenance. `verifyGoldenAnchor()` still passes.
- `state.js`: `getClockedHoursByMonth(year)` runs reconciliation per month;
  `buildHoursLedgerMonthData` feeds **clocked** `Stud` when
  `hoursLedger.studSource === 'clocked'`, folding **accepted** uncredited minutes
  into `Stud` (§4.4); default `'assigned'` preserves v1.2 behaviour.
  `getHoursLedgerReport` attaches a per-month `uncreditedPool` summary.
- Accept/reject + switch: `acceptUncredited`, `rejectUncredited`,
  `setUncreditedDecision`, `setLedgerStudSource` (persisted via `persistMeta`,
  which already serialises `hoursLedger`).
- Reference doc: marked E3 shipped; VERSION ⇄ doc now both 1.3.
*Verified:* unit-checked clocked `Stud` 50 + accepted 5 → balance 5, self-check ok;
F1 asserts ledger provenance `clocked` / `1.3`.

### F-03 [High] — Runtime ingestion path (`state.js`; UI snippet in APPLY.md)
Added `ingestPayrollWorkbook(arrayBuffer)` (parse → `upsertTimeEntries`) and
`reconcileMonth(monthKey)` (runs `Reconcile.run` with storage + swaps + op-hours).
**UI half is blocked** — the upload control + ledger-tab render live in
`views/students.js`, which wasn’t in the upload. Paste-ready snippet in APPLY.md.
`index.html` already loads every pipeline module, so no script-tag change needed.

### F-04 [Med] — `timeEntries` keypath (`payrollParser.js`)
Entries now carry `id` (≡ `naturalKey`), so the inline `keyPath:'id'` store
accepts `put()` without a remap. *Verified (real fake-indexeddb):* 6 parsed rows
all have string `id`; two idempotent `upsertTimeEntries` calls leave 6 rows, no
duplicates.

### F-05 [Med] — No hardcoded operational window (`policyFlags.js`, threaded via `state.js`)
`getOperationalHours` returns **null** when neither special hours nor
`defaultStart/End` are configured (removed the `06:00–19:00` literal).
`checkOutsideHours` **skips** (no flag) when no window resolves — never guesses.
`state.reconcileMonth`/`getClockedHoursByMonth` pass `this.operationalHours`
through. *Verified:* E2/F1 unchanged (fixture sessions sit inside any window).

### F-06 [Med] — Export/import `timeEntries` + hardening (`storage.js`)
`exportData` now includes `timeEntries` + `schemaVersion`. `importData`
validates the payload is an object, restores `timeEntries` (filtering
`typeof e.id === 'string'`), and skips prototype-polluting setting keys
(`__proto__`/`constructor`/`prototype`). *Verified (fake-indexeddb):* round-trip
restores all rows; `__proto__` payload leaves `({}).polluted === undefined` while
a legit setting saves; a non-object payload is rejected.

### F-07 [Low] — Cold offline boot (`sw.js`)
`STATIC_FILES` now lists **every** asset `index.html` loads — all
`core/data/utils/views` modules, `vendor/xlsx.full.min.js`, and the three
stylesheets. Cache versions bumped to `v1.1.0` to evict the stale partial cache.

### F-08 [Low] — Cache-first match bug (`sw.js`)
Static matching switched from `STATIC_FILES.includes(url.pathname)` (relative vs
absolute — never matched) to a precomputed `STATIC_URLS` set of absolute hrefs
resolved against the SW scope; navigate fallback uses a resolved `INDEX_URL`.
*Verified:* simulated subpath host (`/app/`) — all listed assets HIT.

### F-09 [Low] — Admin-unrostered policy (`workedHoursNormalizer.js`)
Admin branch now returns `unrostered` (zero credit) when there is no matching
block. Rostered admin sessions are still credited verbatim. *Verified:* admin
14:00→16:00 unrostered → `Stud` 0, flags `[EDITED, UNROSTERED]`, pool 90.
**Invisible to F1** (the only fixture admin row is rostered). See decisions above.

### F-10 [Low] — Ambiguous names → pending (`identityMap.js`)
The index tracks `ambiguousNames` (a normalized form claimed by >1 distinct
student id); `resolve` skips those forms so they fall to **pending** instead of
silent last-write-wins. Reversed-name forms of the *same* student don’t trigger
it. *Verified:* two “Sam Smith” students → payroll “Sam Smith” resolves pending.

### F-11 [Low] — Timestamp validation + null-key guard (`payrollParser.js`)
`cellToLocalISO` only accepts ISO-shaped strings (`YYYY-MM-DD[ T hh:mm[:ss]]`),
else null. A missing/unparseable Shift Started no longer collapses to
`username|null`: the key becomes `username|NO_START#<row>`, a `MISSING_START`
anomaly + warning are emitted. *Verified:* C1 25/25 unchanged.

### F-12 [Low] — Token storage (`api.js`)
Token access funnelled through a swappable `tokenStore` (localStorage default,
**behaviour unchanged**), with a security note pointing at httpOnly-cookie /
in-memory storage for when the backend lands. *Verified:* syntax check.

### F-13 [Info] — PII drop enforced (`payrollParser.js`)
`buildHeaderMap` now excludes `DROP_COLUMNS` (the IP columns), so they can’t be
read even by future code — and the previously-dead `DROP_COLUMNS` constant is now
load-bearing. *Verified:* parsed entries expose no IP keys.

### F-14 [Info] — Flagged/uncredited render XSS — **BLOCKED (file absent)**
`views/students.js` wasn’t in the upload, so I couldn’t audit/patch the actual
render. APPLY.md ships a safe `textContent`-based render template for the flagged
+ uncredited tables to drop into that view.

### F-15 [Low] — Deterministic ordering (`reconcile.js`, `effectiveRoster.js`)
`adherence.byStudent` is emitted with **sorted** keys (matching
`clockedByStudent`). Added a comment in `effectiveRoster.js` documenting that
overrides are the base state and swaps replay on top in `createdAt` order (no
override↔swap timestamp interleaving by design).

### F-16 [Low] — Corrupt-file handling (`state.js`)
`ingestPayrollWorkbook` wraps `parseWorkbook` in try/catch and surfaces a clean
“corrupt or unsupported file” message instead of a raw SheetJS throw.

### F-17 [Low] — Server routes — **BLOCKED (files absent)**
`server/*` wasn’t in the upload. APPLY.md ships minimal Express route stubs
matching the `api.js` endpoints (incl. `/api/notifications/preferences`) so the
live caller doesn’t 404.

---

## Files in this delivery (`patched/`)

```
src/js/core/payrollParser.js        F-04, F-11, F-13
src/js/core/reconcile.js            F-01, F-15
src/js/core/workedHoursNormalizer.js F-09
src/js/core/policyFlags.js          F-05
src/js/core/identityMap.js          F-10
src/js/core/hoursLedger.js          F-02
src/js/core/state.js                F-02, F-03, F-05, F-16
src/js/core/effectiveRoster.js      F-15 (doc comment)
src/js/utils/storage.js             F-06
src/js/utils/api.js                 F-12
sw.js                               F-07, F-08
Documentation/Hours_Tracking_System_Reference.md  F-02 governance
tests/harness/hours.js              E3 assertions (uncredited pool + provenance)
tests/harness/baseline.json         re-captured golden master — COMMIT THIS
```
