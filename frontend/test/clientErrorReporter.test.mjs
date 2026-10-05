import assert from 'node:assert/strict';
import test from 'node:test';
import { createClientErrorReporter, sendClientError, CLIENT_ERROR_PATH } from '../src/util/clientErrorReporter.ts';

test('the client-error path resolves to the server route in both topologies', () => {
  /* /api/v2 bypasses the stale CDN cache and is rewritten to /api/* by nginx
     in production and by the Express apiV2Rewrite middleware locally. The
     server route is mounted at /api/client-error, so the constant must map
     onto it — otherwise every caught error ships a 404 nobody sees. */
  assert.match(CLIENT_ERROR_PATH, /^\/api\/v2\/[\w-]+$/);
  assert.equal(CLIENT_ERROR_PATH.replace('/api/v2', '/api'), '/api/client-error');
  assert.equal(CLIENT_ERROR_PATH, '/api/v2/client-error', 'errorGuard.js and this module share one path');
});

test('every emitter in src uses the shared client-error path', async () => {
  /* A second spelling of the same route would split the telemetry and be
     invisible to tests, so pin the source: no file may carry the literal. */
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join, relative, sep } = await import('node:path');
  const SRC = new URL('../src', import.meta.url).pathname;
  const offenders = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'vendor-files') walk(full); continue; }
      if (!/\.(js|ts|tsx)$/.test(entry.name)) continue;
      const rel = relative(SRC, full).split(sep).join('/');
      if (/(^|\/)clientErrorReporter\.ts$/.test(rel)) continue;
      readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
        if (/['"`]\/api\/(v2\/)?client-error['"`]/.test(line)) offenders.push(`${rel}:${i + 1}`);
      });
    }
  })(SRC);
  assert.deepEqual(offenders, [], 'a hardcoded client-error path bypasses the shared constant');
});

test('production reports contain site, build and request correlation without error content', () => {
  const sent = [];
  const report = createClientErrorReporter({
    send: (body) => sent.push(JSON.parse(body)), now: () => 123, buildId: 'abc123',
  });
  const error = Object.assign(new TypeError('secret prompt token'), {
    stack: 'secret stack', requestId: 'request-123',
  });
  report(error, 'session/save', 'invariant');
  assert.equal(sent.length, 1);
  assert.match(sent[0].msg, /invariant.*session\/save.*TypeError.*build=abc123.*request=request-123/);
  assert.match(sent[0].correl, /^sw-/);
  assert.doesNotMatch(JSON.stringify(sent), /secret|stack|href|ua/);
});

test('explicit expected sites stay quiet in dev but remain countable', async () => {
  /* In dev there is no beacon: the classes are separated by console noise.
     `expected` must be silent (it is optional by construction, often firing
     every turn) while still being counted so the volume is measurable. */
  const { reportSwallow, expectedSwallowCount } = await import('../src/util/reportSwallow.ts');
  const realWarn = console.warn;
  const warns = [];
  console.warn = (...args) => warns.push(args);
  try {
    const before = expectedSwallowCount();
    reportSwallow(new TypeError('storage blocked'), 'providers.readPref', 'expected');
    reportSwallow(new TypeError('storage blocked'), 'providers.readPref', 'expected');
    assert.equal(warns.length, 0, 'expected failures do not spam the dev console');
    assert.equal(expectedSwallowCount() - before, 2, 'their volume is still measurable');

    reportSwallow(new TypeError('degraded'), 'session.save');
    reportSwallow(new TypeError('degraded'), 'session.save', 'recoverable');
    reportSwallow(new TypeError('broken'), 'chat/stream', 'invariant');
    assert.equal(warns.length, 3, 'every reported class is visible in dev');
  } finally {
    console.warn = realWarn;
  }
});

test('the default severity is recoverable, so best-effort sites never log as invariants', async () => {
  /* ~480 sites call reportSwallow(err, ctx) with no severity. If the default
     were `invariant`, every one of them would file a server console.error and
     bury the real uncaught-error signal. Pin the default in the source. */
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/util/reportSwallow.ts', import.meta.url), 'utf8');
  const signature = src.match(/severity:\s*FailureSeverity\s*=\s*'(\w+)'/);
  assert.ok(signature, 'reportSwallow must declare a default severity');
  assert.equal(signature[1], 'recoverable');
});

test('expected lifecycle cancellations never consume the reporting budget', () => {
  const sent = [];
  const report = createClientErrorReporter({ send: (body) => sent.push(body) });
  report(new Error(), 'expected', 'expected');
  report({ name: 'AbortError' }, 'abort');
  report({ code: 'ABORTED' }, 'abort-code');
  report({ reason: 'session-switch' }, 'switch');
  assert.equal(sent.length, 0);
  report(new Error(), 'real-error');
  assert.equal(sent.length, 1);
});

test('deduplication and a global budget bound storms and reset after a minute', () => {
  let time = 0;
  const sent = [];
  const report = createClientErrorReporter({ send: (body) => sent.push(body), now: () => time });
  for (let i = 0; i < 100; i++) report(new Error(), 'one-site');
  assert.equal(sent.length, 1);
  for (let i = 0; i < 100; i++) report(new Error(), 'site-' + i);
  assert.equal(sent.length, 10);
  time = 60_000;
  report(new Error(), 'one-site');
  assert.equal(sent.length, 11);
});

test('malicious getters and failing transports never escape or recurse', () => {
  const report = createClientErrorReporter({ send: () => { throw new Error('sink failed'); } });
  assert.doesNotThrow(() => report({ get name() { throw new Error('getter failed'); } }, 'getter'));
  assert.doesNotThrow(() => report(new Error(), 'transport'));
});

test('a rejected beacon falls back to JSON fetch and a rejected fetch stays quiet', async () => {
  const previous = {
    window: globalThis.window, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    fetch: globalThis.fetch,
  };
  const calls = [];
  globalThis.window = {};
  Object.defineProperty(globalThis, 'navigator', {
    value: { sendBeacon: () => false }, configurable: true,
  });
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    throw new Error('offline');
  };
  try {
    assert.doesNotThrow(() => sendClientError('{"msg":"safe"}'));
    await Promise.resolve();
    assert.equal(calls[0].url, '/api/v2/client-error');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
    assert.equal(calls[0].options.keepalive, true);
    Object.defineProperty(globalThis, 'navigator', {
      value: { sendBeacon: () => true }, configurable: true,
    });
    sendClientError('{}');
    assert.equal(calls.length, 1, 'accepted beacon does not duplicate the report');
  } finally {
    globalThis.window = previous.window;
    globalThis.fetch = previous.fetch;
    if (previous.navigator) Object.defineProperty(globalThis, 'navigator', previous.navigator);
    else delete globalThis.navigator;
  }
});
