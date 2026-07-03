/**
 * IdentityMap  —  window.IdentityMap
 *
 * Maps VeraLab payroll usernames to scheduler student records.
 *
 * Resolution priority (per prelude.md §0):
 *   1. Admin override table (persisted in the `settings` IndexedDB store)
 *   2. Direct u-number / id match   (payroll Username === student.id)
 *   3. Email-prefix match           (student.email prefix === payroll Username)
 *   4. Normalised full-name match   ("First Last" or "Last First")
 *   5. Pending bucket               (never silently drop an unresolved entry)
 *
 * Public API
 * ──────────
 *   resolve(entries, students [, overrides])  → { [username]: Resolution }
 *     Pure/sync.  `overrides` default {}; pre-load with loadOverrides().
 *
 *   loadOverrides(storage)                    → Promise<OverrideTable>
 *   saveOverride(storage, username, studentId) → Promise<void>
 *   removeOverride(storage, username)          → Promise<void>
 *   resolveWithStorage(entries, students, storage) → Promise<ResolutionMap>
 *     Async convenience: loads overrides then calls resolve().
 *
 * Resolution shape
 * ────────────────
 *   Resolved: { status:'resolved', studentId, studentName, method }
 *     method ∈ 'override' | 'id' | 'email' | 'name'
 *
 *   Pending:  { status:'pending', label, username, firstName, lastName }
 *     label — human-readable "First Last (uXXXXXXXX)" for UI display
 *
 * Canonical spec: Documentation/prelude.md §0
 * Prompt:         Cursor_Prompts_WorkedHours_Integration.md — C2
 */
