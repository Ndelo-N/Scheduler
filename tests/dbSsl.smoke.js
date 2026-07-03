'use strict';
/* F-05 — Postgres SSL config proof. Run: node tests/dbSsl.smoke.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { dbSsl } = require('../server/database/sslConfig');

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log('  PASS', m)) : (fail++, console.log('  FAIL', m)));

// dev / non-production → SSL disabled
ok(dbSsl({ NODE_ENV: 'development' }) === false, 'development → ssl disabled (false)');
ok(dbSsl({}) === false, 'unset NODE_ENV → ssl disabled (false)');

// production, no CA → verification ON, no ca
const prod = dbSsl({ NODE_ENV: 'production' });
ok(prod && prod.rejectUnauthorized === true, 'production → rejectUnauthorized:true (MITM prevented)');
ok(prod.ca === undefined, 'production without DB_CA_CERT → no ca (uses system trust store)');

// production, with CA → verification ON + ca loaded
const caPath = path.join(os.tmpdir(), 'test-ca.pem');
fs.writeFileSync(caPath, '-----BEGIN CERTIFICATE-----\nTESTCA\n-----END CERTIFICATE-----\n');
const prodCa = dbSsl({ NODE_ENV: 'production', DB_CA_CERT: caPath });
ok(prodCa.rejectUnauthorized === true, 'production+CA → still verifies (rejectUnauthorized:true)');
ok(typeof prodCa.ca === 'string' && prodCa.ca.includes('TESTCA'), 'production+CA → CA cert loaded from DB_CA_CERT');
fs.unlinkSync(caPath);

// critical negative: never returns the old insecure shape
ok(!(prod && prod.rejectUnauthorized === false), 'never emits rejectUnauthorized:false (the F-05 vuln)');

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
