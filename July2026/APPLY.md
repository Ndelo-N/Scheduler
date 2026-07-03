# How to apply these fixes

## 1. Drop the patched files in

Copy everything under `patched/` over the same paths in your repo:

```
patched/src/js/core/*.js      → Student Scheduler PWA/src/js/core/
patched/src/js/utils/*.js     → Student Scheduler PWA/src/js/utils/
patched/sw.js                 → Student Scheduler PWA/sw.js
patched/Documentation/*.md    → Student Scheduler PWA/Documentation/
patched/tests/harness/*       → Student Scheduler PWA/tests/harness/   (incl. baseline.json)
```

Then run the suites from the repo root to confirm green in your tree:

```bash
node tests/payrollParser_smoke.js
node tests/identityMap_smoke.js
node tests/effectiveRoster_smoke.js
node tests/reconcile_smoke.js
node tests/harness/hours.js          # 33 passed, 0 failed
```

> **Commit `tests/harness/baseline.json`.** It was regenerated on purpose (the
> new `uncreditedPool` / `uncreditedMinutes` / sorted-adherence / ledger
> provenance fields change the golden JSON). The hand-verified totals were
> extended first and pass; the baseline just records the new shape.

Nothing in `index.html` needs editing — it already loads every pipeline module.
The service worker bumps to `v1.1.0`, so clients re-cache on next load.

## 2. Turn on clocked Stud (the v1.3 switch)

`Stud` stays scheduler-**assigned** (v1.2 behaviour) until you flip the switch:

```js
await state.setLedgerStudSource('clocked');   // Stud now = reconciled clocked minutes
// …per month, an admin accepts/rejects the UNROSTERED pool:
await state.acceptUncredited(studentId, '2025-09');   // folds those minutes into Stud
await state.rejectUncredited(studentId, '2025-09');   // leaves them excluded
await state.setLedgerStudSource('assigned');   // revert anytime
```

Ingest + reconcile from an uploaded VeraLab export:

```js
const buf = await file.arrayBuffer();
const { count, warnings } = await state.ingestPayrollWorkbook(buf);
const report = await state.reconcileMonth('2025-09');   // report.uncreditedPool, report.flaggedSessions, …
```

---

## Reversing the two decisions

**(a) Admin-unrostered crediting (F-09).** To go back to crediting admin-edited
unrostered sessions verbatim, delete this guard in
`src/js/core/workedHoursNormalizer.js` (the admin branch):

```js
if (block == null || blockStart === null || blockEnd === null) {
  return result(null, null, null, 'unrostered');     // ← delete these lines to restore verbatim credit
}
```

**(b) Verbatim pool value for admin rows (decision 2).** The pool is grid-rounded
for everyone. To make *admin* rows contribute their verbatim span instead, change
the computation in `src/js/core/reconcile.js`:

```js
// current (grid-rounded for all):
sessionUncredited = Math.max(0, WN.roundOut(clockOut) - WN.roundIn(clockIn));

// verbatim-for-admin variant:
sessionUncredited = entry.edited
  ? Math.max(0, clockOut - clockIn)
  : Math.max(0, WN.roundOut(clockOut) - WN.roundIn(clockIn));
```

---

## 3. Blocked items — files weren’t in the upload

These three couldn’t be applied because the relevant files aren’t present.
Paste-ready code below; each is small.

### F-14 + F-03 (UI half) — `views/students.js`

`index.html` already loads `src/js/views/students.js`. Add an upload control and a
worked-hours panel to that view. **Render with `textContent` only** (never
`innerHTML` with row data) — usernames/editor names are attacker-influenced.

