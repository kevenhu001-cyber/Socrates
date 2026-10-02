/**
 * node:test adapter for jest.
 *
 * packages/core test files import { test, describe } from 'node:test' because
 * the `shared` CI job runs them under `node --test`. When the mobile jest
 * suite picks them up (roots includes ../packages/core/src), real node:test
 * calls register with the wrong runner: the file "passes" on its own and jest
 * fails the suite with "must contain at least one test". Mapping `node:test`
 * here rebinds the calls onto jest's globals instead.
 */
module.exports = {
  describe: globalThis.describe,
  it: globalThis.it,
  test: globalThis.test,
};
