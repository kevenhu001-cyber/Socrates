import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('the app exposes one stylesheet entry', async () => {
  const html = await read('index.html');
  const links = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(links, ['/src/styles/index.css']);
});

test('the stylesheet entry does not reconnect historical parity layers', async () => {
  const css = await read('src/styles/index.css');
  for (const legacy of [
    'chatgpt-ui.css',
    'chatgpt-v2.css',
    'ref-baseline.css',
    'mobile-parity.css',
    'chat-surface.css',
    'chatgpt-parity.css',
    'lobe-overrides.css',
  ]) {
    assert.equal(css.includes(legacy), false, `${legacy} must stay disconnected`);
    await assert.rejects(access(new URL(`src/styles/${legacy}`, root)), `${legacy} must stay deleted`);
  }
});

test('new owner modules use the ui token namespace', async () => {
  const files = [
    'src/styles/foundations/base.css',
    'src/styles/layout/app-shell.css',
    'src/styles/components/sidebar.css',
    'src/styles/components/composer.css',
    'src/styles/components/chat.css',
    'src/styles/components/menu.css',
    'src/styles/features/surfaces.css',
  ];
  const forbidden = /--(?:cowork|chatgpt|conversation|workbench|lobe)-/;
  for (const file of files) {
    const css = await read(file);
    assert.equal(forbidden.test(css), false, `${file} introduced a retired token namespace`);
  }
});
