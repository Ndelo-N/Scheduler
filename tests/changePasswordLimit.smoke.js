'use strict';
/* F-08 — change-password rate limiter. Proves the 6th wrong-password attempt
 * within the window is throttled (429) while the first 5 reach the handler (403).
 * Run: node tests/changePasswordLimit.smoke.js */
const request = require('supertest');

const FUTURE = new Date(Date.now() + 3600e3).toISOString();
// A real scrypt hash the guesses will never match (verify → false → 403).
const NEVER_MATCH_HASH = 'scrypt$32768$8$1$' + 'a'.repeat(32) + '$' + 'b'.repeat(64);

function authedPool() {
  return {
    activeMode: 'postgres',
    query: async (sql) => {
      const q = String(sql);
      if (q.includes('FROM user_sessions')) {
        // validateSession → authenticated user
        return { rows: [{
          expires_at: FUTURE, id: 'user-123', student_number: 'u12345678',
          role: 'student', first_name: 'Test', last_name: 'User',
          is_active: true, must_change_password: false,
        }], rowCount: 1 };
      }
      if (q.startsWith('UPDATE user_sessions')) return { rows: [], rowCount: 1 }; // slide expiry
      if (q.includes('SELECT password_hash FROM users')) {
        return { rows: [{ password_hash: NEVER_MATCH_HASH }], rowCount: 1 };
      }
      if (q.toLowerCase().includes('select 1')) return { rows: [{ ok: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
}

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log('  PASS', m)) : (fail++, console.log('  FAIL', m)));

async function run() {
  delete require.cache[require.resolve('../server/app')];
  const { createApp } = require('../server/app');
  const app = createApp(authedPool(), { pwaDir: null });

  const attempt = () => request(app)
    .post('/api/auth/change-password')
    .set('Cookie', 'sid=validtoken')
    .send({ currentPassword: 'wrong-guess', newPassword: 'Str0ng!NewPassw0rd' });

  console.log('[ change-password: 5 allowed (403 wrong pw), 6th throttled (429) ]');
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await attempt()).status);
  console.log('  statuses:', statuses.join(', '));

  ok(statuses.slice(0, 5).every(s => s === 403), 'first 5 reach handler → 403 (wrong current password)');
  ok(statuses[5] === 429, '6th is rate-limited → 429');

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
