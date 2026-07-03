// Core utilities — ported from Scheduler monolith + modules/utils.js
const SchedulerUtils = {
  pad(n) {
    return n.toString().padStart(2, '0');
  },

  toTimeStr(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return this.pad(h) + ':' + this.pad(m);
  },

  parseTimeStr(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  },

  timeStr(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String((h + 24) % 24).padStart(2, '0')}:${String((m + 60) % 60).padStart(2, '0')}`;
  },

  dateISO(y, m, d) {
    return `${y}-${this.pad(m + 1)}-${this.pad(d)}`;
  },

  /** YYYY-MM-DD in local timezone — avoids UTC shift from toISOString() */
  localDateStr(date) {
    const d = date instanceof Date ? date : new Date(date);
    return this.dateISO(d.getFullYear(), d.getMonth(), d.getDate());
  },

  overlap(startA, endA, startB, endB) {
    return Math.max(startA, startB) < Math.min(endA, endB);
  },

  range(a, b, step = 1) {
    const out = [];
    for (let x = a; x < b; x += step) out.push(x);
    return out;
  },

  deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  weekKey(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return this.localDateStr(start);
  },

  /** Week index within month (Sun-start), matches monolith weekKey */
  weekIndexInMonth(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const dayIndex = Math.floor((d - monthStart) / (1000 * 60 * 60 * 24));
    return Math.floor((dayIndex + monthStart.getDay()) / 7);
  },

  colorFromString(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = seed.charCodeAt(i) + ((h << 5) - h);
    }
    const c = (h & 0x00ffffff).toString(16).toUpperCase();
    return '#' + '000000'.substring(0, 6 - c.length) + c;
  },

  stableColor(name) {
    const palette = ['#FFB3BA', '#BAFFC9', '#BDE0FF', '#FFD6A5', '#E0BBE4', '#C9C9FF', '#FFDFBA'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * 17) % palette.length;
    return palette[h];
  },

  /**
   * Escape a value for safe interpolation into HTML — element text AND
   * attribute contexts (quotes are escaped, unlike the DOM textContent trick).
   * Canonical XSS-safe escaper for the whole app (Phase 3 / F-04).
   */
  escapeHtml(value) {
    const s = value === null || value === undefined ? '' : String(value);
    return s.replace(/[&<>"']/g, (ch) => {
      switch (ch) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return ch;
      }
    });
  }
};

window.SchedulerUtils = SchedulerUtils;
