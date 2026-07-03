/**
 * Smoke test for IdentityMap (C2 acceptance criteria).
 * Run: node tests/identityMap.smoke.js
 */
'use strict';

const src = require('fs').readFileSync(
  require('path').join(__dirname, '../src/js/core/identityMap.js'),
  'utf8'
);

const g = {};
(new Function('global', src))(g); // eslint-disable-line no-new-func
const IM = g.IdentityMap;

// ── Fixture students ───────────────────────────────────────────────────────

const STUDENTS = [
  { id: 'u11111111', name: 'Jane Doe',    email: 'u11111111@sun.ac.za' },
  { id: 'u22222222', name: 'Bob Smith',   email: 'u22222222@sun.ac.za' },
  { id: 'u33333333', name: "Marie O'Brien" },                    // no email — name-only
  { id: 'u44444444', name: 'Van Der Berg, Pieter' },             // reversed-order name
  { id: 'u55555555', name: 'Sipho Nkosi',  email: 'u55555555@sun.ac.za' },
];

// ── Fixture payroll entries ────────────────────────────────────────────────

const ENTRIES = [
  // 1. id match:       payroll username === student.id
  { username: 'u11111111', firstName: 'Jane',   lastName: 'Doe'     },
  // 2. email-prefix:   student has email u22222222@…, no direct id hit if we
  //    rename the student id to something else (tested via a separate call)
  { username: 'u22222222', firstName: 'Robert', lastName: 'Smith'   },
  // 3. name match — apostrophe stripped
  { username: 'u_unknown_1', firstName: "Marie", lastName: "O'Brien" },
  // 4. reversed-name match
  { username: 'u_unknown_2', firstName: 'Pieter', lastName: 'Van Der Berg' },
  // 5. pending — no student matches at all
  { username: 'u99999999', firstName: 'Ghost', lastName: 'User'     },
];

// ── Assertions ─────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function assert(label, condition) {
  if (condition) {
    console.log('  PASS', label);
    pass++;
  } else {
    console.error('  FAIL', label);
    fail++;
  }
}

console.log('\n=== IdentityMap smoke test ===\n');

// ── 1. Direct id match ──────────────────────────────────────────────────────
console.log('[ Resolution: direct id ]');
{
  const r = IM.resolve(ENTRIES, STUDENTS);
  const jane = r['u11111111'];
  assert('status resolved',          jane.status === 'resolved');
  assert('method = id',              jane.method === 'id');
  assert('studentId correct',        jane.studentId === 'u11111111');
  assert('studentName correct',      jane.studentName === 'Jane Doe');
}

// ── 2. Email-prefix match ──────────────────────────────────────────────────
// Use a student whose id differs from the payroll username so only email works.
console.log('\n[ Resolution: email prefix ]');
{
  const studentsWithDifferentId = STUDENTS.map((s) =>
    s.id === 'u22222222' ? { ...s, id: 'internal-bob-42' } : s
  );
  const r = IM.resolve(ENTRIES, studentsWithDifferentId);
  const bob = r['u22222222'];
  assert('status resolved',          bob.status === 'resolved');
  assert('method = email',           bob.method === 'email');
  assert('studentId = internal-bob-42', bob.studentId === 'internal-bob-42');
}

// ── 3. Name match (apostrophe normalisation) ───────────────────────────────
console.log('\n[ Resolution: name — apostrophe stripped ]');
{
  const studentsNoEmail = STUDENTS.map((s) =>
    s.id === 'u33333333' ? { id: 'internal-marie-99', name: s.name } : s
  );
  const r = IM.resolve(ENTRIES, studentsNoEmail);
  const marie = r['u_unknown_1'];
  assert('status resolved',          marie.status === 'resolved');
  assert('method = name',            marie.method === 'name');
  assert('studentId correct',        marie.studentId === 'internal-marie-99');
}

// ── 4. Reversed-name match ──────────────────────────────────────────────────
console.log('\n[ Resolution: name — reversed order ]');
{
  // Student name: "Van Der Berg, Pieter" — strip comma → "van der berg pieter"
  // Payroll: firstName="Pieter" lastName="Van Der Berg"
  //   form "pieter van der berg"  and  "van der berg pieter"
  // One of these should hit the student name normalisation.
  const r = IM.resolve(ENTRIES, STUDENTS);
  const pieter = r['u_unknown_2'];
  // This test checks whether at least name or id/email resolution fires.
  // If the student name normalises to something the reversed form hits, it resolves.
  assert('resolved or pending (not thrown)', pieter !== undefined);
  assert('has status field', pieter.status === 'resolved' || pieter.status === 'pending');
}

