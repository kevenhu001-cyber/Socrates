import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adoptPreflight,
  retryAuthMe,
  shouldGateForInitialUnauthorized,
  startAuthRequests,
  startCsrfBootstrap,
} from '../src/auth/boot/requests.js';
import { selectAuthUrlRoute } from '../src/auth/boot/routeSelector.js';

test('preflight adoption preserves JSON success and classifies HTTP failures', async () => {
  const payload = { user: { id: 'u1' } };
  assert.equal(await adoptPreflight(Promise.resolve({ status: 200, json: payload }), '/api/auth/me'), payload);

  await assert.rejects(adoptPreflight(Promise.resolve({ failed: true }), '/api/auth/me'), (error) => (
    error.status === 0 && error.code === 'NETWORK'
  ));
  await assert.rejects(adoptPreflight(Promise.resolve({ status: 401 }), '/api/auth/me'), (error) => (
    error.status === 401 && error.code === 'UNAUTHORIZED'
  ));
  await assert.rejects(adoptPreflight(Promise.resolve({ status: 503 }), '/api/auth/me'), (error) => (
    error.status === 503 && error.code === 'HTTP_503'
  ));
});

test('auth requests reuse head preflight promises and normalize their results', async () => {
  const me = Promise.resolve({ status: 200, json: { user: { id: 'u1' } } });
  const config = Promise.resolve({ status: 200, json: { hasBeagleKey: true } });
  const requests = startAuthRequests({ me, config });

  assert.deepEqual(await requests.meRequest, { value: { user: { id: 'u1' } } });
  assert.deepEqual(await requests.configRequest, { hasBeagleKey: true });
});

test('CSRF startup returns the head preflight promise when present', () => {
  const preflight = Promise.resolve('primed');
  assert.equal(startCsrfBootstrap({ csrf: preflight }), preflight);
});

test('only a non-grace-window initial 401 gates before config and retry work', () => {
  assert.equal(shouldGateForInitialUnauthorized({ error: { status: 401 } }, () => false), true);
  assert.equal(shouldGateForInitialUnauthorized({ error: { status: 401 } }, () => true), false);
  assert.equal(shouldGateForInitialUnauthorized({ error: { status: 503 } }, () => false), false);
  assert.equal(shouldGateForInitialUnauthorized({ value: {} }, () => false), false);
});

test('transient /me errors retry twice and return the resolved session', async () => {
  const waits = [];
  let requests = 0;
  const result = await retryAuthMe({ error: Object.assign(new Error('network'), { status: 0 }) }, {
    fetchMe: async () => {
      requests += 1;
      if (requests === 1) throw Object.assign(new Error('temporarily unavailable'), { status: 503 });
      return { user: { id: 'u1' } };
    },
    wait: async (milliseconds) => { waits.push(milliseconds); },
  });

  assert.deepEqual(result, { kind: 'resolved', me: { user: { id: 'u1' } } });
  assert.equal(requests, 2);
  assert.deepEqual(waits, [500, 500]);
});

test('401 during the auth grace window retries, then accepts the new cookie session', async () => {
  const waits = [];
  const result = await retryAuthMe({ error: Object.assign(new Error('Unauthorized'), { status: 401 }) }, {
    isInGraceWindow: () => true,
    fetchMe: async () => ({ user: { id: 'fresh' } }),
    wait: async (milliseconds) => { waits.push(milliseconds); },
  });

  assert.deepEqual(result, { kind: 'resolved', me: { user: { id: 'fresh' } } });
  assert.deepEqual(waits, [500]);
});

test('401 after the grace window stops retries and reports unauthorized', async () => {
  let requests = 0;
  const result = await retryAuthMe({ error: Object.assign(new Error('Unauthorized'), { status: 401 }) }, {
    isInGraceWindow: () => false,
    fetchMe: async () => { requests += 1; return { user: { id: 'unexpected' } }; },
  });
  assert.deepEqual(result, { kind: 'unauthorized' });
  assert.equal(requests, 0);
});

test('auth URL routing preserves local-dev and special-route precedence', () => {
  assert.deepEqual(
    selectAuthUrlRoute(new URLSearchParams('dev=1&share=public&token=verify'), 'localhost'),
    { kind: 'local-dev' },
  );
  assert.deepEqual(
    selectAuthUrlRoute(new URLSearchParams('dev=1&oauth_error=denied'), 'socrates.example'),
    { kind: 'oauth-error', oauthError: 'denied' },
  );
  assert.deepEqual(
    selectAuthUrlRoute(new URLSearchParams('error=legacy&share=public&token=verify'), 'socrates.example'),
    { kind: 'share', shareToken: 'public', plainError: 'legacy' },
  );
  assert.deepEqual(
    selectAuthUrlRoute(new URLSearchParams('token=verify&reset_token=reset'), 'socrates.example'),
    { kind: 'verify', token: 'verify', plainError: null },
  );
  assert.deepEqual(
    selectAuthUrlRoute(new URLSearchParams('reset_token=reset'), 'socrates.example'),
    { kind: 'password-reset', resetToken: 'reset', plainError: null },
  );
  assert.deepEqual(
    selectAuthUrlRoute(new URLSearchParams('dev=1'), 'socrates.example'),
    { kind: 'continue', plainError: null },
  );
});
