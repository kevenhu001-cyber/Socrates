import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decoratePluginEntry,
  loadPluginCatalog,
  normalisePluginId,
  resetPluginCatalogForTests,
  serializeSelectedPluginContext,
} from '../src/react/composer/pluginCatalog.ts';
import {
  installComposerPluginSelectionBridge,
  removeComposerPlugin,
  toggleComposerPlugin,
} from '../src/react/composer/pluginSelection.ts';

test('normalises connector ids and decorates connection state', () => {
  assert.equal(normalisePluginId('Google_Drive'), 'googledrive');
  assert.equal(normalisePluginId('google-drive'), 'googledrive');

  const connected = decoratePluginEntry({
    id: 'github',
    name: 'GitHub',
    description: 'Repository context',
    capabilities: ['Issues'],
    connection: { status: 'connected', displayName: 'Study org' },
  });
  assert.equal(connected?.connectionStatus, 'connected');
  assert.equal(connected?.displayName, 'Study org');

  const unavailable = decoratePluginEntry({
    id: 'future-tool',
    name: 'Future tool',
    configured: false,
  });
  assert.equal(unavailable?.connectionStatus, 'unavailable');
  assert.equal(unavailable?.configured, false);
});

test('loads a catalog and keeps connected entries distinguishable', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    configured: true,
    connectors: [
      { id: 'github', name: 'GitHub', connection: { status: 'connected' } },
      { id: 'gmail', name: 'Gmail', connection: null },
      { id: 'disabled', name: 'Disabled', configured: false },
    ],
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  try {
    resetPluginCatalogForTests();
    const catalog = await loadPluginCatalog(true);
    assert.deepEqual(catalog.map((entry) => [entry.id, entry.connectionStatus]), [
      ['github', 'connected'],
      ['gmail', 'disconnected'],
      ['disabled', 'unavailable'],
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    resetPluginCatalogForTests();
  }
});

test('serializes selected plugins into the existing prompt message', () => {
  const github = decoratePluginEntry({
    id: 'github',
    name: 'GitHub',
    capabilities: ['Issues', 'Pull requests'],
  });
  assert.ok(github);

  const serialized = serializeSelectedPluginContext([github], 'Summarize my open issues');
  assert.match(serialized, /connected GitHub context/i);
  assert.match(serialized, /Summarize my open issues/);
  assert.equal(serializeSelectedPluginContext([], '  keep this prompt  '), 'keep this prompt');
});

test('supports independent multi-plugin chip selection and removal', () => {
  const bridge = installComposerPluginSelectionBridge();
  bridge.__resetForTests();
  const github = decoratePluginEntry({ id: 'github', name: 'GitHub' });
  const notion = decoratePluginEntry({ id: 'notion', name: 'Notion' });
  assert.ok(github && notion);

  toggleComposerPlugin('topic', github, '<svg />');
  toggleComposerPlugin('topic', notion, '<svg />');
  bridge.flush();
  assert.deepEqual(bridge.getSnapshot().topic.map((plugin) => plugin.id), ['github', 'notion']);
  assert.equal(bridge.getSnapshot().chat.length, 0);

  removeComposerPlugin('topic', 'github');
  bridge.flush();
  assert.deepEqual(bridge.getSnapshot().topic.map((plugin) => plugin.id), ['notion']);
  bridge.__resetForTests();
});
