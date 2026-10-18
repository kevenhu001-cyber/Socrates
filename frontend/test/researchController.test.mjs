import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchController } from '../src/agent/researchController.ts';
import { consumeResearchStream } from '../src/agent/researchStream.ts';

const scope = { userId: 'owner', sessionId: 'session-a', projectId: null };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  const delivered = [];
  const pending = new Map();
  const watches = [];
  const job = { id: 'job', sessionId: scope.sessionId, projectId: null, query: 'Evidence', status: 'queued', eventSequence: 1, plan: [], searched: 0, sourceCount: 0, resultArtifactId: null };
  const ports = {
    list: async () => [], create: async () => ({ ...job }), get: async () => ({ ...job }),
    control: async (_id, action) => { job.status = action === 'cancel' ? 'cancelled' : 'queued'; job.eventSequence++; return { ...job }; },
    watch: (id, after, signal, onEvent) => new Promise((resolve) => { watches.push({ id, after, signal, onEvent, resolve }); signal.addEventListener('abort', () => resolve(), { once: true }); }),
    hasReport: (job) => delivered.some((entry) => entry.job.id === job.id),
    report: async () => ({ clientId: 'research-job', rawText: 'Report' }),
    deliver: (job, message) => delivered.push({ job, message }),
    pending: (scope, value) => { const key = `${scope.userId}/${scope.sessionId}`; if (value === null) pending.delete(key); else if (value) pending.set(key, value); return pending.get(key) || null; },
    key: () => 'stable-key', delay: (_ms, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
  };
  const client = createResearchController(ports);
  return { ports, client, job, watches, delivered, pending };
}

test('submission keeps its key after a lost response and replay delivers a report once', async () => {
  const f = fixture();
  const bodies = [];
  f.ports.create = async (body) => { bodies.push(body); if (bodies.length === 1) throw new Error('response lost'); return { ...f.job }; };
  f.client.open(scope); await tick();
  await f.client.submit('Evidence');
  assert.equal(f.client.getSnapshot().issue, 'submit');
  await f.client.submit();
  assert.equal(bodies[0].idempotencyKey, bodies[1].idempotencyKey);
  assert.equal(f.client.getSnapshot().pending, null);
  assert.equal(f.watches[0].after, 1);
  Object.assign(f.job, { status: 'succeeded', eventSequence: 3, resultArtifactId: 'artifact' });
  const event = { jobId: 'job', sequence: 3, stage: 'completed' };
  await f.watches[0].onEvent(event);
  await f.watches[0].onEvent(event);
  assert.equal(f.delivered.length, 1);
  f.client.open(null);
});

test('changing sessions aborts subscriptions and ignores delayed reports from the old scope', async () => {
  const f = fixture();
  const report = deferred();
  f.ports.report = () => report.promise;
  f.client.open(scope); await tick(); await f.client.submit('Evidence');
  Object.assign(f.job, { status: 'succeeded', eventSequence: 3, resultArtifactId: 'artifact' });
  const completion = f.watches[0].onEvent({ jobId: 'job', sequence: 3, stage: 'completed' });
  await tick();
  f.client.open({ ...scope, sessionId: 'session-b' });
  assert.equal(f.watches[0].signal.aborted, true);
  report.resolve({ rawText: 'Old report' }); await completion;
  assert.equal(f.delivered.length, 0);
  assert.deepEqual(f.client.getSnapshot().jobs, []);
  f.client.open(null);
});

test('reopening the same account/session recovers unresolved submissions with the same key', async () => {
  const f = fixture();
  f.client.open(scope); await tick();
  f.ports.create = async () => { throw new Error('offline'); };
  await f.client.submit('Evidence');
  f.client.open({ ...scope, userId: 'other' }); await tick();
  assert.equal(f.client.getSnapshot().pending, null);
  let replay;
  f.ports.create = async (body) => { replay = body; return { ...f.job }; };
  f.client.open(scope); await tick(); await tick();
  assert.equal(replay.idempotencyKey, 'stable-key');
  assert.equal(f.client.getSnapshot().jobs.length, 1);
  f.client.open(null);
});

test('cancel and retry reuse a job, and stale snapshots cannot overwrite the newer state', async () => {
  const f = fixture();
  f.client.open(scope); await tick(); await f.client.submit('Evidence');
  await f.client.control('job', 'cancel');
  assert.equal(f.client.getSnapshot().jobs[0].job.status, 'cancelled');
  f.ports.list = async () => [{ ...f.job, status: 'running', eventSequence: 1 }];
  await f.client.refresh();
  assert.equal(f.client.getSnapshot().jobs[0].job.status, 'cancelled');
  await f.client.control('job', 'retry');
  assert.equal(f.client.getSnapshot().jobs[0].job.status, 'queued');
  f.client.open(null);
});

test('deleted server reports stay deleted and report fetch failure can be refreshed', async () => {
  const f = fixture();
  Object.assign(f.job, { status: 'succeeded', resultArtifactId: 'artifact' });
  f.ports.list = async () => [{ ...f.job }];
  f.ports.report = async () => { throw new Error('offline'); };
  f.client.open(scope); await tick();
  assert.equal(f.client.getSnapshot().issue, 'result');
  f.ports.report = async () => null;
  await f.client.refresh();
  assert.equal(f.client.getSnapshot().issue, null);
  assert.equal(f.delivered.length, 0);
  f.client.open(null);
});

test('research SSE handles split UTF-8, CRLF, keepalives and a trailing frame', async () => {
  const text = ': keepalive\r\n\r\nid: 2\r\nevent: research_event\r\ndata: {"jobId":"job","sequence":2,"stage":"reading","title":"来源"}\r\n\r\nevent: research_event\ndata: {"jobId":"job","sequence":3,"stage":"completed"}';
  const encoded = new TextEncoder().encode(text);
  const response = new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < encoded.length; i += 3) controller.enqueue(encoded.slice(i, i + 3));
    controller.close();
  } }), { headers: { 'content-type': 'text/event-stream' } });
  const events = [];
  await consumeResearchStream(response, async (event) => { events.push(event); }, new AbortController().signal);
  assert.deepEqual(events.map((event) => event.sequence), [2, 3]);
  assert.equal(events[0].title, '来源');
});

test('a dropped stream reconnects from its last accepted sequence', async () => {
  const f = fixture();
  f.ports.delay = async () => {};
  f.client.open(scope); await tick(); await f.client.submit('Evidence');
  Object.assign(f.job, { status: 'running', eventSequence: 2 });
  await f.watches[0].onEvent({ jobId: 'job', sequence: 2, stage: 'planning' });
  f.watches[0].resolve(); await tick();
  assert.equal(f.watches[1].after, 2);
  f.client.open(null);
});
