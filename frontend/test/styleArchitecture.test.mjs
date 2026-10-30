import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('the app exposes the split stylesheet bundle in cascade order', async () => {
  const html = await read('index.html');
  const links = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)]
    .map((match) => match[1]);
  // P_perf-css-split — the 955 KB single entry is delivered as ordered
  // slices (critical-* render-blocking, below-fold leaves via
  // media=print swap). Order reproduces styles/index.css file-for-file
  // (machine-checked by check-css-debt.mjs); themes.css still closes
  // the cascade exactly once and last.
  assert.deepEqual(links, [
    '/src/styles/critical-1.css',
    '/src/styles/legacy/02-modals-library.css',
    '/src/styles/legacy/03-workspace-panels.css',
    '/src/styles/critical-2.css',
    '/src/styles/legacy/08-exam.css',
    '/src/styles/critical-3.css',
    '/src/styles/restore/creation-surfaces.css',
    '/src/styles/critical-4.css',
    '/src/styles/polish/overlays.css',
    '/src/styles/polish/workspace.css',
    '/src/styles/critical-5.css',
    '/src/styles/polish/press.css',
    '/src/styles/critical-6.css',
    '/src/styles/themes.css',
  ]);
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
  const [html, workspacePage, pageMounts, navJs, navService, navAdapters, mainJs, destinations, libraryUploadInput] = await Promise.all([
    read('index.html'),
    read('src/react/pages/workspace/WorkspacePage.tsx'),
    read('src/react/lib/boot/pageMounts.ts'),
    read('src/sidebar/nav.ts'),
    read('src/sidebar/navigation.service.ts'),
    read('src/sidebar/navigation.adapters.ts'),
    read('src/main.ts'),
    read('src/sidebar/navigation.destinations.ts'),
    read('src/react/pages/workspace/LibraryUploadInput.tsx'),
  ]);
  assert.equal(html.includes('id="libraryList"'), false, 'legacy inner Library host must stay removed');
  assert.equal(html.includes('id="spacesList"'), false, 'legacy inner Projects host must stay removed');
  assert.equal(html.includes('id="pluginsList"'), false, 'legacy inner Plugins host must stay removed');
  assert.equal(html.includes('id="scheduledList"'), false, 'legacy inner Scheduled host must stay removed');
  assert.equal(html.includes('id="adminPanelBody"'), false, 'legacy inner Admin host must stay removed');
  assert.match(html, /<div class="library-panel main-page hidden" id="libraryPanel"><\/div>\s*<div id="libraryUploadReactRoot"><\/div>/);
  assert.equal(html.includes('id="libraryUploadInput"'), false, 'React owns the Library upload input');
  assert.match(libraryUploadInput, /id="libraryUploadInput"/);
  assert.match(html, /<div class="spaces-panel main-page hidden" id="spacesPanel"><\/div>/);
  assert.match(html, /<div class="plugins-panel main-page hidden" id="pluginsPanel"><\/div>/);
  assert.match(html, /<div class="scheduled-panel main-page hidden" id="scheduledPanel"><\/div>/);
  assert.match(html, /<div class="admin-panel main-page hidden" id="adminPanel"><\/div>/);
  /* The chat surface has a single owner: #chatPage wraps the transcript
     (#msgList) and the composer column (#chatView), with DOM order
     matching the visual order (transcript first). */
  assert.match(html, /<div class="chat-page hidden" id="chatPage">\s*<div class="msg-list" id="msgList"><\/div>\s*<div class="chat-view chat-view-lifted hidden" id="chatView">/);
  /* ADR 0022: navigation.destinations.ts is the single source of truth for
     the route→host mapping. The workspace page must read its panel host from
     that table, and the old inline duplication must not come back. */
  assert.match(workspacePage, /from ['"][^'"]*navigation\.destinations['"]/);
  assert.match(workspacePage, /DESTINATIONS\[page\]\.host/);
  assert.equal(
    /page === 'library' \? 'libraryPanel' : page === 'projects' \? 'spacesPanel' : 'pluginsPanel'/.test(workspacePage),
    false,
    'inline panel-host ternary must stay removed in favour of the shared destinations table',
  );
  assert.match(destinations, /library: \{ path: '\/library', host: 'libraryPanel' \}/);
  assert.match(destinations, /projects: \{ path: '\/projects', host: 'spacesPanel' \}/);
  assert.match(destinations, /plugins: \{ path: '\/plugins', host: 'pluginsPanel' \}/);
  /* Page mounting is a module API. The adapter module imports pageMounts.ts,
     while nav.js routes through navigation.service; window.__socratesMount*
     compatibility globals must not come back. */
  assert.match(pageMounts, /from ['"][^'"]*navigation\.destinations['"]/);
  assert.match(pageMounts, /loadPage\(DESTINATIONS\[page\]\.host/);
  for (const inlineHost of ["library: 'libraryPanel'", "projects: 'spacesPanel'", "plugins: 'pluginsPanel'"]) {
    assert.equal(pageMounts.includes(inlineHost), false, `inline host map ${inlineHost} must stay removed in favour of the shared destinations table`);
  }
  assert.match(navJs, /from ["']\.\/navigation\.service\.ts["']/);
  assert.match(navAdapters, /from ["']\.\.\/react\/lib\/boot\/pageMounts\.ts["']/);
  assert.match(navService, /adapters\[destination\]\?\.\(\)/);
  for (const global of ['__socratesMountWorkspace', '__socratesMountScheduled', '__socratesMountAdmin', '__socratesNavRenderScheduled']) {
    assert.equal(navJs.includes(global), false, `${global} compat global must stay removed`);
    assert.equal(navAdapters.includes(global), false, `${global} compat global must stay removed`);
    assert.equal(pageMounts.includes(global), false, `${global} compat global must stay removed`);
  }
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