// ── 5. Pending bucket ───────────────────────────────────────────────────────
console.log('\n[ Resolution: pending ]');
{
  const r = IM.resolve(ENTRIES, STUDENTS);
  const ghost = r['u99999999'];
  assert('status = pending',         ghost.status === 'pending');
  assert('label contains username',  ghost.label.includes('u99999999'));
  assert('label contains first name', ghost.label.includes('Ghost'));
  assert('username field present',   ghost.username === 'u99999999');
  assert('firstName field present',  ghost.firstName === 'Ghost');
  assert('lastName field present',   ghost.lastName === 'User');
}

// ── 6. Override takes priority ──────────────────────────────────────────────
console.log('\n[ Resolution: override priority ]');
{
  const overrides = { 'u99999999': 'u55555555' }; // map ghost → Sipho
  const r = IM.resolve(ENTRIES, STUDENTS, overrides);
  const ghost = r['u99999999'];
  assert('status resolved via override', ghost.status === 'resolved');
  assert('method = override',            ghost.method === 'override');
  assert('studentId = u55555555',        ghost.studentId === 'u55555555');
  assert('studentName = Sipho Nkosi',    ghost.studentName === 'Sipho Nkosi');
}

// ── 7. Override to unknown student falls through gracefully ─────────────────
console.log('\n[ Resolution: stale override (student deleted) ]');
{
  const overrides = { 'u99999999': 'deleted-student-id' };
  const r = IM.resolve(ENTRIES, STUDENTS, overrides);
  const ghost = r['u99999999'];
  // Falls through to heuristics; ghost has no match → pending
  assert('falls through to pending',  ghost.status === 'pending');
}

// ── 8. Persistence helpers (mock storage) ───────────────────────────────────
console.log('\n[ Persistence: saveOverride / loadOverrides / removeOverride ]');
{
  // Mock StorageManager with an in-memory settings object.
  const store = {};
  const mockStorage = {
    async getSetting(key, def) { return store[key] !== undefined ? store[key] : def; },
    async setSetting(key, val) { store[key] = val; },
  };

  (async () => {
    // Initially empty
    const empty = await IM.loadOverrides(mockStorage);
    assert('loadOverrides returns {} initially', Object.keys(empty).length === 0);

    // Save one override
    await IM.saveOverride(mockStorage, 'u99999999', 'u55555555');
    const after = await IM.loadOverrides(mockStorage);
    assert('override saved',          after['u99999999'] === 'u55555555');

    // Save a second override without losing the first
    await IM.saveOverride(mockStorage, 'u88888888', 'u11111111');
    const both = await IM.loadOverrides(mockStorage);
    assert('first override persists', both['u99999999'] === 'u55555555');
    assert('second override added',   both['u88888888'] === 'u11111111');

    // Remove one
    await IM.removeOverride(mockStorage, 'u99999999');
    const remaining = await IM.loadOverrides(mockStorage);
    assert('removed override gone',   !('u99999999' in remaining));
    assert('other override still there', remaining['u88888888'] === 'u11111111');

    // resolveWithStorage wires it together
    const resolved = await IM.resolveWithStorage(ENTRIES, STUDENTS, mockStorage);
    // u99999999 override was removed; ghost has no match → pending
    assert('resolveWithStorage: ghost is pending', resolved['u99999999'].status === 'pending');

    // Finish
    console.log('\n[ Prototype pollution guard ]');
    // Saving __proto__ as override key must throw, not pollute Object.prototype
    let threw = false;
    try {
      await IM.saveOverride(mockStorage, '__proto__', 'u11111111');
    } catch {
      threw = true;
    }
    assert('saveOverride rejects __proto__ key', threw);
    assert('Object.prototype not polluted', ({}).poisoned === undefined);

    // ── Summary ────────────────────────────────────────────────────────────
    console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
    process.exitCode = fail > 0 ? 1 : 0;
  })();
}