```js
// ── Worked-hours panel (drop into the StudentsView/ledger tab) ──────────────
// Assumes `this.state` is the AppStateManager and `mountEl` is a container node.

function renderWorkedHoursControls(mountEl, state, monthKey) {
  mountEl.textContent = '';

  // Upload control
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = '.xls,.xlsx';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');

  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    status.textContent = 'Reading payroll…';
    try {
      const buf = await f.arrayBuffer();
      const { count, warnings } = await state.ingestPayrollWorkbook(buf);   // F-03/F-16
      const report = await state.reconcileMonth(monthKey);
      status.textContent =
        `Ingested ${count} rows` + (warnings.length ? ` (${warnings.length} warnings)` : '') + '.';
      renderReconcileReport(mountEl, state, report, monthKey);
    } catch (err) {
      status.textContent = `Could not import: ${err.message}`;   // clean message (F-16)
    } finally {
      file.value = '';
    }
  });

  mountEl.append(file, status);
}

// ── Safe tables for flagged sessions + the UNROSTERED uncredited pool (F-14) ──
function renderReconcileReport(mountEl, state, report, monthKey) {
  const old = mountEl.querySelector('.wh-report');
  if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.className = 'wh-report';

  // Flagged sessions
  wrap.appendChild(makeTable(
    'Flagged sessions',
    ['Student', 'Date', 'Flags', 'Worked (min)', 'Uncredited (min)'],
    report.flaggedSessions.map((s) => [
      s.studentName || s.username,
      s.dateISO || '',
      (s.flags || []).join(', '),
      s.workedMinutes == null ? '—' : String(s.workedMinutes),
      String(s.uncreditedMinutes || 0),
    ])
  ));

  // UNROSTERED uncredited pool, with accept/reject
  const pool = report.uncreditedPool ? report.uncreditedPool.byStudent : {};
  const rows = Object.values(pool).filter((p) => p.uncreditedMinutes > 0);
  if (rows.length) {
    const table = makeTable(
      'Uncredited pool (UNROSTERED — not in Stud until accepted)',
      ['Student', 'Uncredited (min)', ''],
      rows.map((p) => [p.studentName || p.studentId, String(p.uncreditedMinutes), null])
    );
    // append accept/reject buttons safely (no innerHTML)
    rows.forEach((p, i) => {
      const cell = table.tBodies[0].rows[i].cells[2];
      const accept = document.createElement('button');
      accept.type = 'button';
      accept.textContent = 'Accept';
      accept.addEventListener('click', () => state.acceptUncredited(p.studentId, monthKey));
      const reject = document.createElement('button');
      reject.type = 'button';
      reject.textContent = 'Reject';
      reject.addEventListener('click', () => state.rejectUncredited(p.studentId, monthKey));
      cell.append(accept, document.createTextNode(' '), reject);
    });
    wrap.appendChild(table);
  }

  mountEl.appendChild(wrap);
}

function makeTable(caption, headers, bodyRows) {
  const table = document.createElement('table');
  const cap = document.createElement('caption');
  cap.textContent = caption;                         // textContent — safe
  table.appendChild(cap);
  const thead = table.createTHead();
  const hr = thead.insertRow();
  headers.forEach((h) => { const th = document.createElement('th'); th.textContent = h; hr.appendChild(th); });
  const tb = table.createTBody();
  bodyRows.forEach((cells) => {
    const tr = tb.insertRow();
    cells.forEach((c) => { const td = tr.insertCell(); if (c !== null) td.textContent = c; });
  });
  return table;
}
```

### F-17 — minimal server routes (`server/`)

If/when you stand up the Express backend, these stubs make the `api.js` callers
resolve instead of 404. The live call today is `/api/notifications/preferences`
(from `notifications.js`).

```js
// server/routes/api.js
const express = require('express');
const router = express.Router();

// Notifications preferences (the one live caller)
let prefsStore = {};                                  // swap for a real store later
router.get('/notifications/preferences', (req, res) => res.json(prefsStore));
router.put('/notifications/preferences', (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'preferences must be an object' });
  }
  prefsStore = { ...prefsStore, ...req.body };
  res.json(prefsStore);
});

// Stubs matching api.js endpoints — return empty collections until backed.
router.get('/schedules', (req, res) => res.json([]));
router.get('/shifts',    (req, res) => res.json([]));
router.get('/students',  (req, res) => res.json([]));
router.get('/swaps',     (req, res) => res.json([]));

module.exports = router;
```

```js
// server/index.js  (wire-up)
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./routes/api'));
app.listen(process.env.PORT || 3000, () => console.log('API on :3000'));
```
