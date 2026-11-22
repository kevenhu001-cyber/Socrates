import assert from 'node:assert/strict';
import test from 'node:test';
import { setCurrentLanguage } from '../src/i18n/languageState.ts';

globalThis.window = {};

const { t, i18n, applyLegacyI18n, getCurrentLang } = await import('../src/ui/legacyI18n.ts');

test('t uses the legacy window.t when present and the typed table otherwise', () => {
  window.t = (key, ...args) => `${key}:${args.join('|')}`;
  assert.equal(t('greeting', 'a', 'b'), 'greeting:a|b');
  delete window.t;
  assert.equal(t('__missing_legacy_i18n_key__'), '__missing_legacy_i18n_key__');
});

test('i18n falls back only when the key is missing', () => {
  window.t = (key) => (key === 'known' ? 'Translated' : key);
  assert.equal(i18n('known', 'Fallback'), 'Translated');
  assert.equal(i18n('missing', 'Fallback'), 'Fallback');
});

test('applyLegacyI18n replays the legacy pass and swallows a failing pass', () => {
  let calls = 0;
  window.applyI18n = () => {
    calls += 1;
  };
  applyLegacyI18n();
  assert.equal(calls, 1);

  window.applyI18n = () => {
    throw new Error('boom');
  };
  assert.doesNotThrow(() => applyLegacyI18n());
});

test('getCurrentLang follows the typed language state', () => {
  setCurrentLanguage('en');
  assert.equal(getCurrentLang(), 'en');
  setCurrentLanguage('zh');
  assert.equal(getCurrentLang(), 'zh');
});
