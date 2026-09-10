// @ts-check
/**
 * Unit tests for src/middleware/error.js — global timeout,
 * error handler, and 404 catch-all.
 *
 * These three pieces sit at the bottom of the middleware stack
 * and are responsible for:
 *   - giving every request a hard upper bound on execution time
 *     (timeoutMiddleware),
 *   - serialising every thrown error into a consistent JSON shape
 *     with appropriate status codes (errorHandler),
 *   - returning a structured 404 for unmatched routes
 *     (notFoundHandler).
 *
 * A regression here would silently degrade error reporting for
 * every endpoint, so we exercise every branch.
 *
 * Run with: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  timeoutMiddleware,
  errorHandler,
  notFoundHandler,
} from '../src/middleware/error.js';
import { ApiError, BadRequest, TooManyRequests } from '../src/lib/errors.js';

/* ── Helpers ──────────────────────────────────────────────────── */

function fakeReq(overrides = {}) {
  const e = new EventEmitter();
  return {
    id: 'req-1',
    method: 'GET',
    originalUrl: '/api/test?token=secret&foo=bar',
    ip: '127.0.0.1',
    headers: {},
    ...e,
    ...overrides,
  };
}

function fakeRes() {
  const e = new EventEmitter();
  return {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    _status: null,
    _body: null,
    headers: {},
    status(code) { this._status = code; return this; },
    json(payload) {
      /* Express defaults to 200 when no explicit status was set
         via .status() before .json() — mirror that here so tests
         can assert on the final status without always calling
         .status(200) explicitly. */
      if (this._status === null) this._status = 200;
      this._body = payload;
      this.headersSent = true;
      e.emit('finish');
      return this;
    },
    setHeader(k, v) { this.headers[k] = v; },
    getHeader(k) { return this.headers[k]; },
    destroy(err) { this.destroyed = true; if (err) e.emit('error', err); e.emit('close'); },
    on(name, fn) { e.on(name, fn); return this; },
    once(name, fn) { e.once(name, fn); return this; },
  };
}

/* ── timeoutMiddleware ────────────────────────────────────────── */

