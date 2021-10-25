/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  automock: false,
  setupFiles: [
    './test/setup.ts',
  ],
  coverageReporters: [
    'clover',
    'html',
    'json',
    'lcov',
    'text',
  ],
}
