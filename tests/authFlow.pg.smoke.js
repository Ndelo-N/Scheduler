'use strict';
/* Phase 5 — consolidated AUTH-FLOW baseline (login → session → protected → logout).
 * Requires live Postgres with schema+migrations applied. Serves as the regression
 * gate before the future RLS-activation work (2.6b).
 *   DB_PORT=5433 DB_NAME=deploy_test DB_USER=postgres DB_PASSWORD=postgres \
 *     node tests/authFlow.pg.smoke.js */
const request = require('supertest');
const { Pool } = require('pg');
const { createApp } = require('../server/app');
const passwordHasher = require('../server/security/passwordHasher');

const cfg = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5433),
  database: process.env.DB_NAME || 'deploy_test',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

const UNUM = 'u90000001';
const PASS = 'Test1234Pass!';

let pass = 0, fail = 0;
const ok = (label, cond) => { if (cond) { pass++; console.log('  PASS', label); } else { fail++; console.log('  FAIL', label); } };
const cookieFrom = (res) => {
  const sc = res.headers['set-cookie'];
  return sc ? sc.map(c => c.split(';')[0]).join('; ') : '';
};

async function run() {
  const pool = new Pool(cfg);
  // seed a clean, onboarded student
  await pool.query('DELETE FROM users WHERE student_number = $1', [UNUM]);
  const hash = await passwordHasher.hash(PASS);
  await pool.query(
    `INSERT INTO users (email, student_number, password_hash, role, first_name, last_name, is_active, must_change_password)
     VALUES ($1,$2,$3,'student','Auth','Flow', true, false)`,
    [`${UNUM}@up.ac.za`, UNUM, hash]
  );

  const app = createApp(pool, { pwaDir: null });

  console.log('[ login ]');
  const bad = await request(app).post('/api/auth/login').send({ uNumber: UNUM, password: 'wrong' });
  ok('wrong password → 401', bad.status === 401);
  const unknown = await request(app).post('/api/auth/login').send({ uNumber: 'u00000000', password: PASS });
  ok('unknown user → 401 (same body as wrong password: enumeration-safe)',
    unknown.status === 401 && unknown.body.error === bad.body.error);
  const missing = await request(app).post('/api/auth/login').send({ uNumber: UNUM });
  ok('missing password → 400', missing.status === 400);

  const good = await request(app).post('/api/auth/login').send({ uNumber: UNUM, password: PASS });
  ok('valid credentials → 200', good.status === 200);
  ok('response echoes uNumber', good.body.user && good.body.user.uNumber === UNUM);
  ok('sets a session cookie', !!good.headers['set-cookie']);
  const cookie = cookieFrom(good);

  console.log('\n[ session + protected access ]');
  const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
  ok('GET /me with cookie → 200', me.status === 200 && me.body.user.uNumber === UNUM);
  const sched = await request(app).get('/api/schedule').set('Cookie', cookie);
  ok('protected /schedule with cookie → 200', sched.status === 200);
  const noCookie = await request(app).get('/api/schedule');
  ok('protected /schedule WITHOUT cookie → 401', noCookie.status === 401);
  const meNoCookie = await request(app).get('/api/auth/me');
  ok('GET /me without cookie → 401', meNoCookie.status === 401);

  console.log('\n[ logout invalidates the session ]');
  const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
  ok('logout → 204', out.status === 204);
  const meAfter = await request(app).get('/api/auth/me').set('Cookie', cookie);
  ok('same cookie AFTER logout → 401 (session destroyed server-side)', meAfter.status === 401);
  const schedAfter = await request(app).get('/api/schedule').set('Cookie', cookie);
  ok('protected route after logout → 401', schedAfter.status === 401);

  await pool.query('DELETE FROM users WHERE student_number = $1', [UNUM]);
  await pool.end();

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
