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

test('migrated workspace panels are single React-owned page hosts', async () => {
  const [html, workspacePage, mountSpecs, mainJs] = await Promise.all([
    read('index.html'),
    read('src/react/pages/workspace/WorkspacePage.tsx'),
    read('src/react/lib/boot/specs.tsx'),
    read('src/main.js'),
  ]);
  assert.equal(html.includes('id="libraryList"'), false, 'legacy inner Library host must stay removed');
  assert.equal(html.includes('id="spacesList"'), false, 'legacy inner Projects host must stay removed');
  assert.equal(html.includes('id="pluginsList"'), false, 'legacy inner Plugins host must stay removed');
  assert.equal(html.includes('id="scheduledList"'), false, 'legacy inner Scheduled host must stay removed');
  assert.match(html, /<div class="library-panel main-page hidden" id="libraryPanel"><\/div>\s*<input type="file" id="libraryUploadInput"/);
  assert.match(html, /<div class="spaces-panel main-page hidden" id="spacesPanel"><\/div>/);
  assert.match(html, /<div class="plugins-panel main-page hidden" id="pluginsPanel"><\/div>/);
  assert.match(html, /<div class="scheduled-panel main-page hidden" id="scheduledPanel"><\/div>/);
  assert.match(workspacePage, /page === 'library' \? 'libraryPanel' : page === 'projects' \? 'spacesPanel' : 'pluginsPanel'/);
  assert.match(mountSpecs, /page === 'library' \? 'libraryPanel' : page === 'projects' \? 'spacesPanel' : 'pluginsPanel'/);
  /* The fallback-shell compatibility layer went away with the last static
     workspace shell — it must not be reintroduced. */
  assert.equal(mainJs.includes('workspace-reference-ui'), false, 'workspace-reference-ui import must stay removed');
  assert.equal(workspacePage.includes('data-live-directory'), false, 'data-live-directory compat attribute must stay removed');
  await assert.rejects(access(new URL('src/ui/workspace-reference-ui.js', root)), 'workspace-reference-ui.js must stay deleted');
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
