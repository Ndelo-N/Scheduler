'use strict';
/* F-14 — notification preferences persistence. Requires a live Postgres with the
 * schema loaded. Proves prefs survive a simulated server restart (fresh pool) and
 * that PUT/POST merge shallowly. Run against a STAGING db:
 *   DB_PORT=5433 DB_NAME=f14_test DB_USER=postgres node tests/notificationPrefs.pg.smoke.js */
const request = require('supertest');
const { Pool } = require('pg');
const { createApp } = require('../server/app');
const sessionStore = require('../server/security/sessionStore');

const cfg = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5433),
  database: process.env.DB_NAME || 'f14_test',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
};

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log('  PASS', m)) : (fail++, console.log('  FAIL', m)));

async function run() {
  const setupPool = new Pool(cfg);
  // clean slate + seed one user
  await setupPool.query("DELETE FROM notification_preferences");
  await setupPool.query("DELETE FROM user_sessions");
  await setupPool.query("DELETE FROM users WHERE email = 'f14@up.ac.za'");
  const uid = (await setupPool.query(
    `INSERT INTO users (email, password_hash, role, first_name, last_name, must_change_password)
     VALUES ('f14@up.ac.za','x','student','F','14', false) RETURNING id`
  )).rows[0].id;
  const { token } = await sessionStore.createSession(setupPool, uid, { ttlMs: 3600e3 });
  const cookie = `sid=${token}`;

  // ---- session 1: write prefs ----
  const pool1 = new Pool(cfg);
  const app1 = createApp(pool1, { pwaDir: null });
  await request(app1).put('/api/notifications/preferences').set('Cookie', cookie)
    .send({ email: true, sms: false });
  const g1 = await request(app1).get('/api/notifications/preferences').set('Cookie', cookie);
  ok(g1.body.email === true && g1.body.sms === false, 'prefs written and read back in same session');
  await pool1.end();

  // ---- simulate RESTART: brand-new pool/app, same DB ----
  const pool2 = new Pool(cfg);
  const app2 = createApp(pool2, { pwaDir: null });
  const g2 = await request(app2).get('/api/notifications/preferences').set('Cookie', cookie);
  ok(g2.body.email === true && g2.body.sms === false,
     'prefs SURVIVE restart (fresh pool still reads them) — the F-14 fix');

  // ---- merge semantics: add a key, existing keys preserved, overlapping key overwritten ----
  await request(app2).put('/api/notifications/preferences').set('Cookie', cookie)
    .send({ sms: true, push: true });
  const g3 = await request(app2).get('/api/notifications/preferences').set('Cookie', cookie);
  ok(g3.body.email === true, 'merge preserves untouched key (email)');
  ok(g3.body.sms === true, 'merge overwrites overlapping key (sms false→true)');
  ok(g3.body.push === true, 'merge adds new key (push)');
  await pool2.end();

  // cleanup
  await setupPool.query("DELETE FROM users WHERE id = $1", [uid]);
  await setupPool.end();

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
