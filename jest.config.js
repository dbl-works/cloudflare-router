/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'miniflare',
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
