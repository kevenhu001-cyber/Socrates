// @ts-check
/**
 * telemetry-export — proves spans actually reach a collector.
 *
 * "It compiles and the SDK logs 'tracing enabled'" is not evidence. The
 * OTLP/HTTP exporter batches in the background, so a wiring mistake — wrong
 * path, wrong encoding, resource attributes never set — shows up as silence
 * rather than an error. This file stands up a real HTTP listener, points the
 * exporter at it, and inspects the payload.
 *
 * Own file on purpose: OpenTelemetry registers a GLOBAL tracer provider, once
 * per process. A file that also tested the "does not start" path would poison
 * this one (see the header of telemetry.test.js). Every case here shares the
 * single registration made by the first startTracing() call.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

/** Minimal OTLP/HTTP collector that records what was posted. */
function fakeCollector() {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { received.push({ url: req.url, json: JSON.parse(body) }); }
      catch { received.push({ url: req.url, raw: body }); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
  });
  return {
    received,
    listen: () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port))),
    close: () => new Promise((r) => server.close(r)),
  };
}

const collector = fakeCollector();
let mod;

before(async () => {
  const port = await collector.listen();
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${port}`;
  process.env.OTEL_SERVICE_NAME = 'telemetry-export-test';
  // Export promptly instead of waiting out the default batch delay.
  process.env.OTEL_BSP_SCHEDULE_DELAY = '100';
  mod = await import('../src/lib/telemetry.js');
  await mod.startTracing();
});

after(async () => {
  if (mod) await mod.stopTracing();
  await collector.close();
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  delete process.env.OTEL_SERVICE_NAME;
  delete process.env.OTEL_BSP_SCHEDULE_DELAY;
});

/** Force a flush so assertions do not race the batch processor. */
async function flush() {
  await mod.stopTracing();          // shutdown() force-flushes
  await new Promise((r) => setTimeout(r, 150));
}

describe('telemetry: export over OTLP/HTTP', () => {
  test('tracing reports itself as enabled', () => {
    assert.equal(mod.tracingEnabled(), true);
  });

  test('a span reaches the collector with its attributes', async () => {
    await mod.withSpan('llm.stream', {
      'llm.model': 'test-model',
      'socrates.tool_iteration': 0,
    }, async () => {
      // The chat pipeline adds the outcome after the upstream call returns.
      mod.annotateSpan({ 'llm.finish_reason': 'stop', 'llm.usage_reported': true });
    });

    await mod.withSpan('llm.stream', {}, async () => {
      throw new Error('upstream exploded');
    }).catch(() => {});

    await flush();

    assert.ok(collector.received.length > 0,
      'no OTLP payload arrived — the exporter is not wired to the endpoint');

    const first = collector.received[0];
    assert.match(first.url, /\/v1\/traces$/,
      'the exporter must POST to the OTLP traces path, not the base URL');

    const flat = JSON.stringify(collector.received);
    assert.match(flat, /llm\.stream/, 'span name must be exported');
    assert.match(flat, /telemetry-export-test/,
      'service.name must come through from OTEL_SERVICE_NAME — without a resource ' +
      'the spans are unattributable');
    assert.match(flat, /test-model/, 'span attributes must be exported');
    assert.match(flat, /llm\.finish_reason/, 'annotateSpan attributes must be exported');

    // A failed turn must be a failed span, not a gap in the trace.
    assert.match(flat, /upstream exploded/, 'the exception must be recorded');
    assert.match(flat, /"code":2/, 'the span status must be ERROR (OTLP code 2)');
  });
});
