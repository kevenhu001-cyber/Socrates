import test from 'node:test';
import assert from 'node:assert/strict';
import { providerErrorMessage } from '../src/chat/providerErrorMessage.ts';
import { en } from '../src/i18n/en.ts';
import { zh } from '../src/i18n/zh.ts';

test('provider cooldown is localized and rounded up without claiming availability', () => {
  const error = { status: 429, code: 'LLM_UPSTREAM_ERROR', body: { retryAfterMs: 30_001 } };
  assert.equal(providerErrorMessage(error, (key) => zh[key]), '模型繁忙，约 31 秒后可重试，也可以切换模型。');
  assert.equal(providerErrorMessage(error, (key) => en[key]), 'The model is busy. Try again in about 31s, or switch models.');
  assert.match(providerErrorMessage(error), /31s/);
});

test('local quota and malformed cooldowns retain their original error message', () => {
  const error = { message: 'Monthly quota reached', status: 429, code: 'MONTHLY_LIMIT', body: { retryAfterMs: 30_000 } };
  assert.equal(providerErrorMessage(error), error.message);
  for (const retryAfterMs of [-1, NaN, Infinity, '3000', undefined]) {
    assert.equal(providerErrorMessage({ ...error, code: 'LLM_UPSTREAM_ERROR', body: { retryAfterMs } }), error.message);
  }
});
