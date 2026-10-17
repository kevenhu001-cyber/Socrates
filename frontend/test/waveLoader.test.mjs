import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const { resultHosts } = await import('../src/ui/toolPresentationModel.ts');

const CSS_PATH = fileURLToPath(new URL('../src/styles/components/wave.css', import.meta.url));

/* P_tool-hosts — a settled search row names the domains it actually read.
   The headline ("已搜索「x」") says what was asked; the host chips say where
   the answer came from, which is the part a reader wants to check. These
   lock the counting rule: hosts, not results, and never more than two. */
test('provenance counts distinct hosts, not results', () => {
  const twoResultsOneHost = {
    name: 'web_search',
    input: { query: 'gdp' },
    results: [
      { url: 'https://www.stats.gov.cn/a' },
      { url: 'https://stats.gov.cn/b' },
    ],
  };
  /* Two results from one domain is one site the answer leaned on. */
  assert.deepEqual(resultHosts(twoResultsOneHost), ['stats.gov.cn']);

  const twoHosts = {
    name: 'web_search',
    input: { query: 'gdp' },
    results: [
      { url: 'https://www.stats.gov.cn/a' },
      { url: 'https://example.com/b' },
    ],
  };
  assert.deepEqual(resultHosts(twoHosts), ['stats.gov.cn', 'example.com']);
});

test('provenance caps at two hosts and drops unusable rows', () => {
  const many = {
    name: 'web_search',
    results: [
      { url: 'https://a.com/1' },
      { url: 'https://b.com/2' },
      { url: 'https://c.com/3' },
    ],
  };
  /* One or two hosts is a fact; five is a list, and the sources section
     already holds the full set. */
  assert.deepEqual(resultHosts(many), ['a.com', 'b.com']);

  assert.deepEqual(resultHosts({ name: 'web_search', results: [] }), []);
  assert.deepEqual(resultHosts({ name: 'web_search' }), []);
  assert.deepEqual(resultHosts(null), []);
  /* A result with no url is not a source; naming one would be a lie. */
  assert.deepEqual(resultHosts({ name: 'web_search', results: [{ title: 'x' }] }), []);
});

/* P_wave — the wave is the app's single loading language. Two invariants
   are load-bearing and easy to break in review, so they are asserted here
   against the actual stylesheet rather than a copy of it. */
test('wave stylesheet animates on one keyframe with per-bar stagger data', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  /* One keyframe for every bar: the stagger is per-bar data
     (--ui-wave-delay), so a rule per bar would be the regression. */
  const keyframes = css.match(/@keyframes\s+wave-bar-swell/g) || [];
  assert.equal(keyframes.length, 1);
  assert.match(css, /\.wave-bar\s*\{[^}]*animation:\s*wave-bar-swell/);
  /* The delay is read from a custom property, never hard-coded per bar. */
  assert.match(css, /animation-delay:\s*var\(--ui-wave-delay/);
  /* Colour is inherited, so a wave in an error row tints without extra rules. */
  assert.match(css, /background:\s*currentColor/);
  /* Only scaleY animates, so a bar never changes width and the row that
     hosts it cannot reflow mid-animation. */
  assert.ok(!/scaleX/.test(css), 'bars must not animate scaleX (it would change width)');
});

test('wave honours reduced motion and raises no literal z-index', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.ok(
    !/z-index:\s*\d/.test(css),
    'wave.css must not raise a literal z-index (the --ui-z-* ratchet forbids it)',
  );
});
