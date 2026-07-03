// CSV import — scheduler native + Google Form formats
const CSVParser = {
  SAMPLE_CSV: `id,name,weekly_max_hours,contracted_monthly_hours,color,availability
1,Alice,18,72,#FFB3BA,"{""weekly"": [{""day"":""Mon"",""start"":""09:00"",""end"":""17:00""},{""day"":""Wed"",""start"":""09:00"",""end"":""12:00""}], ""unavailable_dates"": [{""date"":""2025-09-12"",""start"":""10:00"",""end"":""12:00""}]}"
2,Bob,12,48,#BAFFC9,"{""weekly"": [{""day"":""Tue"",""start"":""13:00"",""end"":""18:00""},{""day"":""Thu"",""start"":""09:00"",""end"":""15:00""}], ""unavailable_dates"": []}"
3,Carla,16,64,#BDE0FF,"{""weekly"": [{""day"":""Mon"",""start"":""09:00"",""end"":""20:00""},{""day"":""Fri"",""start"":""09:00"",""end"":""17:00""}], ""unavailable_dates"": [{""date"":""2025-09-10"",""start"":""09:00"",""end"":""11:00""}]}"
4,Diego,18,72,#FFD6A5,"{""weekly"": [{""day"":""Wed"",""start"":""12:00"",""end"":""18:00""},{""day"":""Fri"",""start"":""10:00"",""end"":""16:00""}], ""unavailable_dates"": []}"
5,Eva,10,40,#E0BBE4,"{""weekly"": [{""day"":""Tue"",""start"":""09:00"",""end"":""12:00""},{""day"":""Thu"",""start"":""12:00"",""end"":""18:00""}], ""unavailable_dates"": [{""date"":""2025-09-19"",""start"":""14:00"",""end"":""16:00""}]}"`,

  parse(csvText) {
    if (this.detectGoogleFormCSV(csvText)) {
      return this.parseGoogleFormCSV(csvText);
    }
    return this.parseSchedulerCSV(csvText);
  },

  detectGoogleFormCSV(csvText) {
    const first = (csvText.split(/\r?\n/).filter(Boolean)[0] || '').toLowerCase();
    if (/(^|,)\s*availability\s*(,|$)/.test(first)) return false;
    return first.includes('timestamp') || first.includes('email') ||
      first.includes('form') || first.includes('what is your name') ||
      first.includes('student name');
  },

  parseSchedulerCSV(csvText) {
    const lines = csvText.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return { students: [], mode: 'scheduler', warnings: ['Empty CSV'] };

    const header = this.splitCsvLine(lines[0]).map(h => h.trim());
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));
    const students = [];

    for (const line of lines.slice(1)) {
      const cols = this.splitCsvLine(line);
      const get = (k) => (cols[idx[k]] ?? '').trim();
      let availability = { weekly: [], unavailable_dates: [] };
      const availStr = get('availability') || '{}';
      try {
        availability = JSON.parse(availStr);
      } catch (e) {
        try {
          availability = JSON.parse(availStr.replace(/""/g, '"'));
        } catch (_) { /* keep default */ }
      }

      students.push({
        id: get('id') || '',
        name: get('name') || '',
        color: get('color') || '#BDE0FF',
        avatar_url: get('avatar_url') || '',
        weekly_max_hours: Number(get('weekly_max_hours') || 18),
        contracted_monthly_hours: Number(get('contracted_monthly_hours') || 0),
        availability
      });
    }

    return { students, mode: 'scheduler', warnings: [] };
  },

  parseGoogleFormCSV(csvText) {
    const lines = csvText.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return { students: [], mode: 'google', warnings: ['Empty CSV'] };

    const header = this.splitCsvLine(lines[0]);
    const lower = header.map(h => h.trim().toLowerCase());
    const nameIdx = this.findFirst(lower, ['name', 'student name', 'full name', 'what is your name?']);
    const weeklyIdx = this.findFirst(lower, ['weekly max hours', 'weekly_max_hours']);
    const monthlyIdx = this.findFirst(lower, ['contracted monthly hours', 'contracted_monthly_hours']);
    const colorIdx = this.findFirst(lower, ['color', 'preferred color']);
    const avatarIdx = this.findFirst(lower, ['avatar', 'avatar url', 'photo', 'image url']);

    const students = [];
    for (const line of lines.slice(1)) {
      const cols = this.splitCsvLine(line);
      const getBy = (i, def = '') => (i >= 0 && i < cols.length ? cols[i] : def);
      const name = getBy(nameIdx, '').trim();
      if (!name) continue;

      students.push({
        id: '',
        name,
        color: getBy(colorIdx, '#BDE0FF'),
        avatar_url: getBy(avatarIdx, ''),
        weekly_max_hours: Number(getBy(weeklyIdx, '18')) || 18,
        contracted_monthly_hours: Number(getBy(monthlyIdx, '0')) || 0,
        availability: { weekly: [], unavailable_dates: [] }
      });
    }

    const warnings = nameIdx < 0 ? ['Could not locate a name column'] : [];
    return { students, mode: 'google', warnings };
  },

  splitCsvLine(line) {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  },

  findFirst(arr, candidates) {
    for (const c of candidates) {
      const idx = arr.indexOf(c);
      if (idx >= 0) return idx;
    }
    return -1;
  }
};

window.CSVParser = CSVParser;
