import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = {};

const {
  getCachedProjects,
  hasCachedProjects,
  loadCachedProjects,
  setCachedProjects,
  subscribeToProjectCache,
} = await import('../src/projects/projectCache.ts');

test('project cache normalizes data and keeps the legacy window alias synchronized', () => {
  assert.equal(hasCachedProjects(), false);
  window.__projectsCache = [
    { id: 'project-1', name: 'Algebra' },
    { id: 'project-2', name: 12 },
    null,
  ];

  assert.deepEqual(getCachedProjects(), [{ id: 'project-1', name: 'Algebra' }]);
  assert.deepEqual(window.__projectsCache, [{ id: 'project-1', name: 'Algebra' }]);
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