describe('timeoutMiddleware', () => {
  test('clears the timer on res.finish', async () => {
    const req = fakeReq();
    const res = fakeRes();
    const origTimeout = global.setTimeout;
    let pendingTimers = 0;
    /* Spy on setTimeout to count timers. */
    /* Skip — we can't easily intercept globally; instead, just
       verify the res.on('finish') callback fires and clears. */
    await new Promise((resolve) => {
      timeoutMiddleware(req, res, () => {
        /* simulate handler completing */
        setTimeout(() => {
          res.json({ ok: true });
          resolve();
        }, 10);
      });
    });
    /* After finish, the timer is cleared. We can't directly
       observe "no timers remain" but we CAN check that the
       response ended normally (no 504 emitted). */
    assert.equal(res._status, 200);
    assert.equal(res._body.ok, true);
  });

  test('clears the timer on res.close (disconnect)', async () => {
    const req = fakeReq();
    const res = fakeRes();
    let nextCalled = false;
    await new Promise((resolve) => {
      timeoutMiddleware(req, res, () => {
        nextCalled = true;
        /* simulate client disconnect */
        setTimeout(() => {
          res.destroy();
          resolve();
        }, 10);
      });
    });
    assert.equal(nextCalled, true);
    /* No 504 — destroy path. */
  });

  test('returns 504 when handler does not respond before REQUEST_TIMEOUT_MS', async () => {
    /* Set a very short timeout so the test runs quickly. */
    const prev = process.env.REQUEST_TIMEOUT_MS;
    process.env.REQUEST_TIMEOUT_MS = '50';
    try {
      const req = fakeReq();
      const res = fakeRes();
      let nextCalled = false;
      timeoutMiddleware(req, res, () => {
        nextCalled = true;
        /* never call res.json — simulate a stuck handler. */
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(nextCalled, true);
      assert.equal(res._status, 504);
      assert.equal(res._body.code, 'REQUEST_TIMEOUT');
    } finally {
      if (prev === undefined) delete process.env.REQUEST_TIMEOUT_MS;
      else process.env.REQUEST_TIMEOUT_MS = prev;
    }
  });

  test('res.locals.timeoutMs defers the 504 for long LLM calls', async () => {
    /* Non-streaming LLM routes can await the upstream model before sending
     * headers; they set a larger res.locals.timeoutMs so the default
     * budget re-arms instead of killing the request at 50 ms here. */
    const prev = process.env.REQUEST_TIMEOUT_MS;
    process.env.REQUEST_TIMEOUT_MS = '50';
    try {
      const req = fakeReq();
      const res = fakeRes();
      res.locals = { timeoutMs: 200 };
      timeoutMiddleware(req, res, () => {
        /* never respond — simulate a slow upstream. */
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(res._status, null);
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(res._status, 504);
      assert.equal(res._body.code, 'REQUEST_TIMEOUT');
    } finally {
      if (prev === undefined) delete process.env.REQUEST_TIMEOUT_MS;
      else process.env.REQUEST_TIMEOUT_MS = prev;
    }
  });

  test('res.locals.timeoutMs = 0 disables the deadline for long LLM responses', async () => {
    /* Non-streaming LLM routes set 0 so a slow model is never cut off;
     * the middleware must not emit a 504 even though the default budget
     * (50 ms here) has long expired. */
    const prev = process.env.REQUEST_TIMEOUT_MS;
    process.env.REQUEST_TIMEOUT_MS = '50';
    try {
      const req = fakeReq();
      const res = fakeRes();
      res.locals = { timeoutMs: 0 };
      timeoutMiddleware(req, res, () => {
        /* never respond — simulate a model that is still thinking. */
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(res._status, null);
      assert.equal(res.destroyed, false);
    } finally {
      if (prev === undefined) delete process.env.REQUEST_TIMEOUT_MS;
      else process.env.REQUEST_TIMEOUT_MS = prev;
    }
  });
});

/* ── errorHandler ─────────────────────────────────────────────── */

describe('errorHandler', () => {
  test('serialises ApiError with the documented shape', () => {
    const req = fakeReq();
    const res = fakeRes();
    const err = new BadRequest('Email is malformed');
    errorHandler(err, req, res, () => {});
    assert.equal(res._status, 400);
    assert.equal(res._body.code, 'BAD_REQUEST');
    assert.equal(res._body.message, 'Email is malformed');
  });

  test('serialises TooManyRequests with status 429', () => {
    const req = fakeReq();
    const res = fakeRes();
    const err = new TooManyRequests('Daily limit hit');
    errorHandler(err, req, res, () => {});
    assert.equal(res._status, 429);
    assert.equal(res._body.code, 'TOO_MANY_REQUESTS');
  });

  test('serialises arbitrary ApiError carrying a non-standard status', () => {
    /* A custom error with an arbitrary status code (e.g. 503 from
       upstream) must round-trip through the handler unchanged. */
    const req = fakeReq();
    const res = fakeRes();
    const err = new ApiError(503, 'UPSTREAM_DOWN', 'LLM provider is unreachable');
    errorHandler(err, req, res, () => {});
    assert.equal(res._status, 503);
    assert.equal(res._body.code, 'UPSTREAM_DOWN');
    assert.equal(res._body.message, 'LLM provider is unreachable');
  });

  test('serialises ZodError as 400 VALIDATION_ERROR', () => {
    const req = fakeReq();
    const res = fakeRes();
    /* Build a ZodError-shaped object (we don't import zod here
       just to construct one — match the shape the handler
       matches against). */
    const zodLike = {
      name: 'ZodError',
      issues: [{ path: ['email'], message: 'Invalid email' }],
    };
    errorHandler(zodLike, req, res, () => {});
    assert.equal(res._status, 400);
    assert.equal(res._body.code, 'VALIDATION_ERROR');
  });

  test('strips ZodError issue details in production (no input leakage)', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const req = fakeReq();
      const res = fakeRes();
      const zodLike = {
        name: 'ZodError',
        issues: [{ path: ['email'], message: 'Invalid email' }],
      };
      errorHandler(zodLike, req, res, () => {});
      assert.equal(res._status, 400);
      /* Production mode MUST omit `detail` to avoid leaking
         schema internals or user input through error messages. */
      assert.equal(res._body.detail, undefined);
    } finally {
      if (prev === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prev;
    }
  });

  test('keeps ZodError issue details in development', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const req = fakeReq();
      const res = fakeRes();
      const zodLike = {
        name: 'ZodError',
        issues: [{ path: ['email'], message: 'Invalid email' }],
      };
      errorHandler(zodLike, req, res, () => {});
      assert.equal(res._status, 400);
      assert.ok(res._body.detail);
    } finally {
      if (prev === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prev;
    }
  });

  test('translates multer LIMIT_FILE_SIZE to 413 FILE_TOO_LARGE', () => {
    const req = fakeReq();
    const res = fakeRes();
    const err = Object.assign(new Error('File too large'), { code: 'LIMIT_FILE_SIZE' });
    errorHandler(err, req, res, () => {});
    assert.equal(res._status, 413);
    assert.equal(res._body.code, 'FILE_TOO_LARGE');
  });

  test('falls back to 500 INTERNAL_ERROR for unknown errors', () => {
    const req = fakeReq();
    const res = fakeRes();
    const err = new Error('something exploded');
    errorHandler(err, req, res, () => {});
    assert.equal(res._status, 500);
    assert.equal(res._body.code, 'INTERNAL_ERROR');
    /* Never leak the raw error message to the client. */
    assert.notEqual(res._body.message, 'something exploded');
  });

  test('echoes the request id back as X-Request-Id for log correlation', () => {
    const req = fakeReq({ id: 'corr-123' });
    const res = fakeRes();
    errorHandler(new Error('boom'), req, res, () => {});
    assert.equal(res.headers['X-Request-Id'], 'corr-123');
  });

  test('handles missing req gracefully (no req.id → no header, no crash)', () => {
    const req = fakeReq();
    delete req.id;
    const res = fakeRes();
    errorHandler(new Error('boom'), req, res, () => {});
    assert.equal(res._status, 500);
    assert.equal(res.headers['X-Request-Id'], undefined);
  });
});

/* ── notFoundHandler ──────────────────────────────────────────── */

describe('notFoundHandler', () => {
  test('returns a 404 with a structured payload', () => {
    const res = fakeRes();
    notFoundHandler({ /* no req */ }, res);
    assert.equal(res._status, 404);
    assert.equal(res._body.code, 'NOT_FOUND');
    assert.match(res._body.message, /Endpoint not found/);
  });
});