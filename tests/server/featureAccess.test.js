'use strict';

const { sanitizeOverrides } = require('../../server/security/featureAccess');

describe('featureAccess — sanitizeOverrides', () => {
  test('strips unknown roles and features', () => {
    const out = sanitizeOverrides({
      student: { 'view.swaps': true, 'bogus.feature': true },
      admin: { 'view.schedule': false },
      hacker: { 'view.dashboard': false },
    });
    expect(out).toEqual({ student: { 'view.swaps': true } });
  });

  test('normalizes supervisor → team-lead', () => {
    const out = sanitizeOverrides({
      supervisor: { 'view.analytics': true },
    });
    expect(out).toEqual({ 'team-lead': { 'view.analytics': true } });
  });

  test('accepts granular schedule and students panel overrides', () => {
    const out = sanitizeOverrides({
      student: {
        'students.panel.contracts': true,
        'schedule.generate': false,
      },
      'team-lead': {
        'dashboard.pendingSwaps': true,
        'students.panel.ledger': true,
      },
    });
    expect(out.student['students.panel.contracts']).toBe(true);
    expect(out.student['schedule.generate']).toBe(false);
    expect(out['team-lead']['dashboard.pendingSwaps']).toBe(true);
  });
});
