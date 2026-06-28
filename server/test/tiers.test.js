// @ts-check
/**
 * Unit tests for src/lib/tiers.js — the per-tier limits (session
 * count, API key count, monthly token quota). These are referenced
 * by /api/chat, /api/sessions, /api/api-key, and /api/account/usage,
 * so a regression in any value affects multiple endpoints.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  TIERS, DEFAULT_TIER,
  getTierPlan, getBeagleQuota, getSessionLimit, getApiKeyLimit,
} from '../src/lib/tiers.js';

describe('tiers: known tiers', () => {
  test('diophantus is the default', () => {
    assert.equal(DEFAULT_TIER, 'diophantus');
  });

  test('diophantus is the free tier (rank 0, no price)', () => {
    const p = getTierPlan('diophantus');
    assert.equal(p.rank, 0);
    assert.equal(p.price, 0);
    assert.equal(p.maxSessions, 5);
    assert.equal(p.maxKeys, 2);
    assert.equal(p.beagleTokenQuota, 1_000_000);
  });

  test('euclid is unlimited (maxSessions = 0 sentinel)', () => {
    const p = getTierPlan('euclid');
    assert.equal(p.rank, 3);
    assert.equal(p.maxSessions, 0);
  });
});

describe('tiers: unknown tier falls back to default', () => {
  test('getTierPlan returns the default for an unknown key', () => {
    assert.deepEqual(getTierPlan('not-a-tier'), getTierPlan(DEFAULT_TIER));
  });

  test('getTierPlan returns the default for null / undefined', () => {
    assert.deepEqual(getTierPlan(null), getTierPlan(DEFAULT_TIER));
    assert.deepEqual(getTierPlan(undefined), getTierPlan(DEFAULT_TIER));
  });

  test('all helpers agree on the default', () => {
    const def = getTierPlan(DEFAULT_TIER);
    assert.equal(getBeagleQuota(null), def.beagleTokenQuota);
    assert.equal(getSessionLimit(null), def.maxSessions);
    assert.equal(getApiKeyLimit(null), def.maxKeys);
  });
});

describe('tiers: monotonic ordering', () => {
  test('rank is non-decreasing across the four named tiers', () => {
    const order = ['diophantus', 'riemann', 'descartes', 'euclid'];
    let prev = -1;
    for (const k of order) {
      const r = getTierPlan(k).rank;
      assert.ok(r > prev, `expected rank(${k}) > ${prev}, got ${r}`);
      prev = r;
    }
  });
});
