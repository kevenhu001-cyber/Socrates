import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
const { useWorkspaceSnapshot, useWorkspaceDispatch } = await import('../src/react/pages/workspace/workspace.hooks.ts');
const { patchLibraryData, setWorkspaceLoading, setWorkspaceProjects, useWorkspaceStore } = await import('../src/react/pages/workspace/workspace.store.ts');

test('workspace pages subscribe independently and keep stable actions during unrelated updates', async () => {
  const root = createRoot(document.getElementById('root'));
  const renders = { library: 0, projects: 0, plugins: 0 };
  const actions = {};
  const snapshots = {};
  function Probe({ page }) {
    snapshots[page] = useWorkspaceSnapshot(page);
    actions[page] = useWorkspaceDispatch();
    renders[page]++;
    return null;
  }
  try {
    await act(() => root.render(['library', 'projects', 'plugins'].map((page) => createElement(Probe, { key: page, page }))));
    const initialActions = actions.library;
    assert.deepEqual(renders, { library: 1, projects: 1, plugins: 1 });
    await act(() => patchLibraryData({ query: 'lesson' }));
    assert.deepEqual(renders, { library: 2, projects: 1, plugins: 1 });
    assert.strictEqual(actions.library, initialActions);
    assert.strictEqual(actions.plugins, initialActions);
    await act(() => setWorkspaceLoading('projects', true));
    assert.deepEqual(renders, { library: 2, projects: 2, plugins: 1 });
    assert.equal(snapshots.projects.loading, true);
    assert.equal(snapshots.library.loading, false);
    await act(() => setWorkspaceProjects([{ id: 'project-1', name: 'Lesson' }]));
    assert.deepEqual(renders, { library: 2, projects: 3, plugins: 1 });
    assert.equal(snapshots.projects.data.length, 1);
    await act(() => useWorkspaceStore.setState({ projectConnectorConfigured: true }));
    assert.deepEqual(renders, { library: 2, projects: 3, plugins: 2 });
  } finally {
    await act(() => root.unmount());
    dom.window.close();
  }
});
