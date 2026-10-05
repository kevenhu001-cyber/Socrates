// @ts-check
/**
 * clientError — the severity policy behind /api/client-error.
 *
 * Regression coverage for a review finding: the SPA reports ~480 deliberately
 * swallowed catch sites (frontend/src/util/reportSwallow.ts), nearly all of
 * them documented best-effort/optional, and every one of them used to land on
 * the server's `console.error`. A real uncaught error was therefore
 * indistinguishable from noise.
 *
 * The three properties that must not regress:
 *   1. `recoverable` / `expected` swallow reports never reach error level.
 *   2. Unlabelled reports (the global error guard — a REAL uncaught error)
 *      still reach error level.
 *   3. An unrecognized swallow severity stays unclassified without changing
 *      the error level of reports from other kinds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIENT_ERROR_SEVERITIES,
  normalizeClientErrorSeverity,
  clientErrorLogLevel,
  clientErrorLabel,
} from '../src/middleware/clientError.ts';

test('invariant and non-swallow reports log at error level', () => {
  assert.equal(clientErrorLogLevel('swallow', 'invariant'), 'error');
  assert.equal(clientErrorLogLevel(undefined, null), 'error', 'the error guard sends no severity');
  assert.equal(clientErrorLogLevel(undefined, undefined), 'error');
  assert.equal(clientErrorLogLevel('error', 'recoverable'), 'error', 'only swallow reports can be downgraded');
});

test('best-effort and expected swallow reports never log as errors', () => {
  assert.equal(clientErrorLogLevel('swallow', 'recoverable'), 'warn');
  assert.equal(clientErrorLogLevel('swallow', 'expected'), 'warn');
});

test('an unrecognized severity leaves a swallowed report unclassified', () => {
  assert.equal(normalizeClientErrorSeverity('invariant'), 'invariant');
  for (const bogus of ['INVARIANT', ' critical ', 'error', 'fatal', '', null, undefined, 0, {}, []]) {
    assert.equal(normalizeClientErrorSeverity(bogus), null, String(bogus));
  }
  /* A malformed severity must not turn a best-effort swallowed catch into an
     error-level signal. Reports without the swallow kind still stay errors. */
  assert.equal(clientErrorLogLevel('swallow', normalizeClientErrorSeverity('nope')), 'warn');
  assert.equal(clientErrorLabel('swallow', null), 'swallow-unclassified');
  assert.equal(clientErrorLogLevel(undefined, normalizeClientErrorSeverity('nope')), 'error');
  assert.equal(clientErrorLabel(undefined, null), 'invariant-or-uncaught');
});

test('labels let an operator grep the classes apart', () => {
  assert.equal(clientErrorLabel('swallow', 'invariant'), 'invariant-or-uncaught');
  assert.equal(clientErrorLabel('swallow', 'recoverable'), 'recoverable');
  assert.equal(clientErrorLabel('swallow', 'expected'), 'suppressed-expected');
  assert.deepEqual([...CLIENT_ERROR_SEVERITIES], ['invariant', 'recoverable', 'expected']);
});

test('the frontend severity vocabulary and the server allow-list agree', async () => {
  /* A severity the client can send that the server would drop, or vice versa,
     is a silent contract break: pin both sides to the same three names. */
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/middleware/clientError.ts', import.meta.url), 'utf8');
  for (const severity of CLIENT_ERROR_SEVERITIES) {
    assert.ok(src.includes(`'${severity}'`), `clientError.ts must list ${severity}`);
  }
  const reporter = readFileSync(
    new URL('../../frontend/src/util/clientErrorReporter.ts', import.meta.url), 'utf8',
  );
  const union = reporter.match(/'expected'\s*\|\s*'recoverable'\s*\|\s*'invariant'/);
  assert.ok(union, 'clientErrorReporter.ts must declare the same three severities');
});
