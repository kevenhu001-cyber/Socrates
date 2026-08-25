import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const bin = process.env.CODEX_APP_SERVER_BIN;
const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');

// The harness reads these env vars at import time — set them before the
// dynamic import below. When CODEX_APP_SERVER_BIN is unset the suite is
// skipped (it needs a real codex-app-server binary + an authenticated
// CODEX_HOME, e.g. the developer's ~/.codex ChatGPT login).
process.env.CODEX_APP_SERVER_BIN = bin;
process.env.CODEX_HOME = home;

function waitFor(predicate, { timeoutMs = 150_000, intervalMs = 50 } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('timed out waiting for condition'));
      }
    }, intervalMs);
  });
}

test('codex harness: spawn, thread, turn, streaming, approval', { timeout: 200_000, skip: !bin }, async () => {
  const { codexHarness } = await import('../src/services/codexHarness.js');
  const ws = path.join(os.tmpdir(), 'socrates-codex-test', `t_${Date.now()}`);
  mkdirSync(ws, { recursive: true });

  await codexHarness.ensureStarted();
  assert.ok(codexHarness.isRunning, 'harness should be running');

  const events = [];
  const approvalRequests = [];
  const unsub = codexHarness.onThreadEvent('__all__', () => {});

  const thread = await codexHarness.request('thread/start', {
    cwd: ws,
    approvalPolicy: 'on-request',
    sandbox: 'workspace-write',
    ephemeral: true,
  });
  const threadId = thread.thread.id;
  assert.ok(threadId, 'thread id returned');
  codexHarness.claimThread(threadId, 'test-user', 'gpt-5.6-sol');
  assert.ok(codexHarness.isThreadOwner(threadId, 'test-user'), 'owner claimed');

  const unsubThread = codexHarness.onThreadEvent(threadId, (method, params, meta) => {
    events.push({ method, params });
    if (method === 'item/commandExecution/requestApproval') {
      approvalRequests.push({ params, rpcId: meta?.rpcId });
      codexHarness.respondToRequest(meta?.rpcId ?? null, { decision: 'accept' });
    }
  });

  try {
    const turn = await codexHarness.request('turn/start', {
      threadId,
      clientUserMessageId: 'test-1',
      input: [{ type: 'text', text: '请用 shell 执行 echo hello-socrates 并告诉我输出。' }],
    });
    const turnId = turn.turn.id;
    assert.ok(turnId, 'turn id returned');

    await waitFor(() => events.some((e) => e.method === 'turn/completed'));

    const methods = events.map((e) => e.method);
    assert.ok(methods.includes('turn/started'), 'saw turn/started');
    assert.ok(methods.includes('item/agentMessage/delta'), 'saw streamed agent deltas');
    assert.ok(
      methods.includes('item/commandExecution/outputDelta') ||
        methods.includes('item/commandExecution/requestApproval'),
      'saw command execution activity',
    );
    const completed = events.find((e) => e.method === 'turn/completed');
    assert.equal(completed.params.turn.status, 'completed', 'turn should complete');

    const deltas = events
      .filter((e) => e.method === 'item/agentMessage/delta')
      .map((e) => e.params.delta || '')
      .join('');
    assert.ok(deltas.length > 0, 'accumulated agent text');
  } finally {
    try { codexHarness.respondToRequest(approvalRequests[0]?.rpcId ?? null, { decision: 'cancel' }); } catch {}
    unsub();
    unsubThread();
    await codexHarness.request('thread/delete', { threadId }).catch(() => {});
    codexHarness.releaseThread(threadId);
    // The app-server child keeps the event loop alive — stop it so the
    // test runner can exit.
    await codexHarness.stop();
  }
});
