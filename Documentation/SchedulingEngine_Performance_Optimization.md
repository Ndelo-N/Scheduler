# SchedulingEngine — Performance Optimization

**Companion to:** `SchedulingEngine_Architecture_Review.md` (§5)
**Measured baseline:** the real engine, loaded by the review harness, generates a full September for 5 students / 264 hourly slots in **297 ms**, deterministically. That is fine for your live scale (7 students) but degrades super-linearly toward department scale. This document derives the complexity, identifies the dominant cost, and gives the concrete fixes (with the code) plus a benchmark you can commit.

---

## 1. Notation

| Symbol | Meaning | Live value | Dept value |
|---|---|---|---|
| **S** | students | ~7 | ~40–60 |
| **N** | shifts in a run (hourly slots × operational days) | ~264/month | ~264/month (×3 for 3-month) |
| **D** | operational days | ~22 | ~22 |
| **A** | avg availability blocks per student | ~2–4 | ~2–4 |
| **K** | shifts on a given day | ~12 | ~12 |
| **I** | rebalance iterations | ≤200 (cap) | ≤200 |

The key observation: **N is roughly constant** (a month is a month), so cost scales mainly in **S** — but several inner operations are themselves O(N), producing the S·N² behaviour.

---

## 2. Complexity of every hot function (current → target)

| Function | Current | Derivation | Target | Technique |
|---|---|---|---|---|
| `runSchedulingAlgorithm` | **O(S·N²)** | N shifts × [sort S candidates × score, where score calls O(N) hour fns] | **O(S·N log N)** | counters make score O(1); sort dominates |
| `getTotalMonthlyHours` | O(N) | scans `shiftList` | **O(1)** | `monthMinutes[sid]` counter |
| `getWeeklyAssignedHours` | O(N) | 7-day × per-day bucket scan | **O(1)** | `weekMinutes[sid:wk]` counter |
| `getTotalAssignedHours` | O(N) | full scan | **O(1)** | counter |
| `getConsistencyScore` | O(N) | scan for weekday+start matches | **O(1)** | `consistency[sid:dow:start]` counter |
| `getConsecutiveHours`/`buildDayBlocks` | O(K log K) | sort that day's slots | **O(K)** | cache day blocks per (sid,date) |
| `canAssignStudentToShift` | O(N) | calls the two O(N) hour fns | **O(1)** | falls out of counters |
| `scoreCandidate` | O(S+N) | `getFairnessComponent` scans S students × O(N) | **O(1)** (after agg) | per-pass aggregate |
| **`getFairnessComponent`** | **O(S·N)** ⚠ | for each of S students computes O(N) hours — *per candidate* | **O(1)** | precompute hours vector once/shift |
| `validateAssignment` | O(K) | day bucket (already bucketed ✓) | O(K) | fine |
| `rebalance` (heuristic) | **O(I·S²·N)** | I × S² pairs × N scan, hours O(N) | — | replace (below) |
| `rebalanceSSD` (Fix C) | **O(M·S·N)** | M accepted moves × [S sort + N shift scan], hours O(1) | acceptable | M bounded by convergence |
| `buildRunContext` | O(N + S) | one pass + map build | O(N+S) | fine (amortised) |
| `validateSchedule` | O(N log N + S·W) | per-student sort + week buckets | same | rare call |
| `scheduleToShifts` | O(N + S) | rebuilds a studentMap (waste) | O(N) | reuse context map |
| Student lookup | **O(1)** ✅ | `studentMap` is a Map | O(1) | **already optimal** |

### The dominant cost, made explicit

`scoreCandidate` → `getFairnessComponent` is called **once per candidate per shift**. Inside, it computes every student's monthly hours (S students × O(N) each). So per shift it is O(S²·N), and across N shifts the run is:

$$T_{\text{fairness}} = O(N \cdot S^2 \cdot N) = O(S^2 N^2).$$

At S=7, N=264: ≈ 7²·264² ≈ 3.4M operations — trivial (hence 297 ms). At S=60, N=264: ≈ 60²·264² ≈ **251M** operations *just for fairness scoring* — now seconds. **This single function is the scaling wall.** Fixing it (Step 5 below) collapses the S² factor to S and the inner N to 1.

---

## 3. The fix, in three moves

### Move 1 — Incremental hour/consistency counters (O(N) → O(1))

