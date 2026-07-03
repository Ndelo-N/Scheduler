// Phase 8 — Student contract templates, validation, compliance
const ContractManager = {
  MAX_HOURS: 72,
  MIN_HOURS: 1,

  TEMPLATES: [
    { id: '20h', name: 'Part-time (20h)', hours: 20 },
    { id: '40h', name: 'Standard (40h)', hours: 40 },
    { id: '60h', name: 'Full-time (60h)', hours: 60 },
    { id: '72h', name: 'Maximum (72h)', hours: 72 }
  ],

  validateHours(hours, max = null) {
    const cap = max ?? this.MAX_HOURS;
    const val = Number(hours);
    if (!Number.isFinite(val)) throw new Error('Enter a valid number of hours');
    if (val < this.MIN_HOURS || val > cap) {
      throw new Error(`Contract must be between ${this.MIN_HOURS} and ${cap} hours/month`);
    }
    return Math.round(val * 10) / 10;
  },

  templateById(id) {
    return this.TEMPLATES.find(t => t.id === id) || null;
  },

  resolveType(hours, contractType) {
    if (contractType && contractType !== 'custom') return contractType;
    const match = this.TEMPLATES.find(t => t.hours === hours);
    return match ? match.id : 'custom';
  },

  /** assigned / contracted → status label */
  classifyCompliance(assigned, contracted) {
    if (!contracted || contracted <= 0) return 'unknown';
    const pct = assigned / contracted;
    if (pct > 1.02) return 'non-compliant';
    if (pct >= 0.85) return 'active';
    if (pct >= 0.5) return 'at-risk';
    return 'under-filled';
  },

  statusLabel(status) {
    const labels = {
      active: 'On track',
      'at-risk': 'At risk',
      'under-filled': 'Under-filled',
      'non-compliant': 'Over contract',
      unknown: 'Unknown'
    };
    return labels[status] || status;
  },

  computeAssignedHours(studentId, shifts) {
    const sid = String(studentId);
    let minutes = 0;
    for (const shift of shifts || []) {
      const has = (shift.assignees || []).some(a =>
        String(typeof a === 'object' ? a.id : a) === sid
      );
      if (!has) continue;
      minutes += SchedulerUtils.parseTimeStr(shift.end) - SchedulerUtils.parseTimeStr(shift.start);
    }
    return Math.round((minutes / 60) * 10) / 10;
  },

  buildComplianceRow(student, assigned) {
    const contracted = student.contracted_monthly_hours || student.monthlyMaxHours || 0;
    const status = this.classifyCompliance(assigned, contracted);
    return {
      studentId: student.id,
      name: student.name,
      color: student.color,
      contracted,
      assigned,
      remaining: Math.max(0, Math.round((contracted - assigned) * 10) / 10),
      pct: contracted ? Math.round((assigned / contracted) * 100) : 0,
      status,
      statusLabel: this.statusLabel(status),
      contractType: student.contractType || this.resolveType(contracted)
    };
  },

  /** 0..1 — higher when student is further below monthly contract */
  getContractDeficitNorm(assigned, contracted) {
    if (!contracted || contracted <= 0) return 0.5;
    const pct = assigned / contracted;
    if (pct >= 1) return 0;
    return Math.min(1, 1 - pct);
  },

  summarizeCompliance(rows) {
    const summary = {
      total: rows.length,
      onTrack: 0,
      atRisk: 0,
      underFilled: 0,
      overContract: 0,
      unknown: 0,
      avgPct: 0
    };
    let pctSum = 0;
    let pctCount = 0;
    for (const row of rows) {
      if (row.status === 'active') summary.onTrack++;
      else if (row.status === 'at-risk') summary.atRisk++;
      else if (row.status === 'under-filled') summary.underFilled++;
      else if (row.status === 'non-compliant') summary.overContract++;
      else summary.unknown++;
      if (row.contracted > 0) {
        pctSum += row.pct;
        pctCount++;
      }
    }
    summary.avgPct = pctCount ? Math.round(pctSum / pctCount) : 0;
    return summary;
  }
};

window.ContractManager = ContractManager;
