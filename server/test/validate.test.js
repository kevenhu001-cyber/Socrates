// @ts-check
/**
 * Unit tests for src/lib/validate.js — UUID guards used by every
 * route that takes an :id parameter. A missing guard turns a
 * malformed id into a 500 (Postgres `invalid input syntax for
 * type uuid`) instead of a clean 400.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isUuid } from '../src/lib/validate.js';

describe('isUuid', () => {
  test('accepts a valid v4 UUID', () => {
    assert.equal(isUuid('b749937d-7ff1-4999-8752-cf043f5c3c3a'), true);
  });

  test('accepts a v4 UUID with upper-case hex', () => {
    assert.equal(isUuid('B749937D-7FF1-4999-8752-CF043F5C3C3A'), true);
  });

  test('accepts a v4 UUID with mixed-case hex', () => {
    assert.equal(isUuid('b749937D-7FF1-4999-8752-cf043f5C3c3a'), true);
  });

  test('rejects the SPA-style id (msg-<uuid>)', () => {
    // This is the exact bug the original check was written to fix.
    assert.equal(isUuid('msg-b749937d-7ff1-4999-8752-cf043f5c3c3a'), false);
  });

  test('rejects a short non-UUID (mq61wc16-ayb8j6)', () => {
    assert.equal(isUuid('mq61wc16-ayb8j6'), false);
  });

  test('rejects an empty string', () => {
    assert.equal(isUuid(''), false);
  });

  test('rejects null / undefined / non-string', () => {
    assert.equal(isUuid(null), false);
    assert.equal(isUuid(undefined), false);
    assert.equal(isUuid(123), false);
    assert.equal(isUuid({}), false);
  });

  test('rejects a UUID with the wrong segment lengths', () => {
    assert.equal(isUuid('b749937d-7ff1-4999-752-cf043f5c3c3a'), false); // 3-char segment
    assert.equal(isUuid('b749937d-7ff1-49999-8752-cf043f5c3c3a'), false); // 5-char segment
  });
});
