import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ERROR_COPY,
  localizeErrorCode,
  localeFromAcceptLanguage,
  normalizeLocale,
  resolveErrorLocale,
  upstreamFailureMessage,
} from '../src/lib/errorMessages.ts';
import { ApiError, BadRequest, NotFound } from '../src/lib/errors.ts';
import { buildSseErrorFrame } from '../src/lib/sseErrorFrame.ts';

/**
 * The server used to answer every failure in English while the SPA ships a
 * Chinese interface. These tests pin the rules that make the localized copy
 * safe: the machine contract never changes, only generic copy is
 * translated, and a sentence the server composed itself is left alone.
 */

test('the explicit locale header wins over Accept-Language', () => {
  assert.equal(resolveErrorLocale({ 'x-socrates-locale': 'zh', 'accept-language': 'en-US,en;q=0.9' }), 'zh');
  assert.equal(resolveErrorLocale({ 'x-socrates-locale': 'en', 'accept-language': 'zh-CN,zh;q=0.9' }), 'en');
  assert.equal(resolveErrorLocale({ 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' }), 'zh');
  assert.equal(resolveErrorLocale({ 'accept-language': 'en-GB' }), 'en');
  /* Unknown clients keep the English default. */
  assert.equal(resolveErrorLocale({}), 'en');
  assert.equal(resolveErrorLocale({ 'accept-language': 'fr-FR' }), 'en');
});

test('locale tags normalise to the two supported locales', () => {
  assert.equal(normalizeLocale('zh'), 'zh');
  assert.equal(normalizeLocale('zh-CN'), 'zh');
  assert.equal(normalizeLocale('zh-Hans'), 'zh');
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale('fr'), null);
  assert.equal(normalizeLocale(''), null);
  assert.equal(normalizeLocale(undefined), null);
});

test('Accept-Language honours quality values', () => {
  assert.equal(localeFromAcceptLanguage('en;q=0.5,zh;q=0.9'), 'zh');
  assert.equal(localeFromAcceptLanguage('fr,zh;q=0.1'), 'zh');
  assert.equal(localeFromAcceptLanguage('fr,de'), null);
});

test('generic copy is translated and the machine contract is untouched', () => {
  const en = localizeErrorCode('BAD_REQUEST', 'en', 'Bad request');
  const zh = localizeErrorCode('BAD_REQUEST', 'zh', 'Bad request');
  assert.equal(en, 'Bad request');
  assert.equal(zh, ERROR_COPY.BAD_REQUEST.zh);
  assert.notEqual(zh, en);
});

test('a sentence the server composed is never translated', () => {
  /* The limit message names the user's plan — translating it would mean
     inventing content the server never wrote. */
  const custom = 'API key limit reached for diophantus plan (2 keys). Upgrade your plan to add more.';
  assert.equal(localizeErrorCode('FORBIDDEN', 'zh', custom), custom);
});

test('a code with no catalog entry is returned untouched', () => {
  assert.equal(localizeErrorCode('SOMETHING_NEW', 'zh', 'Original text'), 'Original text');
});

test('the upstream failure sentence interpolates the status in both locales', () => {
  const en = upstreamFailureMessage(503, 'en');
  const zh = upstreamFailureMessage(503, 'zh');
  assert.match(en, /503/);
  assert.match(zh, /503/);
  assert.notEqual(en, zh);
});

test('the SSE error frame renders the curated message in the request locale', () => {
  const error = new BadRequest();
  const en = buildSseErrorFrame(error);
  const zh = buildSseErrorFrame(error, { locale: 'zh' });
  assert.equal(en.message, 'Bad request');
  assert.equal(zh.message, ERROR_COPY.BAD_REQUEST.zh);
  /* The machine contract does not move with the language. */
  assert.equal(en.code, zh.code);
  assert.equal(en.status, zh.status);
});

test('the SSE error frame keeps a curated custom message', () => {
  const error = new ApiError(403, 'FORBIDDEN', 'Your plan does not allow this model.');
  const frame = buildSseErrorFrame(error, { locale: 'zh' });
  assert.equal(frame.message, 'Your plan does not allow this model.');
});

test('an upstream failure frame carries the localized sentence and the same code', () => {
  const error = Object.assign(new Error('provider said no'), { status: 502 });
  const frame = buildSseErrorFrame(error, { locale: 'zh' });
  assert.equal(frame.code, 'INTERNAL');
  assert.equal(frame.status, 502);
  assert.match(frame.message, /502/);
  assert.doesNotMatch(frame.message, /provider said no/);
});

test('the not-found default keeps its English sentence and gains a Chinese one', () => {
  assert.equal(localizeErrorCode('ENDPOINT_NOT_FOUND', 'en', 'Endpoint not found'), 'Endpoint not found');
  assert.equal(localizeErrorCode('ENDPOINT_NOT_FOUND', 'zh', 'Endpoint not found'), ERROR_COPY.ENDPOINT_NOT_FOUND.zh);
  assert.equal(new NotFound().message, 'Not found');
});
