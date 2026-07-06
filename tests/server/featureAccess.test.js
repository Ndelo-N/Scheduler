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

  test('rejects non-boolean values', () => {
    const out = sanitizeOverrides({
      student: { 'view.dashboard': 'yes' },
    });
    expect(out).toEqual({});
  });
});
