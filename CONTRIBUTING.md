# Contributing to Cloudflare Router

We appreciate your feedback and contributions!

## Local Development

Ensure you use Node.js 18+.

1. Clone the repository.
2. Run `yarn install` to install dependencies.
3. Run `yarn test` to verify the codebase against the active Cloudflare Vitest pool workers (`@cloudflare/vitest-pool-workers`).
4. To build the typescript declaration and compiled JS files, run `yarn build`.

## Submitting Pull Requests

1. Create a descriptive branch branch.
2. Provide a descriptive title and fill out the provided Pull Request template.
3. Your pull request should include tests covering your new feature or bugfix.
4. Ensure the test suite passes (`yarn test`).
