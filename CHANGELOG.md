# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased]
### Changed
### Added

## [1.1.0] - 2026-04-26
### Added
- Add webmanifest, map and xml as media formats

## [1.0.0] - 2026-04-06
### Changed
- **BREAKING**: Migrated to ES Module Worker syntax instead of legacy Service Worker (`addEventListener('fetch')`). Replaced `startWorker` with `createRouter` returning standard fetch handler `{ fetch() }`.
- Upgraded tests to use Vitest (`@cloudflare/vitest-pool-workers`) alongside Node 18 requirements.
- Configured proper Typescript definition emission (`index.d.ts`).
- Switched to using `crypto.subtle.digest` for timing-safe Basic Auth credentials comparison.
- Fixed IP authentication loop fallthrough bug which incorrectly permitted unauthorized traffic if a specific IP didn't match.

## [0.4.1] - 2024-03-24
### Added
- Add pdf as media format

## [0.4.0] - 2023-11-01
### Added
- Adapt to Azure

## [0.3.0] - 2022-09-01
### Added
- Add IP based auth to allow vpn/test tool access

## [0.2.0] - 2021-10-31
### Added
- Allow endpoints to be protected with basic auth [#4](https://github.com/dbl-works/cloudflare-router/pull/4)


## [0.1.0] - 2021-10-25
### Added
- Initial boilerplate, adds capability to route endpoints to S3 buckets
