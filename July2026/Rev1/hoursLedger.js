// Hours worked vs hours owed — v1.3 policy (Documentation/Hours_Tracking_System_Reference.md)
// v1.3 (E3): Stud may be sourced from CLOCKED/reconciled minutes (payroll-owned,
// prelude §0 / Locked_Decisions §7B) rather than scheduler-assigned hours. The math
// is source-agnostic — the caller supplies monthData[key].stud and declares the
// source via options.studSource, which is echoed back on the report for provenance.
const HoursLedger = {
  VERSION: '1.3',
  MAX_MONTHLY_CREDIT: 72,
  CARRY_TOLERANCE: 10,

  /** Contract periods within the academic year (month indices 0–11) */
  DEFAULT_CONTRACT_PERIODS: [
    { id: 'mar-may', name: 'Mar–May', startMonth: 2, endMonth: 4, isFinal: false },
    { id: 'jun-jul', name: 'Jun–Jul', startMonth: 5, endMonth: 6, isFinal: false },
    { id: 'aug', name: 'August', startMonth: 7, endMonth: 7, isFinal: false },
    { id: 'sep-oct', name: 'Sep–Oct', startMonth: 8, endMonth: 9, isFinal: false },
    { id: 'nov', name: 'November', startMonth: 10, endMonth: 10, isFinal: true }
  ],

  /** Months before first contracted period (Jan–Feb) */
  PRE_CONTRACT_MONTHS: [0, 1],

  monthKey(year, monthIndex) {
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  },

  parseMonthKey(key) {
    const [y, m] = String(key).split('-').map(Number);
    return { year: y, month: m - 1 };
  },

  getPeriods(customPeriods) {
    return Array.isArray(customPeriods) && customPeriods.length
      ? customPeriods
      : this.DEFAULT_CONTRACT_PERIODS;
  },

  getPeriodForMonth(year, monthIndex, customPeriods) {
    const periods = this.getPeriods(customPeriods);
    return periods.find(p => monthIndex >= p.startMonth && monthIndex <= p.endMonth) || null;
  },

  isPreContractMonth(monthIndex) {
    return this.PRE_CONTRACT_MONTHS.includes(monthIndex);
  },

  roundHours(n) {
    return Math.round(Number(n || 0) * 10) / 10;
  },

  /** Effective contract for a month (reduced R or normal Contr) */
  effectiveContract(entry, student) {
    if (entry?.reducedContr != null && entry.reducedContr !== '') {
      return this.roundHours(entry.reducedContr);
    }
    if (entry?.contr != null && entry.contr !== '') return this.roundHours(entry.contr);
    return this.roundHours(student?.contracted_monthly_hours || 0);
  },

  /** Bal_pre(N) = Bal(N−1) + Contr(N) − Stud(N) */
  preClaimBalance(prevBalance, contr, stud, isPreContract) {
    const prev = this.roundHours(prevBalance);
    const worked = this.roundHours(stud);
    if (isPreContract) return prev - worked;
    return this.roundHours(prev + contr - worked);
  },

  /** I7 — Claimable(N) = min(max(0, −Bal_pre), 72 − Contr) */
  computeClaimable(preClaimBal, contr, isPreContract) {
    if (isPreContract) {
      return this.roundHours(Math.max(0, -preClaimBal));
    }
    const banked = Math.max(0, -preClaimBal);
    const headroom = Math.max(0, this.MAX_MONTHLY_CREDIT - contr);
    return this.roundHours(Math.min(banked, headroom));
  },

  /** Monthly delta: Credit − Stud */
  monthDelta(contr, claimed, stud, isPreContract) {
    const credit = isPreContract
      ? this.roundHours(claimed)
      : this.roundHours(contr + claimed);
    return this.roundHours(credit - stud);
  },

  /** Running balance for one month */
  monthBalance(prevBalance, contr, claimed, stud, isPreContract) {
    return this.roundHours(prevBalance + this.monthDelta(contr, claimed, stud, isPreContract));
  },

  validateClaim(claimed, claimable) {
    const c = this.roundHours(claimed);
    const cap = this.roundHours(claimable);
    if (c < 0) return { valid: false, error: 'Claim cannot be negative' };
    if (c > cap + 1e-9) return { valid: false, error: `Claim ${c}h exceeds claimable cap ${cap}h` };
    return { valid: true };
  },

  /** I10 — R = C − B₀/k, bounded so total reduction ≤ B₀ */
  suggestReducedContract(B0, capacity, normalContract, periodMonths) {
    const debt = this.roundHours(B0);
    const C = this.roundHours(capacity);
    const F = this.roundHours(normalContract);
    const k = Math.max(1, periodMonths);
    if (debt <= 0) return null;
    const R = this.roundHours(C - debt / k);
    if (R < 0) return null;
    const totalReduction = this.roundHours(k * (F - R));
    if (totalReduction > debt + 1e-9) {
      return { R: this.roundHours(F - debt / k), k, totalReduction: debt, feasible: true };
    }
    return { R, k, totalReduction, feasible: R >= 0 };
  },

  evaluatePeriodBoundary(balance, period, hasApprovedReduction) {
    const bal = this.roundHours(balance);
    const violations = [];
    const suggestions = [];

    if (!period) return { balance: bal, violations, suggestions };

    if (period.isFinal) {
      if (bal > 1e-9) {
        violations.push({
          code: 'I9',
          message: `Final period (${period.name}): balance ${bal}h must be ≤ 0 (student owes work)`
        });
      }
    } else if (bal > this.CARRY_TOLERANCE + 1e-9 && !hasApprovedReduction) {
      suggestions.push({
        code: 'I8',
        message: `Period ${period.name} carry ${bal}h exceeds +${this.CARRY_TOLERANCE}h tolerance — suggest reduced contract (I10)`,
        balance: bal
      });
    } else if (bal > 1e-9 && bal <= this.CARRY_TOLERANCE + 1e-9) {
      suggestions.push({
        code: 'I8-carry',
        message: `Carry ${bal}h into next period — retire via catch-up assignment (≤${this.CARRY_TOLERANCE}h)`,
        balance: bal
      });
    }

    return { balance: bal, violations, suggestions };
  },

  /** Build ordered month keys for an academic year */
  academicMonthKeys(year) {
    const keys = [];
    for (let m = 0; m <= 10; m++) {
      keys.push(this.monthKey(year, m));
    }
    return keys;
  },

  /** Full ledger row chain for one student */
  buildStudentLedger(student, monthData, options = {}) {
    const year = options.year ?? new Date().getFullYear();
    const periods = this.getPeriods(options.contractPeriods);
    const approved = options.approvedReductions?.[String(student.id)] || null;
    const keys = options.monthKeys || this.academicMonthKeys(year);
    const rows = [];
    let prevBalance = 0;
    let totalCredit = 0;
    let totalWorked = 0;
    const violations = [];

    for (const key of keys) {
      const { month } = this.parseMonthKey(key);
      const isPreContract = this.isPreContractMonth(month);
      const raw = monthData[key] || {};
      const stud = this.roundHours(raw.stud ?? 0);
      const claimed = this.roundHours(raw.claimed ?? 0);
      const contr = isPreContract
        ? 0
        : this.effectiveContract(raw, student);
      const preClaim = this.preClaimBalance(prevBalance, contr, stud, isPreContract);
      const claimable = this.computeClaimable(preClaim, contr, isPreContract);
      const claimCheck = this.validateClaim(claimed, claimable);
      if (!claimCheck.valid) {
        violations.push({ month: key, code: 'A1', message: claimCheck.error });
      }
      const delta = this.monthDelta(contr, claimed, stud, isPreContract);
      const balance = this.monthBalance(prevBalance, contr, claimed, stud, isPreContract);
      const period = this.getPeriodForMonth(year, month, periods);
      const isPeriodEnd = period && month === period.endMonth;
      let boundary = null;
      if (isPeriodEnd) {
        boundary = this.evaluatePeriodBoundary(
          balance,
          period,
          approved && approved.periodId === period.id
        );
        violations.push(...(boundary.violations || []));
      }

      if (!isPreContract) totalCredit += contr + claimed;
      else totalCredit += claimed;
      totalWorked += stud;

      rows.push({
        monthKey: key,
        monthLabel: key,
        isPreContract,
        contr,
        claimed,
        stud,
        claimable,
        preClaimBalance: preClaim,
        delta,
        balance,
        period: period?.name || null,
        isPeriodEnd,
        boundary,
        claimValid: claimCheck.valid
      });

      prevBalance = balance;
    }

    const independentBalance = this.roundHours(totalCredit - totalWorked);
    const selfCheckOk = Math.abs(prevBalance - independentBalance) < 0.05;

    if (!selfCheckOk) {
      violations.push({
        code: 'self-check',
        message: `Balance chain ${prevBalance} ≠ Σcredit−Σworked ${independentBalance}`
      });
    }

    return {
      studentId: student.id,
      studentName: student.name,
      version: this.VERSION,
      studSource: options.studSource === 'clocked' ? 'clocked' : 'assigned',
      termBalance: prevBalance,
      rows,
      totalCredit: this.roundHours(totalCredit),
      totalWorked: this.roundHours(totalWorked),
      selfCheckOk,
      violations,
      signLabel: prevBalance > 0 ? 'owes work' : prevBalance < 0 ? 'owed pay' : 'settled'
    };
  },

  /** §9 raw-formula regression anchor (formula only — not claim-capped) */
  GOLDEN_ANCHOR: [
    { month: '2025-02', preContract: true, claimed: 51, stud: 51, expectedBalance: 0 },
    { month: '2025-03', contr: 50, claimed: 22, stud: 99, expectedBalance: -27 },
    { month: '2025-04', contr: 33, claimed: 30.5, stud: 31, expectedBalance: 5.5 },
    { month: '2025-05', contr: 50, claimed: 11, stud: 57, expectedBalance: 9.5 },
    { month: '2025-06', contr: 57, claimed: 0, stud: 26, expectedBalance: 40.5 }
  ],

  verifyGoldenAnchor() {
    let prev = 0;
    const errors = [];
    for (const row of this.GOLDEN_ANCHOR) {
      const bal = this.monthBalance(
        prev,
        row.contr || 0,
        row.claimed || 0,
        row.stud,
        !!row.preContract
      );
      if (Math.abs(bal - row.expectedBalance) > 0.05) {
        errors.push(`${row.month}: expected ${row.expectedBalance}, got ${bal}`);
      }
      prev = bal;
    }
    return { ok: errors.length === 0, errors };
  },

  exportLedgerCsv(reports) {
    const header = [
      'student_id', 'student_name', 'month', 'contract', 'claimed', 'stud',
      'claimable', 'delta', 'balance', 'period', 'sign'
    ];
    const rows = [header];
    for (const report of reports || []) {
      for (const r of report.rows) {
        rows.push([
          report.studentId,
          report.studentName,
          r.monthKey,
          r.contr,
          r.claimed,
          r.stud,
          r.claimable,
          r.delta,
          r.balance,
          r.period || '',
          report.signLabel
        ]);
      }
    }
    return rows.map(row => row.map(v => SchedulerExport.escapeCsvCell(v)).join(',')).join('\n');
  }
};

window.HoursLedger = HoursLedger;
