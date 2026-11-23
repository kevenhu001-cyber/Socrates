import { test, expect } from './_state-fixture.mjs';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { ACTIVE_CLASS, gotoAndSettle, login, publishChatRuntime } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

test('download-first UI fonts preload one variable face without duplicate transfers', async ({
  page,
}) => {
  await mockAuthedApp(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await gotoAndSettle(page, '/');
  await login(page);
  // The browser fixture starts in English. Exercise actual CJK glyphs before
  // checking their font; an English-only landing must not fetch CJK subsets.
  await page.locator('#composerInputWrap .tiptap').fill('中文字体优先下载');
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource');
    const fonts = resources.filter((entry) => /geist-sans.*\.woff2/.test(entry.name));
    const cjkFonts = resources.filter((entry) => /noto-sans-sc-\d+-.*\.woff2/.test(entry.name));
    /* Full-width CJK punctuation is the user-visible property that a wrong
       family order breaks: Geist carries narrow Latin-proportioned glyphs for
       U+FF0C, so a half-width comma is the symptom of a stack that never
       reaches a CJK face. Measure the advance instead of trusting the string. */
    const probe = document.createElement('span');
    probe.textContent = '，';
    probe.style.cssText = 'position:absolute;visibility:hidden;font:16px/1 var(--font-sans)';
    document.body.appendChild(probe);
    const commaWidth = probe.getBoundingClientRect().width;
    probe.remove();
    return {
      count: fonts.length,
      initiator: fonts[0]?.initiatorType,
      preload: document.querySelectorAll('link[rel="preload"][as="font"]').length,
      family: getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim(),
      cjkFonts: cjkFonts.map((entry) => new URL(entry.name).origin),
      appOrigin: location.origin,
      commaWidth,
    };
  });
  expect(result.count).toBe(1);
  expect(result.initiator).toBe('link');
  expect(result.preload).toBe(1);
  /* Platform CJK faces stay ahead of the self-hosted Noto subset: a Mac or
     Windows reader renders Chinese from PingFang/YaHei without downloading
     ~560KB of Noto, while Linux (the test runner) still reaches Noto before
     the generic fallback. */
  expect(result.family).toMatch(
    /^"Geist Sans", .*"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", "Noto Sans SC", system-ui, sans-serif$/,
  );
  /* Platform CJK faces may satisfy the glyphs entirely; what must never
     happen is a third-party font origin. */
  expect([...new Set(result.cjkFonts)].filter((origin) => origin !== result.appOrigin)).toEqual([]);
  const devTools = await page.context().newCDPSession(page);
  await devTools.send('DOM.enable');
  await devTools.send('CSS.enable');
  const { root } = await devTools.send('DOM.getDocument');
  const { nodeId } = await devTools.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '#composerInputWrap .tiptap p',
  });
  const { fonts: renderedFonts } = await devTools.send('CSS.getPlatformFontsForNode', { nodeId });
  expect(renderedFonts).toEqual([expect.objectContaining({ glyphCount: 8 })]);
  await devTools.detach();
  expect(result.commaWidth).toBeGreaterThan(14);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/download-first-fonts.png' });
});