Maintain running totals in the RunContext, updated by a single `assign()/unassign()` chokepoint (full code in Refactoring Guide §4). The invariant: **counters always equal what a full recompute would give** — guarded by a test (Test Strategy §7).

```javascript
// buildRunContext():
this._ctx.monthMinutes = {};   // sid -> minutes
this._ctx.weekMinutes  = {};   // `${sid}:${weekIdx}` -> minutes
this._ctx.consistency  = {};   // `${sid}:${dow}:${start}` -> count
for (const s of this._ctx.shiftList){ s._dateObj = new Date(s.date+'T00:00:00'); s._dow = s._dateObj.getDay(); }

// readers become O(1):
getTotalMonthlyHours(sid){ return (this._ctx?.monthMinutes[sid]||0)/60; }
getWeeklyAssignedHours(sid,d){ return (this._ctx?.weekMinutes[`${sid}:${this.u.weekIndexInMonth(d)}`]||0)/60; }
```

### Move 2 — Per-pass aggregate cache (kills the S² in fairness)

Compute the student-hours vector and edge min/max **once per shift**, not once per candidate:

```javascript
_passAggregate(){
  const ids = [...this._ctx.studentMap.keys()];
  const hours = ids.map(id => this.getTotalMonthlyHours(id));   // S × O(1)
  const sum = hours.reduce((a,b)=>a+b,0);
  return { ids, avgHours: sum/(ids.length||1),
           minHours: Math.min(...hours), maxHours: Math.max(...hours) };
}
// runSchedulingAlgorithm, per shift:
const agg = this._passAggregate();                              // O(S) once
candidates.sort((a,b)=> this.scoreCandidate(b,shift,agg) - this.scoreCandidate(a,shift,agg));
// getFairnessComponent(sid,agg) reads agg.avgHours → O(1)
```

Per shift: O(S) for the aggregate + O(S log S) sort, instead of O(S²·N). Run total drops to:

$$T = O(N \cdot S \log S) \approx O(S \cdot N \log N).$$

### Move 3 — Micro-optimisations on the hot path

