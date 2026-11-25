import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('the app exposes the split stylesheet bundle in cascade order', async () => {
  const html = await read('index.html');
  const links = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map(
    (match) => match[1],
  );
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
    '/src/styles/features/creation.css',
    '/src/styles/critical-4.css',
    '/src/styles/polish/overlays.css',
    '/src/styles/polish/workspace.css',
    '/src/styles/critical-5.css',
    '/src/styles/polish/press.css',
    '/src/styles/critical-6.css',
    '/src/styles/polish/settings-page.css',
    '/src/styles/critical-7.css',
    '/src/styles/themes.css',
  ]);
});

test('the restore compatibility tree is retired', async () => {
  await assert.rejects(
    access(new URL('src/styles/restore', root)),
    'styles/restore must stay deleted',
  );
  const css = await read('src/styles/index.css');
  assert.equal(css.includes('restore/'), false, 'the cascade must not re-import restore/');
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
    await assert.rejects(
      access(new URL(`src/styles/${legacy}`, root)),
      `${legacy} must stay deleted`,
    );
  }
});

test('migrated workspace panels are single React-owned page hosts', async () => {
  const [
    html,
    workspacePage,
    pageMounts,
    navJs,
    navService,
    navAdapters,
    mainJs,
    destinations,
    libraryUploadInput,
  ] = await Promise.all([
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
  assert.equal(
    html.includes('id="libraryList"'),
    false,
    'legacy inner Library host must stay removed',
  );
  assert.equal(
    html.includes('id="spacesList"'),
    false,
    'legacy inner Projects host must stay removed',
  );
  assert.equal(
    html.includes('id="pluginsList"'),
    false,
    'legacy inner Plugins host must stay removed',
  );
  assert.equal(
    html.includes('id="scheduledList"'),
    false,
    'legacy inner Scheduled host must stay removed',
  );
  assert.equal(
    html.includes('id="adminPanelBody"'),
    false,
    'legacy inner Admin host must stay removed',
  );
  assert.match(
    html,
    /<div class="library-panel main-page hidden" id="libraryPanel"><\/div>\s*<div id="libraryUploadReactRoot"><\/div>/,
  );
  assert.equal(
    html.includes('id="libraryUploadInput"'),
    false,
    'React owns the Library upload input',
  );
  assert.match(libraryUploadInput, /id="libraryUploadInput"/);
  assert.match(html, /<div class="spaces-panel main-page hidden" id="spacesPanel"><\/div>/);
  assert.match(html, /<div class="plugins-panel main-page hidden" id="pluginsPanel"><\/div>/);
  assert.match(html, /<div class="scheduled-panel main-page hidden" id="scheduledPanel"><\/div>/);
  assert.match(html, /<div class="admin-panel main-page hidden" id="adminPanel"><\/div>/);
  /* The chat surface has a single owner: #chatPage wraps the transcript
     (#msgList) and the composer column (#chatView), with DOM order
     matching the visual order (transcript first). */
  assert.match(
    html,
    /<div class="chat-page hidden" id="chatPage">\s*<div class="msg-list" id="msgList"><\/div>\s*<div class="chat-view chat-view-lifted hidden" id="chatView">/,
  );
  /* ADR 0022: navigation.destinations.ts is the single source of truth for
     the route→host mapping. The workspace page must read its panel host from
     that table, and the old inline duplication must not come back. */
  assert.match(workspacePage, /from ['"][^'"]*navigation\.destinations['"]/);
  assert.match(workspacePage, /DESTINATIONS\[page\]\.host/);
  assert.equal(
    /page === 'library' \? 'libraryPanel' : page === 'projects' \? 'spacesPanel' : 'pluginsPanel'/.test(
      workspacePage,
    ),
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
  for (const inlineHost of [
    "library: 'libraryPanel'",
    "projects: 'spacesPanel'",
    "plugins: 'pluginsPanel'",
  ]) {
    assert.equal(
      pageMounts.includes(inlineHost),
      false,
      `inline host map ${inlineHost} must stay removed in favour of the shared destinations table`,
    );
  }
  assert.match(navJs, /from ["']\.\/navigation\.service\.ts["']/);
  assert.match(navAdapters, /from ["']\.\.\/react\/lib\/boot\/pageMounts\.ts["']/);
  assert.match(navService, /adapters\[destination\]\?\.\(\)/);
  for (const global of [
    '__socratesMountWorkspace',
    '__socratesMountScheduled',
    '__socratesMountAdmin',
    '__socratesNavRenderScheduled',
  ]) {
    assert.equal(navJs.includes(global), false, `${global} compat global must stay removed`);
    assert.equal(navAdapters.includes(global), false, `${global} compat global must stay removed`);
    assert.equal(pageMounts.includes(global), false, `${global} compat global must stay removed`);
  }
  /* The fallback-shell compatibility layer went away with the last static
     workspace shell — it must not be reintroduced. */
  assert.equal(
    mainJs.includes('workspace-reference-ui'),
    false,
    'workspace-reference-ui import must stay removed',
  );
  assert.equal(
    workspacePage.includes('data-live-directory'),
    false,
    'data-live-directory compat attribute must stay removed',
  );
  await assert.rejects(
    access(new URL('src/legacy/workspace-reference-ui.js', root)),
    'workspace-reference-ui.js must stay deleted',
  );
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

test('converged surfaces keep their canonical stylesheet ownership', async () => {
  const [sidebar, sharedSidebar, menu, composer, settings, overlays, preview, legacyActivity] =
    await Promise.all([
      read('src/styles/parity/sidebar.css'),
      read('src/styles/polish/sidebar.css'),
      read('src/styles/components/menu.css'),
      read('src/styles/polish/composer.css'),
      read('src/styles/polish/settings-page.css'),
      read('src/styles/polish/overlays.css'),
      read('src/styles/components/docPreview.css'),
      read('src/styles/legacy/15-thinking-activity.css'),
    ]);
  assert.match(sidebar, /#appShell #sidebarHeader/);
  assert.doesNotMatch(sharedSidebar, /@media\s*\(min-width:\s*769px\)/);
  assert.match(menu, /#composerToolsMenu\.composer-tools-menu\[data-menu-side='sheet'\]/);
  assert.doesNotMatch(composer, /#composerToolsMenu/);
  const composerFrame = await read('src/styles/parity/composer-unified.css');
  assert.match(composer, /#composerAttachmentChips \.attachment-chip\.is-leaving/);
  assert.match(composer, /#composerAttachmentChips \.attachment-chip\.is-image/);
  assert.doesNotMatch(composerFrame, /\.attachment-chip(?!s)/);
  assert.doesNotMatch(composer, /\.attachment-chip-(?:progress|pct)\b/);
  assert.match(settings, /\.settings-page \.settings-shell/);
  assert.match(settings, /\.settings-memory-list/);
  assert.doesNotMatch(overlays, /\.settings-page|\.settings-memory-list|\.tone-preset-options/);
  assert.match(preview, /\.library-file-preview-card/);
  assert.doesNotMatch(legacyActivity, /\.library-file-preview-card/);
});

test('sidebar history geometry and drawer paint stay in their canonical owners', async () => {
  const [desktop, phone] = await Promise.all([
    read('src/styles/parity/sidebar.css'),
    read('src/styles/polish/mobile-sidebar.css'),
  ]);
  const historyGeometry = desktop.match(/#appShell #sidebar \.recent-item\s*\{[^}]*height: var\(--sidebar-row\);[^}]*\}/g) || [];
  assert.equal(historyGeometry.length, 1);
  assert.match(historyGeometry[0], /border-radius: var\(--ui-radius-sidebar-row\)/);
  const drawerPaint = phone.slice(phone.indexOf('/* Phone navigation uses the same semantic'));
  assert.match(drawerPaint, /--sidebar-nav-bg: var\(--ui-bg-hover\)/);
  assert.match(drawerPaint, /--sidebar-nav-bg: var\(--ui-bg-active\)/);
  assert.doesNotMatch(drawerPaint, /--sidebar-nav-bg: rgb\(/);
});

test('header and transcript fades keep one paint recipe per surface', async () => {
  const [topbar, phoneTopbar, transcript, details, chat] = await Promise.all([
    read('src/styles/parity/topbar.css'),
    read('src/styles/polish/topbar.css'),
    read('src/styles/parity/transcript.css'),
    read('src/styles/polish/transcript.css'),
    read('src/styles/components/chat.css'),
  ]);
  assert.equal((topbar.match(/background: linear-gradient\(/g) || []).length, 1);
  assert.doesNotMatch(phoneTopbar, /#pluginWorkspaceTabs\s*\{/);
  for (const [css, token] of [
    [transcript, '--transcript-edge-mask'],
    [details, '--stream-tail-mask'],
    [chat, '--phone-transcript-mask'],
  ]) {
    assert.ok(css.includes(`${token}: linear-gradient(`));
    assert.ok(css.includes(`-webkit-mask-image: var(${token});`));
    assert.ok(css.includes(`mask-image: var(${token});`));
  }
});

test('Page Kit owns shared section, collection and card defaults', async () => {
  const [kit, pages] = await Promise.all([
    read('src/styles/features/page-kit.css'),
    read('src/styles/polish/app-pages.css'),
  ]);
  for (const selector of [
    '.ui-page-toolbar-end',
    '.ui-page-section',
    '.ui-page-section-head',
    '.ui-collection',
    '.ui-collection-body',
    '.ui-card-grid',
    '.ui-page-card',
    '.ui-page-card-main',
  ]) {
    const rule = '#appShell ' + selector + ' {';
    assert.ok(kit.includes(rule), `Page Kit must own ${selector}`);
    // Responsive rules are allowed to specialize defaults, not redeclare
    // a second unscoped desktop base at the top level.
    assert.ok(!pages.split('\n').some((line) => line === rule), `Duplicate base: ${selector}`);
  }
});

test('Page Kit and menu component own their shared base presentation', async () => {
  const [kit, pages, menu, overlays] = await Promise.all([
    read('src/styles/features/page-kit.css'),
    read('src/styles/polish/app-pages.css'),
    read('src/styles/components/menu.css'),
    read('src/styles/polish/overlays.css'),
  ]);
  for (const selector of [
    '#appShell .ui-page-search {',
    "#appShell .ui-page-empty[data-slot='empty'] {",
    "#appShell .ui-page-empty [data-slot='empty-title'] {",
  ]) {
    assert.ok(kit.includes(selector), `Missing Page Kit owner: ${selector}`);
    assert.ok(!pages.split('\n').includes(selector), `Duplicate desktop base: ${selector}`);
  }
  assert.match(menu, /\.chat-config-pop\s*\{/);
  assert.match(menu, /\.chat-config-row\s*\{/);
  assert.doesNotMatch(overlays, /\.chat-config-pop\s*\{|\.chat-config-row\s*\{/);
});

test('formula scrolling uses canonical theme tokens and one geometry owner', async () => {
  const [chat, legacy, scaffolds, interactive] = await Promise.all([
    read('src/styles/components/chat.css'),
    read('src/styles/legacy/09-viz-markdown.css'),
    read('src/styles/features/learn-scaffolds.css'),
    read('src/styles/components/intelligent-ui.css'),
  ]);
  assert.doesNotMatch(legacy, /\.katex(?:-display)?\s*\{|\.math-stream-pending\s*\{/);
  assert.match(chat, /\.katex-display > \.katex\s*\{[^}]*width: max-content;/);
  assert.match(chat, /scrollbar-color: var\(--ui-scrollbar-thumb-hover\) transparent/);
  assert.match(chat, /\.math-stream-pending\s*\{[^}]*var\(--ui-text-tertiary\)/);
  assert.doesNotMatch(scaffolds, /\.sc-rich \.katex-display\s*\{[^}]*overflow-x:/);
  assert.doesNotMatch(interactive, /\.katex-display > \.katex\s*\{[^}]*font-size:/);
});

test('external link favicons have one chat style owner and retired chat tokens stay absent', async () => {
  const [chat, legacy] = await Promise.all([
    read('src/styles/components/chat.css'),
    read('src/styles/legacy/16-final-contract.css'),
  ]);
  assert.match(chat, /a\.has-site-favicon\s*\{/);
  assert.match(chat, /\.site-link-favicon\.is-unavailable\s*\{/);
  assert.doesNotMatch(legacy, /\.site-link-favicon\s*\{/);
  assert.doesNotMatch(
    legacy,
    /--chat-(?:bubble-pad-[xy]|code-header-pad-[xy]|tool-running|tool-error):/,
  );
});

test('legacy button utilities use paint-only press feedback and tag editor has one input owner', async () => {
  const [buttons, menu, overlays] = await Promise.all([
    read('src/styles/polish/buttons.css'),
    read('src/styles/components/menu.css'),
    read('src/styles/polish/overlays.css'),
  ]);
  assert.doesNotMatch(buttons, /(?:^|\n)\s*(?:transform|scale):/);
  assert.match(menu, /\.tag-editor-popover input\s*\{/);
  assert.doesNotMatch(overlays, /\.tag-editor-popover input\s*\{/);
});

test('retired attachment markup cannot return to legacy or composer CSS', async () => {
  const [legacy, composer, cards] = await Promise.all([
    read('src/styles/legacy/07-composer-settings.css'),
    read('src/styles/polish/composer.css'),
    read('src/styles/components/chat.css'),
  ]);
  assert.doesNotMatch(legacy, /\.attachment-chip(?:s)?(?![-\w])/);
  assert.doesNotMatch(composer, /\.attachment-chip-(?:info|name|meta|progress|pct)\b/);
  assert.doesNotMatch(composer, /\.attachment-chip\.is-file\s+\.attachment-chip-/);
  assert.match(cards, /\.file-card-caption\s*\{/);
  assert.match(composer, /#composerAttachmentChips \.attachment-chip\.is-leaving/);
});

test('retired plugin workspace tabs have no DOM, observers or historical CSS', async () => {
  const files = [
    'src/react/topbar/TopBar.tsx',
    'src/sidebar/nav.ts',
    'src/legacy/mainViewController.ts',
    'src/styles/layout/app-shell.css',
    'src/styles/legacy/06-chat-transcript.css',
  ];
  for (const file of files) {
    assert.doesNotMatch(
      await read(file),
      /pluginWorkspace(?:Tabs|PluginsTab|SkillsTab)|\.top-mode-tabs\b/,
    );
  }
});

test('header uses React state rather than retired DOM chrome mirrors', async () => {
  const files = [
    'src/react/topbar/TopBar.tsx',
    'src/legacy/mainViewController.ts',
    'src/legacy/share.impl.ts',
    'src/styles/legacy/06-chat-transcript.css',
  ];
  for (const file of files) {
    assert.doesNotMatch(
      await read(file),
      /mobileIncognitoBtn|\.chat-top-bar\b|setConversationChrome\b|#chatStats\b/,
    );
  }
});

test('scheduled recommendation cards have one stylesheet owner', async () => {
  const pages = await read('src/styles/polish/app-pages.css');
  assert.match(pages, /\.scheduled-recommendation-copy small\s*\{/);
  assert.match(pages, /\.scheduled-recommendation-add\s*\{/);
  for (const file of ['src/styles/features/surfaces.css']) {
    assert.doesNotMatch(await read(file), /\.scheduled-recommendation(?:s|-[\w-]+)?\b/);
  }
});