test('ordinary prose defers rich UI; slow renderer loading preserves prose and latest tool data', async ({
  page,
}) => {
  const report = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../dist/.vite/entry-graph.json'), 'utf8'),
  );
  const renderer = report.modules.find(
    (item) => item.id === 'src/react/intelligent-ui/IntelligentUiNodes.tsx',
  );
  let requested = false;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(`**/${renderer.chunk}`, async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  try {
    await prepareChatWorkbench(page, {
      messages: [
        {
          clientId: 'lazy-ui-prose',
          role: 'assistant',
          type: 'assistant',
          rawText: 'The explanation stays readable.',
          html: '<p>The explanation stays readable.</p>',
        },
      ],
    });
    await expect(page.locator('#msgList')).toContainText('The explanation stays readable.');
    await expect(page.locator('#composerInputWrap .tiptap')).toBeVisible();
    expect(requested).toBe(false);

    const updateUi = async (value) => {
      await page.evaluate((nextValue) => {
        const prose = window.__socratesTestState.session().messages[0];
        window.__socratesTestState.patch({
          session: {
            messages: [
              prose,
              {
                clientId: 'lazy-ui-tool',
                role: 'assistant',
                type: 'assistant',
                rawText: '',
                html: '',
                toolCalls: [
                  {
                    id: 'lazy-ui-call',
                    name: 'render_intelligent_ui',
                    status: 'completed',
                    textOffset: 0,
                    output: '',
                    input: {
                      version: 1,
                      nodes: [
                        {
                          id: 'lazy-metric',
                          type: 'metric',
                          label: 'Latest estimate',
                          value: nextValue,
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        });
      }, value);
      await publishChatRuntime(page, { type: 'state-synced', reason: 'lazy-ui-fixture' });
    };
    await updateUi(42);
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator('.intui[role="status"]')).toBeVisible();
    await expect(page.locator('#msgList')).toContainText('The explanation stays readable.');
    await page.screenshot({ path: 'test-results/entry-lazy-ui-loading.png' });
    await updateUi(99);
    release();
    await expect(page.locator('.intui-metric')).toContainText('Latest estimate');
    await expect(page.locator('.intui-metric')).toContainText('99');
    await expect(page.locator('.intui[role="status"]')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/entry-lazy-ui-ready.png' });
  } finally {
    release();
  }
});

test('production entry keeps the static closure gzip transfer under budget', () => {
  const dist = resolve(import.meta.dirname, '..', 'dist');
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
  const report = JSON.parse(readFileSync(resolve(dist, '.vite/entry-graph.json'), 'utf8'));
  const chunks = new Map(report.chunks.map((chunk) => [chunk.file, chunk]));
  // Recompute the closure from the HTML instead of trusting eager flags.
  const scripts = new Set(
    [...html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+\.js)"/g)].map((match) => match[1]),
  );
  for (const file of scripts) {
    expect(chunks.has(file), `missing graph for ${file}`).toBe(true);
    for (const dependency of chunks.get(file).imports) scripts.add(dependency);
  }
  const styles = new Set(
    [...html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+\.css)"/g)].map((match) => match[1]),
  );
  const sum = (files) =>
    [...files].reduce(
      (total, file) => total + gzipSync(readFileSync(resolve(dist, file))).length,
      0,
    );
  const metrics = {
    htmlGzipBytes: gzipSync(Buffer.from(html)).length,
    staticJsGzipBytes: sum(scripts),
    linkedCssGzipBytes: sum(styles),
  };
  expect(metrics).toEqual(report.metrics);
  expect(metrics.htmlGzipBytes).toBeLessThan(19_000);
  /* The original 360 KB entry budget is restored after moving locale tables,
     low-frequency React control hosts, and the session-list RN shell out of
     the static import closure. Keep this guard at its original limit; the
     total-closure cap below is unchanged. */
  expect(metrics.staticJsGzipBytes).toBeLessThan(360_000);
  expect(metrics.linkedCssGzipBytes).toBeLessThan(210_000);
  expect(Object.values(metrics).reduce((sum, bytes) => sum + bytes, 0)).toBeLessThan(588_000);

  const lazyOnly = [
    'src/react/intelligent-ui/IntelligentUiNodes.tsx',
    'src/react/extensions/WorkflowLayer.tsx',
    'src/react/find-in-session/FindInSession.tsx',
    'src/chat/streamAttempt.ts',
    'src/legacy/share.impl.ts',
    'src/react/cheatsheet/Cheatsheet.tsx',
    'src/react/storageModal/StorageModal.tsx',
    'src/legacy/promptTemplates.impl.ts',
    'src/react/settings/GeneralSettingsPane.tsx',
    'src/react/settings/ModelsSettingsPane.tsx',
    'src/react/settings/DisplaySettingsPane.tsx',
    'src/react/settings/PersonalizationSettingsPane.tsx',
    'src/react/settings/AccountSettingsPane.tsx',
    'src/react/session-list/SessionList.tsx',
    'src/react/session-list/SessionTimeline.tsx',
    'src/react/session-list/SessionRow.tsx',
    'src/react/session-list/VirtualSessionTimeline.tsx',
  ];
  for (const id of lazyOnly) {
    const module = report.modules.find((item) => item.id === id);
    expect(module, `retained lazy module ${id}`).toBeTruthy();
    expect(scripts.has(module.chunk), `${id} leaked into static closure`).toBe(false);
  }
  expect([...scripts].some((file) => /vendor-(?:editor|tldraw|three)-/.test(file))).toBe(false);
});

test('settings and workspace code load only when opened', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await login(page);

  const loadedScripts = () =>
    page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => new URL(entry.name).pathname)
        .filter((path) => path.endsWith('.js')),
    );
  const newlyLoadedScripts = (before, after) => after.some((path) => !before.includes(path));
  const initial = await loadedScripts();

  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  await expect(page.locator('#settingsPage')).toBeVisible();
  const afterSettings = await loadedScripts();
  expect(newlyLoadedScripts(initial, afterSettings)).toBe(true);

  await page.evaluate(() => window.__socratesLegacy.navigation.closeSettings());
  await page.click('#navLibrary');
  await expect(page.locator('#libraryPanel')).not.toHaveAttribute('aria-busy', 'true');
  const afterWorkspace = await loadedScripts();
  expect(newlyLoadedScripts(afterSettings, afterWorkspace)).toBe(true);
});

test('settings page and first pane preload on trigger intent before the click', async ({
  page,
}) => {
  const report = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../dist/.vite/entry-graph.json'), 'utf8'),
  );
  const modal = report.modules.find(
    (module) => module.id === 'src/react/settings/SettingsPage.tsx',
  );
  const general = report.modules.find(
    (module) => module.id === 'src/react/settings/GeneralSettingsPane.tsx',
  );
  expect(modal).toBeTruthy();
  expect(general).toBeTruthy();
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await login(page);

  const loadedScripts = () =>
    page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => new URL(entry.name).pathname)
        .filter((path) => path.endsWith('.js')),
    );
  const trigger = page.locator('#apiSettingsBtn');
  const beforeIntent = await loadedScripts();
  expect(beforeIntent.some((path) => path.endsWith(modal.chunk))).toBe(false);
  expect(beforeIntent.some((path) => path.endsWith(general.chunk))).toBe(false);

  await trigger.hover();
  await expect
    .poll(async () => {
      const paths = await loadedScripts();
      return (
        paths.some((path) => path.endsWith(modal.chunk)) &&
        paths.some((path) => path.endsWith(general.chunk))
      );
    })
    .toBe(true);
  await trigger.click();
  await expect(page.locator('#settingsPage')).toBeVisible();
  await expect(page.locator('.settings-pane:visible h2')).toHaveText('General');
});

test('signed-in boot takes the head prefetch and adds only the pinned lookup', async ({ page }) => {
  const rows = [
    {
      id: 'sess-alpha',
      title: 'Alpha',
      topic: 'alpha',
      updated_at: 1_700_000_000_000,
      created_at: 1_699_000_000_000,
      total_q: 2,
    },
    {
      id: 'sess-beta',
      title: 'Beta',
      topic: 'beta',
      updated_at: 1_699_500_000_000,
      created_at: 1_699_000_000_000,
      total_q: 1,
    },
  ];
  await mockAuthedApp(page, { sessions: { sessions: rows } });
  const sessionGets = [];
  await page.route(/\/api\/(?:v2\/)?sessions(?:\?|$)/, (route) => {
    if (route.request().method() === 'GET') sessionGets.push(route.request().url());
    return route.fallback();
  });
  await gotoAndSettle(page, '/');
  await login(page);
  await waitForAppShell(page);
  /* The sidebar must show the prefetched rows... */
  await expect(page.locator('#recentsList, .recents-list, #recents').first()).toContainText(
    'Alpha',
    { timeout: 15_000 },
  );
  /* ...and the first page comes from the head prefetch, not a second
     identical fetch. Paged history adds one separate pinned lookup so the
     pinned index can exist without downloading the archive. */
  expect(sessionGets.length).toBe(2);
  const firstPage = sessionGets.filter((url) => !url.includes('pinnedOnly=true'));
  const pinned = sessionGets.filter((url) => url.includes('pinnedOnly=true'));
  expect(firstPage).toHaveLength(1);
  expect(firstPage[0]).toContain('limit=40');
  expect(firstPage[0]).toContain('cursorVersion=2');
  expect(pinned).toHaveLength(1);
  expect(pinned[0]).toContain('limit=200');
});

test('anonymous boot checks the session once', async ({ page }) => {
  await mockAuthedApp(page);
  let sessionChecks = 0;
  await page.route(/\/api\/(?:v2\/)?auth\/me(?:\?|$)/, (route) => {
    sessionChecks += 1;
    return route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{"error":"unauthorized"}',
    });
  });
  await gotoAndSettle(page, '/');
  await expect(page.locator('#authGate')).toBeVisible();
  expect(sessionChecks).toBe(1);
});