- **Precompute `shift._dow`/`shift._dateObj`** (done in `buildRunContext`) — removes thousands of `new Date()` + `getDay()` calls from sort comparators and scoring.
- **Reuse `studentMap` in `scheduleToShifts`** instead of rebuilding it (it's on the return path).
- **Integer-map IDs for tie-breaks** — replace `String.localeCompare` in comparators with numeric compares.
- **Gate `debug` logging** — `this.log(...)` in inner loops does string concatenation on every call; behind a flag it's free in production.

---

## 4. Before/after complexity summary

| Metric | Before | After moves 1–3 |
|---|---|---|
| Full run | **O(S²·N²)** | **O(S·N log N)** |
| Per-candidate score | O(S+N) | O(1) |
| Monthly/weekly hours | O(N) | O(1) |
| Rebalance | O(I·S²·N), non-convergent | O(M·S·N), convergent (SSD) |
| Memory (context) | O(S+N) maps | O(S+N) maps + O(S·W) counters (negligible) |

---

## 5. Projected scaling (model + how to confirm)

Using the operation counts above with a nominal ~5 ns/op on a laptop, *modelled* (confirm with the §6 benchmark):

```
Run time (ms), MODELLED               ● current O(S²N²)       ▲ after O(S·N log N)
  10000 ┤                                                ●
        │                                          ●
   1000 ┤                                    ●
        │                          ●                          ▲
    100 ┤              ●                                ▲  ▲
        │      ●  ●                       ▲  ▲  ▲
     10 ┤ ●                   ▲  ▲
        │   ▲  ▲  ▲
      1 ┤
        └────────────────────────────────────────────────────
          5   10   20    40    60    80   100    students
   Measured anchor: S=5 → 297 ms (current). Live zone S≈7. Dept zone S≈40–60.
```

**Targets (post-fix):**
- S=7 (live): well under 100 ms.
- S=60 (department, single month): **< 1 s**.
- S=60, 3-month view: **< 3 s** (≈3× single month; ensure shared work isn't re-paid — see §7).
- S=100 (stress ceiling): **< 3 s** single month.

---

## 6. Benchmark methodology (commit this)

A reproducible benchmark with a regression alarm, so the gains can't silently rot (mirrors Test Strategy §10).

```javascript
// tests/perf/benchmark.js
const { makeEngine, makeNStudents } = require('../helpers');
const fs = require('fs');

function timeRun(n, reps = 3) {
  const students = makeNStudents(n);
  let best = Infinity;
  for (let r = 0; r < reps; r++) {
    const e = makeEngine(students, 2025, 8);
    const t0 = process.hrtime.bigint();
    e.runSchedule(2025, 8);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    best = Math.min(best, ms);          // best-of-reps reduces GC noise
  }
  return +best.toFixed(1);
}

const sizes = [5, 10, 20, 40, 60, 100];
const results = sizes.map(n => ({ n, ms: timeRun(n) }));
console.table(results);

// regression gate: compare to committed baseline, fail if any size > +20%
const baseline = JSON.parse(fs.readFileSync(__dirname + '/baseline.json', 'utf8'));
for (const { n, ms } of results) {
  const base = baseline.find(b => b.n === n)?.ms;
  if (base && ms > base * 1.2) throw new Error(`Perf regression at S=${n}: ${ms}ms vs ${base}ms baseline`);
}
```

**Methodology notes:**
- Run under `TZ=Africa/Johannesburg` (same as production; date math differs by tz).
- **Best-of-3** per size to suppress GC/JIT noise; report the minimum.
- Fix the dataset shape per size (deterministic generator) so numbers are comparable across commits.
- Capture `baseline.json` *after* the moves in §3; thereafter CI alarms on >20% regression.
- Record the machine (CPU, Node version) in the baseline file — absolute ms are machine-relative; the *shape* (curve) is what matters.

---

## 7. Three-month view & other multipliers

`generateThreeMonthSchedules` runs the whole algorithm three times. With no shared context it pays every cost 3×; worse, anything quadratic is paid 3× at full size. After the §3 fixes it's a clean ~3× single-month, which meets the < 3 s target. Guard it:

```javascript
test('3-month view ≈ 3× single month, not 9×', () => {
  const students = makeNStudents(40);
  const one = bench(() => makeEngine(students,2025,8).runSchedule(2025,8));
  const three = bench(() => makeEngine(students,2025,8).generateThreeMonthSchedules());
  expect(three).toBeLessThan(one * 4);
});
```

Other multipliers to watch: the rebalance runs after every generate (so its cost adds to each run), and `validateSchedule` (O(N log N)) if called on every UI interaction — call it on demand, not per keystroke.

---

## 8. Memory profile

Memory is not a concern at any realistic scale: the RunContext holds O(S+N) maps plus O(S·W) counters (W ≈ 5 weeks). For S=100, N=264: a few hundred KB. The one thing to avoid is **retaining contexts** — `clearRunContext()` in a `finally` (already the pattern) ensures the maps are released after each run. Keep that discipline when adding the counter maps.

---

## 9. Optimization checklist (perf-specific, maps to Action Plan §D)

| # | Optimization | Expected effect | Verify |
|---|---|---|---|
| 1 | `monthMinutes` counter | monthly hours O(N)→O(1) | counter-invariant test |
| 2 | `weekMinutes` counter | weekly hours O(N)→O(1) | counter-invariant test |
| 3 | `consistency` counter | consistency O(N)→O(1) | counter-invariant test |
| 4 | single `assign()/unassign()` chokepoint | enables 1–3; prevents drift | golden master unchanged |
| 5 | per-pass aggregate cache | fairness O(S²·N)→O(S) | benchmark drop at S=60 |
| 6 | precompute `_dow`/`_dateObj` | fewer Date allocs | benchmark |
| 7 | reuse `studentMap` in `scheduleToShifts` | less garbage on return path | benchmark |
| 8 | integer-map tie-break IDs | faster comparators | benchmark |
| 9 | gate debug logging | removes string concat in hot loops | benchmark with logging off |
| 10 | commit perf baseline + CI alarm | prevents silent regressions | CI fails on +20% |

**Bottom line:** the engine's architecture (RunContext, O(1) student lookup) already did the hard structural part. The remaining work is **three mechanical moves** — counters, an aggregate cache, and a handful of micro-optimisations — that turn an O(S²·N²) run into O(S·N log N) and bring department scale comfortably under one second, with a committed benchmark to keep it there. None of these change scheduling decisions, so the golden master stays green throughout.
