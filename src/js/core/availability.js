// Phase 9 — Student availability validation, access workflow, scheduler format
const AvailabilityManager = {
  DAYS: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  STATUSES: ['draft', 'submitted', 'locked'],

  defaultAccess() {
    return {
      canEdit: true,
      status: 'draft',
      submittedAt: null,
      updatedAt: null,
      history: []
    };
  },

  statusIcon(access) {
    if (!access) return '—';
    if (access.status === 'locked' || !access.canEdit) return '🔒';
    if (access.status === 'submitted') return '✅';
    return '📝';
  },

  statusLabel(access) {
    if (!access) return 'Unknown';
    if (access.status === 'locked') return 'Locked';
    if (access.status === 'submitted') return 'Submitted';
    if (access.canEdit) return 'Draft';
    return 'No access';
  },

  normalizeAvailability(raw) {
    const base = raw && typeof raw === 'object' ? raw : {};
    return {
      weekly: Array.isArray(base.weekly) ? base.weekly.map(w => ({
        day: w.day,
        start: w.start,
        end: w.end,
        label: w.label || w.subject || ''
      })) : [],
      unavailable_dates: Array.isArray(base.unavailable_dates) ? base.unavailable_dates.map(u => ({
        date: u.date,
        start: u.start,
        end: u.end,
        reason: u.reason || u.label || ''
      })) : []
    };
  },

  convertToSchedulerFormat(availability) {
    return this.normalizeAvailability(availability);
  },

  findWeeklyOverlaps(weekly) {
    const overlaps = [];
    const byDay = {};
    for (const block of weekly || []) {
      if (!block.day || !block.start || !block.end) continue;
      if (!byDay[block.day]) byDay[block.day] = [];
      byDay[block.day].push(block);
    }
    for (const [day, blocks] of Object.entries(byDay)) {
      const sorted = [...blocks].sort((a, b) =>
        SchedulerUtils.parseTimeStr(a.start) - SchedulerUtils.parseTimeStr(b.start)
      );
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        if (SchedulerUtils.parseTimeStr(a.end) > SchedulerUtils.parseTimeStr(b.start)) {
          overlaps.push({ day, blockA: a, blockB: b });
        }
      }
    }
    return overlaps;
  },

  findUnavailableOverlaps(unavailable) {
    const overlaps = [];
    const byDate = {};
    for (const block of unavailable || []) {
      if (!block.date) continue;
      if (!byDate[block.date]) byDate[block.date] = [];
      byDate[block.date].push(block);
    }
    for (const [date, blocks] of Object.entries(byDate)) {
      const sorted = [...blocks].sort((a, b) =>
        SchedulerUtils.parseTimeStr(a.start) - SchedulerUtils.parseTimeStr(b.start)
      );
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        if (SchedulerUtils.parseTimeStr(a.end) > SchedulerUtils.parseTimeStr(b.start)) {
          overlaps.push({ date, blockA: a, blockB: b });
        }
      }
    }
    return overlaps;
  },

  validate(availability) {
    const errors = [];
    const warnings = [];
    const normalized = this.normalizeAvailability(availability);

    if (!normalized.weekly.length) {
      errors.push('Add at least one weekly availability block');
    }

    for (const block of normalized.weekly) {
      if (!this.DAYS.includes(block.day)) {
        errors.push(`Invalid day: ${block.day}`);
        continue;
      }
      if (!block.start || !block.end) {
        errors.push(`Missing start/end for ${block.day}`);
        continue;
      }
      const start = SchedulerUtils.parseTimeStr(block.start);
      const end = SchedulerUtils.parseTimeStr(block.end);
      if (end <= start) {
        errors.push(`${block.day}: end time must be after start time`);
      }
    }

    for (const block of normalized.unavailable_dates) {
      if (!block.date) {
        errors.push('Unavailable block missing date');
        continue;
      }
      if (!block.start || !block.end) {
        errors.push(`Unavailable block on ${block.date} missing times`);
        continue;
      }
      if (SchedulerUtils.parseTimeStr(block.end) <= SchedulerUtils.parseTimeStr(block.start)) {
        errors.push(`${block.date}: unavailable end must be after start`);
      }
    }

    const weeklyOverlaps = this.findWeeklyOverlaps(normalized.weekly);
    for (const o of weeklyOverlaps) {
      errors.push(`${o.day}: overlapping blocks ${o.blockA.start}–${o.blockA.end} and ${o.blockB.start}–${o.blockB.end}`);
    }

    const unavailOverlaps = this.findUnavailableOverlaps(normalized.unavailable_dates);
    for (const o of unavailOverlaps) {
      errors.push(`${o.date}: overlapping unavailable periods`);
    }

    return { valid: errors.length === 0, errors, warnings, normalized };
  },

  formatPreview(availability) {
    const norm = this.normalizeAvailability(availability);
    const weekly = norm.weekly.map(w =>
      `${w.day} ${w.start}–${w.end}${w.label ? ` (${w.label})` : ''}`
    );
    const unavail = norm.unavailable_dates.map(u =>
      `${u.date} ${u.start}–${u.end}${u.reason ? ` — ${u.reason}` : ''}`
    );
    return { weekly, unavailable: unavail };
  },

  exportAvailabilityCsv(students, accessMap) {
    const header = ['id', 'name', 'status', 'can_edit', 'submitted_at', 'availability'];
    const rows = [header];
    for (const st of students) {
      const access = accessMap[String(st.id)] || this.defaultAccess();
      const avail = JSON.stringify(st.availability || {}).replace(/"/g, '""');
      rows.push([
        st.id,
        st.name,
        access.status,
        access.canEdit ? 'yes' : 'no',
        access.submittedAt || '',
        `"${avail}"`
      ]);
    }
    return rows.map(r => r.map(v => SchedulerExport.escapeCsvCell(v)).join(',')).join('\n');
  }
};

window.AvailabilityManager = AvailabilityManager;
