// Student record normalization — scheduler CSV format ↔ UI format
const StudentData = {
  enrich(raw) {
    const id = String(raw.id || '');
    const weeklyMax = Number(raw.weekly_max_hours ?? raw.weeklyMaxHours ?? 18);
    const monthlyMax = Number(raw.contracted_monthly_hours ?? raw.monthlyMaxHours ?? 72) || weeklyMax * 4;

    return {
      id,
      name: raw.name || 'Unknown',
      color: raw.color || SchedulerUtils.stableColor(raw.name || id),
      avatar_url: raw.avatar_url || '',
      weekly_max_hours: weeklyMax,
      contracted_monthly_hours: monthlyMax,
      weeklyMaxHours: weeklyMax,
      monthlyMaxHours: monthlyMax,
      weeklyHours: Number(raw.weeklyHours ?? 0),
      monthlyHours: Number(raw.monthlyHours ?? 0),
      status: raw.status || 'active',
      availability: raw.availability || { weekly: [], unavailable_dates: [] },
      testDates: Array.isArray(raw.testDates) ? raw.testDates : [],
      email: raw.email || '',
      studentNumber: raw.studentNumber || raw.student_number || '',
      recentShifts: raw.recentShifts || [],
      contractType: raw.contractType || (typeof ContractManager !== 'undefined'
        ? ContractManager.resolveType(monthlyMax)
        : 'custom')
    };
  },

  isAvailableAt(student, dateStr, startTime, endTime) {
    const avail = student.availability;
    if (!avail) return false;

    const start = SchedulerUtils.parseTimeStr(startTime);
    const end = SchedulerUtils.parseTimeStr(endTime);
    const dayName = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });

    if (Array.isArray(avail.unavailable_dates)) {
      for (const block of avail.unavailable_dates) {
        if (block.date !== dateStr) continue;
        const bStart = SchedulerUtils.parseTimeStr(block.start);
        const bEnd = SchedulerUtils.parseTimeStr(block.end);
        if (SchedulerUtils.overlap(start, end, bStart, bEnd)) return false;
      }
    }

    if (Array.isArray(avail.weekly)) {
      return avail.weekly.some(w => {
        if (w.day !== dayName) return false;
        return SchedulerUtils.parseTimeStr(w.start) <= start &&
               SchedulerUtils.parseTimeStr(w.end) >= end;
      });
    }

    if (avail[dayName] && Array.isArray(avail[dayName])) {
      return avail[dayName].some(slot => {
        const slotStart = SchedulerUtils.parseTimeStr(slot);
        return start >= slotStart && end <= slotStart + 60;
      });
    }

    return false;
  },

  availabilityGridSlots(availability) {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const timeSlots = ['06:00', '09:00', '12:00', '15:00', '18:00'];
    const grid = {};

    for (const day of days) {
      grid[day] = [];
    }

    if (!availability) return grid;

    if (Array.isArray(availability.weekly)) {
      for (const w of availability.weekly) {
        if (!grid[w.day]) continue;
        const wStart = SchedulerUtils.parseTimeStr(w.start);
        const wEnd = SchedulerUtils.parseTimeStr(w.end);
        for (const slot of timeSlots) {
          const s = SchedulerUtils.parseTimeStr(slot);
          if (s >= wStart && s + 60 <= wEnd && !grid[w.day].includes(slot)) {
            grid[w.day].push(slot);
          }
        }
      }
    } else {
      for (const day of days) {
        if (availability[day]) grid[day] = [...availability[day]];
      }
    }

    return grid;
  }
};

window.StudentData = StudentData;
