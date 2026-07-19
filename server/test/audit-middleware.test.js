// @ts-check
/**
 * Unit tests for src/middleware/audit.js — the audit-logging
 * middleware and direct recorder.
 *
 * The audit log is the compliance / forensics trail. Every
 * authenticated action (login, settings change, share creation)
 * should land in the `audit_events` table; failed pre-auth events
 * (where we don't yet have a user_id) should at least appear in
 * the server log so brute-force probes leave a trace.
 *
 * Run with: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { audit, recordAudit } from '../src/middleware/audit.js';

/* ── fakeRes that exposes .status() and emits 'finish' ────────── */

function fakeRes(statusCode = 200) {
  const e = new EventEmitter();
  return {
    statusCode,
    headers: {},
    _status: null,
    setHeader() {},
    on(name, fn) { e.on(name, fn); return this; },
    once(name, fn) { e.once(name, fn); return this; },
    emit(name) { e.emit(name); },
  };
}

function fakeReq(overrides = {}) {
  return {
    method: 'POST',
    originalUrl: '/api/auth/login',
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest' },
    ...overrides,
  };
}

/* Capture console.warn output for tests that assert on the
 * failure-path logging. */
function captureWarn() {
  const original = console.warn;
  const lines = [];
  console.warn = (...args) => {
    lines.push(args.map(String).join(' '));
  };
  return {
    lines,
    restore: () => { console.warn = original; },
  };
}

/* ── audit middleware ────────────────────────────────────────── */

describe('audit middleware', () => {
  test('calls next() and attaches a finish listener', () => {
    const mw = audit('test_action');
    const req = fakeReq();
    const res = fakeRes();
    let nextCalled = false;
    let finishListenerCount = 0;
    /* The middleware adds a 'finish' listener to res. */
    const origOn = res.on;
    res.on = (name, fn) => {
      if (name === 'finish') finishListenerCount++;
      return origOn.call(res, name, fn);
    };
    mw(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(finishListenerCount, 1);
  });

  test('does nothing on the failure path when logFailures is false', () => {
    /* opt-out: failed pre-auth events still hit the DB? No —
       they go to stdout only. But if logFailures=false, they
       stay silent entirely. */
    const mw = audit('login', null, { logFailures: false });
    const req = fakeReq();
    const res = fakeRes(401); // failed status

    const capture = captureWarn();
    let warnCalled = false;
    const origWarn = console.warn;
    console.warn = (...args) => { warnCalled = true; origWarn(...args); };

    mw(req, res, () => {});
    res.emit('finish');

    console.warn = origWarn;
    capture.restore();

    assert.equal(warnCalled, false, 'no warning when logFailures=false');
  });

  test('logs failed pre-auth events to console.warn (audit_f suffix)', () => {
    /* Audit failures MUST leave a trace. The previous build only
       logged 2xx, so a brute-force probe left no trace beyond
       rate-limit counters — H-3 audit fix. */
    const mw = audit('login');
    const req = fakeReq({
      originalUrl: '/api/auth/login?token=secret123',
      ip: '203.0.113.5',
      headers: { 'user-agent': 'curl/7.88' },
    });
    const res = fakeRes(401);
    /* Pass a getDetail that returns the email so the log line
       carries correlation context. */
    mw(req, res, () => {}, /* unused */);
    /* Actually audit(action, getDetail, opts) signature is:
       audit(action, getDetail?, opts?). Re-wire. */
    const mwWithDetail = audit('login', (r) => ({ email: r.body?.email || 'a@b.com' }));
    mwWithDetail(req, res, () => {});

    let captured;
    const origWarn = console.warn;
    console.warn = (...args) => { captured = args.join(' '); };
    res.emit('finish');
    console.warn = origWarn;

    assert.ok(captured, 'expected a warn call');
    assert.match(captured, /\[audit\] login_failed status=401/);
    assert.match(captured, /ip=203\.0\.113\.5/);
    /* safeUrl must have stripped the token value. */
    assert.equal(captured.includes('secret123'), false, 'token value must NOT appear in audit log');
    assert.match(captured, /token=\[RED/);
  });

  test('success path: silently skips when req.userId is missing', () => {
    /* Without an authenticated user, we cannot attribute the
       event to anyone — skip the DB insert silently. */
    const mw = audit('logout');
    const req = fakeReq(); // no userId
    const res = fakeRes(200);

    const origWarn = console.warn;
    let warnCalled = false;
    console.warn = (...args) => { warnCalled = true; origWarn(...args); };

    mw(req, res, () => {});
    res.emit('finish');

    console.warn = origWarn;
    assert.equal(warnCalled, false, 'no warn when success path has no userId');
  });

  test('success path: does not throw if DB is unavailable (fire-and-forget)', () => {
    /* The middleware swallows DB errors via .catch on the insert
       promise. If the DB is unconfigured, getDb() throws — the
       outer try/catch must catch that too. */
    const mw = audit('chat');
    const req = fakeReq({ userId: 'user-1' });
    const res = fakeRes(200);

    const origWarn = console.warn;
    let warnCalled = false;
    console.warn = (...args) => { warnCalled = true; origWarn(...args); };

    assert.doesNotThrow(() => {
      mw(req, res, () => {});
      res.emit('finish');
    });

    console.warn = origWarn;
    /* The warn call is acceptable (DB unavailable) but no crash. */
  });

  test('extracts getDetail output and merges method/path into the recorded detail', () => {
    /* The handler signature is audit(action, getDetail). getDetail
       is called with req and its return value (plus method + path)
       is what would land in the audit_events.detail column.
       We can't observe the DB write directly without a real DB,
       but we can spy on getDetail to confirm it runs once per
       successful response and receives the request. */
    let called = 0;
    let receivedReq;
    const mw = audit('update_settings', (req) => {
      called++;
      receivedReq = req;
      return { field: 'language', to: 'zh' };
    });
    const req = fakeReq({ userId: 'user-1', originalUrl: '/api/users/me' });
    const res = fakeRes(200);
    mw(req, res, () => {});
    res.emit('finish');
    assert.equal(called, 1);
    assert.equal(receivedReq, req);
  });
});

/* ── recordAudit ─────────────────────────────────────────────── */

describe('recordAudit', () => {
  test('does not throw when DB is unavailable', async () => {
    /* recordAudit swallows DB errors via .catch on the insert
       promise. Calling it without a configured DB must complete
       without throwing. */
    const origWarn = console.warn;
    console.warn = () => {}; // silence
    try {
      await recordAudit('user-1', 'manual_event', { foo: 'bar' });
      /* Reaching here without throwing IS the assertion. */
      assert.ok(true);
    } finally {
      console.warn = origWarn;
    }
  });
});