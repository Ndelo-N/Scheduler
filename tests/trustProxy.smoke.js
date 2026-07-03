'use strict';
/* F-06 verification — proves X-Forwarded-For spoofing can no longer reset the
 * login rate-limiter bucket. Run: node tests/trustProxy.smoke.js */
const request = require('supertest');
const assert = require('assert');

function mockPool() {
  return {
    query: async (sql) => {
      if (String(sql).toLowerCase().includes('select 1')) return { rows: [{ ok: 1 }], rowCount: 1 };
      // login path will try to read a user; make it fail past the limiter
      throw new Error('db-unavailable-in-test');
    },
    activeMode: 'postgres',
  };
}

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log('  PASS', m)) : (fail++, console.log('  FAIL', m)));

async function run() {
  // ── Scenario A: TRUST_PROXY unset → spoofed XFF must NOT create fresh buckets ──
  delete process.env.TRUST_PROXY;
  delete require.cache[require.resolve('../server/app')];
  const { createApp } = require('../server/app');
  const app = createApp(mockPool(), { pwaDir: null });

  console.log('[ TRUST_PROXY unset — XFF spoofing should be ignored ]');
  let sawLimit = false;
  for (let i = 0; i < 12; i++) {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', `9.9.9.${i}`) // rotate spoofed client IP each request
      .send({ username: 'u00000000', password: 'x' });
    if (res.status === 429) { sawLimit = true; break; }
  }
  ok(sawLimit, 'limiter trips despite rotating X-Forwarded-For (spoof defeated)');

  // ── Scenario B: TRUST_PROXY=1 → one genuine proxy hop is honored ──
  process.env.TRUST_PROXY = '1';
  delete require.cache[require.resolve('../server/app')];
  const { createApp: createApp2 } = require('../server/app');
  const app2 = createApp2(mockPool(), { pwaDir: null });
  // sanity: app still boots and serves health with the numeric setting
  const health = await request(app2).get('/api/health');
  ok(health.status === 200, 'app boots & serves with TRUST_PROXY=1');
  ok(app2.get('trust proxy') === 1, 'numeric hop count applied (=1)');

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