test('session check starts before slow config finishes', async ({ page }) => {
  await mockAuthedApp(page);
  let configFinished = false;
  let sessionStartedEarly = false;
  await page.route(/\/api\/v2\/config(?:\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    configFinished = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"hasBeagleKey":true}',
    });
  });
  await page.route(/\/api\/v2\/auth\/me(?:\?|$)/, (route) => {
    sessionStartedEarly = !configFinished;
    return route.fallback();
  });
  await gotoAndSettle(page, '/');
  await expect(page.locator('#authGate')).toBeHidden();
  expect(sessionStartedEarly).toBe(true);
});

test('late workspace imports cannot reveal an inactive page', async ({ page }) => {
  const report = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../dist/.vite/entry-graph.json'), 'utf8'),
  );
  const workspace = report.modules.find(
    (module) => module.id === 'src/react/pages/workspace/WorkspacePage.tsx',
  );
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route(`**/${workspace.chunk}`, async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  try {
    await mockAuthedApp(page);
    await gotoAndSettle(page, '/');
    await login(page);
    await page.locator('#navLibrary').click();
    await expect.poll(() => requested).toBe(true);
    await page.locator('#navProjects').click();
    release();
    await expect(page.locator('.projects-directory')).toBeVisible();
    await expect(page.locator('#libraryPanel')).toBeHidden();
    await expect(page.locator('#navProjects')).toHaveClass(ACTIVE_CLASS);
    await expect(page).toHaveURL(/\/projects$/);
  } finally {
    release();
  }
});

test('late creation imports cannot replace a newer navigation destination', async ({ page }) => {
  const report = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../dist/.vite/entry-graph.json'), 'utf8'),
  );
  const creation = report.modules.find((module) => module.id === 'src/legacy/creationSurfaces.ts');
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route(`**/${creation.chunk}`, async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  try {
    await mockAuthedApp(page);
    await gotoAndSettle(page, '/');
    await login(page);
    await page.evaluate(() => window.__socratesLegacy.navigation.openNav('sites'));
    await expect.poll(() => requested).toBe(true);
    await page.locator('#navLibrary').click();
    release();
    await expect(page.locator('.library-directory')).toBeVisible();
    await expect(page.locator('#sitesPanel')).toBeHidden();
    await expect(page.locator('#navLibrary')).toHaveClass(ACTIVE_CLASS);
    await expect(page).toHaveURL(/\/library$/);
  } finally {
    release();
  }
});
