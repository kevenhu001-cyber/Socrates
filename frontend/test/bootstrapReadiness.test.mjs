import assert from 'node:assert/strict';
import test from 'node:test';

const {
  ensureChatReady,
  getHydrationSnapshot,
  resetPostAuthHydration,
  startPostAuthHydration,
} = await import('../src/app/bootstrapReadiness.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

test('post-auth resources start concurrently and recents do not gate chat readiness', async () => {
  resetPostAuthHydration();
  const providers = deferred();
  const memories = deferred();
  const sessions = deferred();
  const starts = [];

  const hydration = startPostAuthHydration({
    providers() { starts.push('providers'); return providers.promise; },
    memories() { starts.push('memories'); return memories.promise; },
    sessions() { starts.push('sessions'); return sessions.promise; },
  });
  await Promise.resolve();

  assert.deepEqual(starts.sort(), ['memories', 'providers', 'sessions']);
  assert.deepEqual(getHydrationSnapshot(), {
    generation: hydration.generation,
    providers: 'loading', memories: 'loading', sessions: 'loading',
  });

  providers.resolve();
  memories.resolve();
  const ready = await ensureChatReady();
  assert.equal(ready.providers, 'ready');
  assert.equal(ready.memories, 'ready');
  assert.equal(ready.sessions, 'loading');

  sessions.resolve();
  await hydration.hydrationReady;
  assert.equal(getHydrationSnapshot().sessions, 'ready');
});

test('a failed resource degrades locally and an old user cannot overwrite a reset', async () => {
  resetPostAuthHydration();
  const oldProviders = deferred();
  startPostAuthHydration({
    providers: () => oldProviders.promise,
    memories: () => Promise.reject(new Error('memory unavailable')),
    sessions: () => Promise.reject(new Error('recents unavailable')),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(getHydrationSnapshot().memories, 'degraded');
  assert.equal(getHydrationSnapshot().sessions, 'degraded');

  resetPostAuthHydration();
  const resetGeneration = getHydrationSnapshot().generation;
  oldProviders.resolve();
  await Promise.resolve();
  assert.deepEqual(getHydrationSnapshot(), {
    generation: resetGeneration,
    providers: 'idle', memories: 'idle', sessions: 'idle',
  });
});
