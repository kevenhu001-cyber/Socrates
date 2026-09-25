// @ts-check
/**
 * csp — regression tests for the Content-Security-Policy single source of
 * truth (`scripts/gen-csp-hashes.mjs`).
 *
 * These lock two defects found by the 2026-09-25 review:
 *
 *   1. `script-src` inline hashes were hand-copied into app.ts and had
 *      drifted: frontend/index.html carried two inline scripts while the
 *      array pinned one stale hash matching neither, so both scripts were
 *      refused wherever Express served the bundle. The test recomputes the
 *      hashes from index.html independently of the generator, so a bug in
 *      the generator cannot make this pass.
 *
 *   2. The allow-list still granted cdn.jsdelivr.net script execution and
 *      Google Fonts style/font loading long after P_perf-self-host removed
 *      every consumer — i.e. a third-party script-execution surface for a
 *      dependency that no longer existed. The test asserts those hosts stay
 *      out of both emitted artifacts.
 *
 * No DB and no app boot: these read the repo, so they run everywhere.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { CSP_INLINE_SCRIPT_HASHES } from '../src/generated/cspInlineHashes.js';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const INDEX_HTML = readFileSync(`${REPO}frontend/index.html`, 'utf8');
const NGINX_CONF = readFileSync(`${REPO}ops/nginx/csp-spa.conf`, 'utf8');

/** Recompute expected hashes from index.html, independent of the generator. */
function inlineScriptHashes(html) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  return [...html.matchAll(re)].map(
    (m) => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`,
  );
}

/* Hosts that were allow-listed after their last consumer was removed.
 * Re-adding any of them requires naming the consumer in the generator's
 * DIRECTIVES comment — and updating this list deliberately. */
const RETIRED_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

describe('csp: inline script hashes', () => {
  test('index.html still has inline scripts to hash', () => {
    const expected = inlineScriptHashes(INDEX_HTML);
    assert.ok(
      expected.length > 0,
      'no inline <script> found in index.html — if the pre-paint scripts were ' +
      'extracted to modules, drop the hashes and relax this test deliberately',
    );
  });

  test('generated hashes match index.html exactly', () => {
    assert.deepEqual(
      [...CSP_INLINE_SCRIPT_HASHES],
      inlineScriptHashes(INDEX_HTML),
      'CSP hashes are stale — run: node scripts/gen-csp-hashes.mjs --update',
    );
  });

  test('every inline script is covered (the historical drift)', () => {
    const expected = inlineScriptHashes(INDEX_HTML);
    for (const hash of expected) {
      assert.ok(
        CSP_INLINE_SCRIPT_HASHES.includes(hash),
        `inline script ${hash} is not in script-src; the browser would refuse it`,
      );
    }
  });

  test('hashes are well-formed CSP source expressions', () => {
    for (const hash of CSP_INLINE_SCRIPT_HASHES) {
      assert.match(hash, /^'sha256-[A-Za-z0-9+/]{43}='$/, `malformed CSP hash: ${hash}`);
    }
  });
});

describe('csp: nginx SPA policy', () => {
  test('emits a Content-Security-Policy header', () => {
    assert.match(NGINX_CONF, /add_header Content-Security-Policy "/);
    assert.match(NGINX_CONF, /" always;/);
  });

  test('agrees with the Express policy on the inline-script mechanism', () => {
    /* Both artifacts come from the same generator, so they must make the same
       choice. If nginx uses hashes, every hash must be present; if it uses
       'unsafe-inline', none may be (see the coexistence test below). */
    const scriptSrc = /script-src ([^;"]+)/.exec(NGINX_CONF)?.[1] ?? '';
    if (scriptSrc.includes("'unsafe-inline'")) {
      for (const hash of CSP_INLINE_SCRIPT_HASHES) {
        assert.ok(!scriptSrc.includes(hash),
          `${hash} appears alongside 'unsafe-inline', which disables it`);
      }
    } else {
      for (const hash of CSP_INLINE_SCRIPT_HASHES) {
        assert.ok(scriptSrc.includes(hash),
          `nginx policy is missing ${hash}; the SPA document would refuse its own boot script`);
      }
    }
  });

  test('keeps the hardening directives that a <meta> CSP cannot express', () => {
    for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"]) {
      assert.ok(NGINX_CONF.includes(directive), `nginx policy lost: ${directive}`);
    }
  });

  test("never ships 'unsafe-eval'", () => {
    const scriptSrc = /script-src ([^;"]+)/.exec(NGINX_CONF)?.[1] ?? '';
    assert.ok(scriptSrc.length > 0, 'no script-src directive found');
    assert.ok(
      !scriptSrc.includes("'unsafe-eval'"),
      "script-src must not ship 'unsafe-eval'; it is an ALLOW_DEV_EVAL=1 runtime opt-in only",
    );
  });

  test("hashes and 'unsafe-inline' never coexist in script-src", () => {
    /* The invariant that keeps visualizations working. CSP3 makes a browser
       IGNORE 'unsafe-inline' as soon as a hash is present, so a policy
       carrying both silently reverts to hash-only enforcement — which blocks
       every `<iframe srcdoc>` viz card (measured: 23 failing Playwright specs).
       Whichever mechanism is in use, it must be exactly one. */
    const scriptSrc = /script-src ([^;"]+)/.exec(NGINX_CONF)?.[1] ?? '';
    const hasInline = scriptSrc.includes("'unsafe-inline'");
    const hasHash = /'sha256-/.test(scriptSrc);
    assert.ok(
      hasInline || hasHash,
      'script-src must permit the inline pre-paint scripts by one mechanism or the other',
    );
    assert.ok(
      !(hasInline && hasHash),
      "script-src carries BOTH 'unsafe-inline' and a hash: the browser will ignore " +
      "'unsafe-inline' and srcdoc-based viz cards will stop rendering",
    );
  });

  test('the hash list stays generated even while unused by the policy', () => {
    /* The hashes are what makes tightening back to hash-only a one-line
       change once the viz iframes move to a real URL. Letting them rot in the
       meantime would mean rediscovering the drift bug a second time. */
    assert.ok(
      CSP_INLINE_SCRIPT_HASHES.length > 0,
      'the generated hash list must not be emptied while the policy waits to be tightened',
    );
  });
});

describe('csp: retired third-party hosts stay out', () => {
  for (const host of RETIRED_HOSTS) {
    test(`${host} is absent from the nginx policy`, () => {
      assert.ok(
        !NGINX_CONF.includes(host),
        `${host} is back in the CSP. Its last consumer was removed by ` +
        'P_perf-self-host; name the new consumer before re-adding it.',
      );
    });
  }

  test('index.html still declares no dependency on them', () => {
    // Guards the premise of the tightening: if a future change reintroduces a
    // CDN <script>/<link> into index.html, this fails and forces the CSP to be
    // revisited together with it, rather than the page silently breaking.
    const tags = INDEX_HTML.match(/<(?:script|link)[^>]*>/g) ?? [];
    for (const tag of tags) {
      for (const host of RETIRED_HOSTS) {
        assert.ok(
          !tag.includes(host),
          `index.html loads ${host} in ${tag} but the CSP no longer allows it`,
        );
      }
    }
  });
});
