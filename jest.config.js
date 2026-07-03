/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/server/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/July2026/'],
  testTimeout: 15000,
};
