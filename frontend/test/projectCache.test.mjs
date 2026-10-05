import assert from 'node:assert/strict';
import test from 'node:test';

const {
  getCachedProjects,
  hasCachedProjects,
  loadCachedProjects,
  setCachedProjects,
  subscribeToProjectCache,
} = await import('../src/projects/projectCache.ts');

test('project cache normalizes typed data and ignores invalid records', () => {
  assert.equal(hasCachedProjects(), false);
  setCachedProjects([
    { id: 'project-1', name: 'Algebra' },
    { id: 'project-2', name: 12 },
    null,
  ]);

  assert.deepEqual(getCachedProjects(), [{ id: 'project-1', name: 'Algebra' }]);
  assert.equal(hasCachedProjects(), true);
});

test('project cache notifies subscribers and shares an in-flight initial request', async () => {
  setCachedProjects(undefined);
  let notifications = 0;
  const unsubscribe = subscribeToProjectCache(() => { notifications += 1; });
  let finishRequest;
  let requestCount = 0;
  let signalRequestStarted;
  const requestStarted = new Promise((resolve) => { signalRequestStarted = resolve; });
  const fetcher = () => {
    requestCount += 1;
    signalRequestStarted();
    return new Promise((resolve) => { finishRequest = resolve; });
  };

  const first = loadCachedProjects(fetcher);
  const second = loadCachedProjects(fetcher);
  await requestStarted;
  assert.equal(requestCount, 1);

  finishRequest({ projects: [{ id: 'project-2', name: 'Geometry' }] });
  assert.deepEqual(await first, [{ id: 'project-2', name: 'Geometry' }]);
  assert.deepEqual(await second, [{ id: 'project-2', name: 'Geometry' }]);
  assert.equal(notifications, 1);
  unsubscribe();
});

test('a response started before a local project write cannot overwrite the newer cache', async () => {
  setCachedProjects(undefined);
  let finishRequest;
  const request = loadCachedProjects(() => new Promise((resolve) => { finishRequest = resolve; }));
  await new Promise((resolve) => setImmediate(resolve));
  setCachedProjects([{ id: 'project-local', name: 'Created locally' }]);

  finishRequest({ projects: [{ id: 'project-stale', name: 'Stale response' }] });
  await request;

  assert.deepEqual(getCachedProjects(), [{ id: 'project-local', name: 'Created locally' }]);
});
