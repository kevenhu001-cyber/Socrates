// @ts-check
/**
 * telemetry — the default-off half.
 *
 * With OTEL_EXPORTER_OTLP_ENDPOINT unset nothing may initialise: no exporter,
 * no background timer, no behaviour change. Instrumentation that affects a
 * deployment which did not ask for it is not opt-in.
 *
 * Deliberately split from telemetry-export.test.js. OpenTelemetry registers a
 * GLOBAL tracer provider, and a process can only do that once — a second
 * `sdk.start()` is silently ignored and every later span goes to the first
 * exporter. Mixing "starts successfully" and "does not start" cases in one
 * file produced exactly that false negative while this was being written:
 * spans created after an earlier unreachable-endpoint test vanished into that
 * dead exporter. scripts/run-tests.mjs spawns one process per FILE, so the
 * split gives each case a clean global.
 *
 * Nothing in this file calls startTracing() with an endpoint configured.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const saved = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
afterEach(() => {
  if (saved === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = saved;
});

const telemetry = () => import('../src/lib/telemetry.js');

describe('telemetry: disabled by default', () => {
  test('tracingEnabled() is false with no endpoint configured', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { tracingEnabled } = await telemetry();
    assert.equal(tracingEnabled(), false);
  });

  test('startTracing() is a no-op and does not throw', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { startTracing } = await telemetry();
    await startTracing();
    const { tracingEnabled } = await telemetry();
    assert.equal(tracingEnabled(), false, 'still disabled after a no-op start');
  });

  test('stopTracing() tolerates never having started', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { stopTracing } = await telemetry();
    await stopTracing();
  });

  test('withSpan still runs the callback and returns its value', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { withSpan } = await telemetry();
    const out = await withSpan('noop.test', { a: 1 }, async () => 'ran');
    assert.equal(out, 'ran',
      'call sites must not need to branch on whether tracing is on — the OTel ' +
      'API ships a no-op tracer precisely so they do not');
  });

  test('withSpan rethrows rather than swallowing errors', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { withSpan } = await telemetry();
    await assert.rejects(
      () => withSpan('noop.throw', {}, async () => { throw new Error('boom'); }),
      /boom/,
      'a tracing wrapper must never change control flow',
    );
  });

  test('withSpan passes a usable (inert) span to the callback', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { withSpan } = await telemetry();
    await withSpan('noop.span', {}, async (span) => {
      // The no-op span implements the full interface; calling it must be safe.
      span.setAttribute('k', 'v');
      span.addEvent('e');
    });
  });

  test('annotateSpan is safe with no active span', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { annotateSpan } = await telemetry();
    annotateSpan({ 'llm.model': 'test', 'llm.usage_reported': false });
  });

  test('recordHttpMetrics is a no-op when telemetry is off', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { recordHttpMetrics } = await telemetry();
    // Must not throw, must not need an SDK — the delegating meter absorbs it.
    recordHttpMetrics(12.3, '/api/chat/stream', 'POST', 200);
    recordHttpMetrics(0.4, '', 'GET', 404);
  });
});