(function (global) {
  'use strict';

  // ─── Settings key ──────────────────────────────────────────────────────────

  /** Key used in the `settings` IndexedDB store for the override table. */
  const OVERRIDES_KEY = 'identityMapOverrides';

  // ─── Name normalisation ────────────────────────────────────────────────────

  /**
   * Normalise a name string for fuzzy matching:
   *   - lower-case
   *   - collapse / trim whitespace
   *   - strip non-alphanumeric characters (hyphens, apostrophes, dots, etc.)
   *
   * "O'Brien" → "obrien", "van Der Berg" → "van der berg"
   */
  function normalizeName(s) {
    return String(s ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Return both "firstname lastname" and "lastname firstname" normal forms for
   * a payroll entry so that name order differences are tolerated.
   */
  function payrollNameForms(firstName, lastName) {
    const first = normalizeName(firstName);
    const last = normalizeName(lastName);
    const forms = new Set();
    if (first || last) {
      if (first && last) {
        forms.add(`${first} ${last}`);
        forms.add(`${last} ${first}`);
      } else {
        forms.add(first || last);
      }
    }
    return forms;
  }

  // ─── Student index ─────────────────────────────────────────────────────────

  /**
   * Build three lookup maps from the students array for O(1) resolution.
   *
   *   byId          lower-cased student.id            → student
   *   byEmailPrefix lower-cased email prefix           → student
   *   byName        normalised full name (and reverse) → student
   *
   * Collisions in byName are intentional last-write-wins; the id/email paths
   * are unambiguous and take priority (checked first in resolve()).
   */
  function buildStudentIndex(students) {
    const byId = Object.create(null);
    const byEmailPrefix = Object.create(null);
    const byName = Object.create(null);
    const ambiguousNames = new Set(); // F-10: normalized names claimed by >1 distinct student

    /** Record a name→student mapping, marking the form ambiguous on a real conflict. */
    function addName(form, student) {
      if (!form) return;
      const existing = byName[form];
      if (existing && String(existing.id ?? '') !== String(student.id ?? '')) {
        ambiguousNames.add(form); // two different students share this normalized form
      } else if (!existing) {
        byName[form] = student;
      }
    }

    for (const student of students) {
      const sid = String(student.id ?? '');

      // ── id map ─────────────────────────────────────────────────────────────
      if (sid) {
        byId[sid.toLowerCase()] = student;
      }

      // ── email-prefix map ───────────────────────────────────────────────────
      const email = String(student.email ?? '').trim();
      if (email) {
        const prefix = email.split('@')[0].toLowerCase();
        if (prefix) byEmailPrefix[prefix] = student;
      }

      // ── name map ───────────────────────────────────────────────────────────
      const norm = normalizeName(student.name);
      if (norm) {
        addName(norm, student);
        // Attempt reversed order (Last First) for students whose name is
        // stored as "Surname, Firstname" or who the payroll lists differently.
        const parts = norm.split(' ');
        if (parts.length >= 2) {
          const reversed = parts.slice(1).join(' ') + ' ' + parts[0];
          addName(reversed, student);
        }
      }
    }

    return { byId, byEmailPrefix, byName, ambiguousNames };
  }

  // ─── Core resolution ───────────────────────────────────────────────────────

  /**
   * resolve(entries, students [, overrides]) → ResolutionMap
   *
   * Pure, synchronous.  Each *unique* payroll username in `entries` gets
   * exactly one resolution record in the returned object.
   *
   * Downstream consumers (WorkedHoursNormalizer, Reconcile) look up a session
   * as: `resolutions[entry.username]`.
   *
   * @param {object[]} entries   PayrollParser output entries.
   * @param {object[]} students  Scheduler student objects (id, name, email?).
   * @param {object}   [overrides={}]  { [payrollUsername]: studentId }
   *                   Pre-loaded from loadOverrides(); defaults to empty.
   * @returns {{ [username: string]: ResolvedRecord | PendingRecord }}
   */
  function resolve(entries, students, overrides) {
    const ov = (overrides != null && typeof overrides === 'object') ? overrides : {};
    const idx = buildStudentIndex(students);

    // Build a map of studentId → student for override lookups.
    const studentById = Object.create(null);
    for (const s of students) {
      const sid = String(s.id ?? '');
      if (sid) studentById[sid] = s;
    }

    // Collect unique (username, firstName, lastName) from entries.
    // Last-seen name wins; consistent because PayrollParser output is sorted.
    const seenUsernames = Object.create(null); // username → { firstName, lastName }
    for (const e of entries) {
      const u = String(e.username ?? '').trim();
      if (!u) continue;
      seenUsernames[u] = { firstName: e.firstName, lastName: e.lastName };
    }

    const result = Object.create(null);

    for (const username of Object.keys(seenUsernames)) {
      const { firstName, lastName } = seenUsernames[username];
      const uLower = username.toLowerCase();
      let matched = null;
      let method = null;

      // ── 1. Override table ────────────────────────────────────────────────
      if (Object.prototype.hasOwnProperty.call(ov, username)) {
        const overriddenId = ov[username];
        const overriddenStudent = studentById[overriddenId];
        if (overriddenStudent) {
          matched = overriddenStudent;
          method = 'override';
        }
        // If override points to a non-existent student, fall through to
        // heuristics rather than silently producing a bad resolution.
      }

      // ── 2. Direct id match ───────────────────────────────────────────────
      if (!matched && Object.prototype.hasOwnProperty.call(idx.byId, uLower)) {
        matched = idx.byId[uLower];
        method = 'id';
      }

      // ── 3. Email-prefix match ────────────────────────────────────────────
      if (!matched && Object.prototype.hasOwnProperty.call(idx.byEmailPrefix, uLower)) {
        matched = idx.byEmailPrefix[uLower];
        method = 'email';
      }

      // ── 4. Normalised full-name match ────────────────────────────────────
      if (!matched) {
        for (const form of payrollNameForms(firstName, lastName)) {
          // F-10: a normalized name shared by >1 distinct student is ambiguous;
          // do NOT auto-resolve it (silent mis-attribution). Fall through to the
          // pending bucket so an admin can map it explicitly via an override.
          if (idx.ambiguousNames.has(form)) continue;
          if (Object.prototype.hasOwnProperty.call(idx.byName, form)) {
            matched = idx.byName[form];
            method = 'name';
            break;
          }
        }
      }

      // ── 5. Pending ───────────────────────────────────────────────────────
      if (matched) {
        result[username] = {
          status: 'resolved',
          studentId: String(matched.id ?? ''),
          studentName: matched.name || '',
          method,
        };
      } else {
        const namePart = [firstName, lastName].filter(Boolean).join(' ').trim();
        const label = namePart ? `${namePart} (${username})` : username;
        result[username] = {
          status: 'pending',
          label,
          username,
          firstName,
          lastName,
        };
      }
    }

    return result;
  }

  // ─── Persistence helpers ───────────────────────────────────────────────────

  /**
   * Load the override table from IndexedDB settings store.
   * Returns {} if no overrides have been saved or storage is unavailable.
   *
   * @param {StorageManager} storage  window.StorageManager instance.
   * @returns {Promise<object>}  { [payrollUsername]: studentId }
   */
  async function loadOverrides(storage) {
    if (!storage || typeof storage.getSetting !== 'function') return {};
    try {
      const val = await storage.getSetting(OVERRIDES_KEY, {});
      // Guard: must be a plain object, never null/array/primitive.
      return val && typeof val === 'object' && !Array.isArray(val) ? val : {};
    } catch {
      return {};
    }
  }

  /**
   * Persist a single override entry.  Merges with the existing table so that
   * saving one override never erases others.
   *
   * @param {StorageManager} storage
   * @param {string} payrollUsername  e.g. "u21494534"
   * @param {string} studentId        The scheduler student id to map to.
   */
  async function saveOverride(storage, payrollUsername, studentId) {
    if (!storage || typeof storage.setSetting !== 'function') {
      throw new Error('IdentityMap.saveOverride: storage not available');
    }
    const current = await loadOverrides(storage);
    // Prototype-pollution guard: validate the key is a non-prototype property name.
    if (
      payrollUsername === '__proto__' ||
      payrollUsername === 'constructor' ||
      payrollUsername === 'prototype'
    ) {
      throw new Error(`IdentityMap.saveOverride: invalid username "${payrollUsername}"`);
    }
    const updated = Object.assign(Object.create(null), current, {
      [payrollUsername]: String(studentId),
    });
    // Convert to plain object before storing (Object.create(null) is not JSON-safe
    // for all engines — serialise as a regular object).
    await storage.setSetting(OVERRIDES_KEY, Object.assign({}, updated));
  }

  /**
   * Remove a single override entry.
   *
   * @param {StorageManager} storage
   * @param {string} payrollUsername
   */
  async function removeOverride(storage, payrollUsername) {
    if (!storage || typeof storage.setSetting !== 'function') {
      throw new Error('IdentityMap.removeOverride: storage not available');
    }
    const current = await loadOverrides(storage);
    const updated = Object.assign({}, current);
    delete updated[payrollUsername];
    await storage.setSetting(OVERRIDES_KEY, updated);
  }

  /**
   * Async convenience: loads overrides from storage then resolves.
   * Use this in the browser pipeline; use resolve() directly in Node tests.
   *
   * @param {object[]} entries
   * @param {object[]} students
   * @param {StorageManager} storage
   * @returns {Promise<object>} ResolutionMap
   */
  async function resolveWithStorage(entries, students, storage) {
    const overrides = await loadOverrides(storage);
    return resolve(entries, students, overrides);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** @namespace window.IdentityMap */
  global.IdentityMap = Object.freeze({
    resolve,
    loadOverrides,
    saveOverride,
    removeOverride,
    resolveWithStorage,
  });

})(typeof window !== 'undefined' ? window : /* Node harness */ global);
