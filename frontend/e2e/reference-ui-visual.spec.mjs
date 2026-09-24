import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* These screenshots are intentionally written to /tmp.  The spec checks the
   app-owned surfaces at the same mobile and desktop sizes as the supplied
   references without committing generated artefacts to the repository. */
const REFERENCE_CONNECTORS = [
  { id: 'gmail', name: 'Gmail', description: 'Read and manage Gmail.', capabilities: ['Mail'], authType: 'oauth', connection: { status: 'initiated', displayName: 'Study inbox' } },
  { id: 'github', name: 'GitHub', description: 'Triage PRs, issues, CI, and publish flows.', capabilities: ['Repositories', 'Issues'], authType: 'oauth', connection: { status: 'connected', displayName: 'Study org' } },
  { id: 'googledrive', name: 'Google Drive', description: 'Drive, Docs, Sheets or Slides.', capabilities: ['Files'], authType: 'oauth', connection: { status: 'initiated', displayName: 'Study files' } },
  { id: 'slack', name: 'Slack', description: 'Read and manage Slack.', capabilities: ['Messages'], authType: 'oauth', connection: { status: 'initiated', displayName: 'Study team' } },
  { id: 'outlook', name: 'Outlook Email', description: 'Triage Outlook inboxes.', capabilities: ['Mail'], authType: 'oauth', connection: { status: 'initiated', displayName: 'Study mail' } },
  { id: 'googlecalendar', name: 'Google Calendar', description: 'Use calendar context when planning.', capabilities: ['Events'], authType: 'oauth', connection: { status: 'initiated', displayName: 'Study calendar' } },
  { id: 'notion', name: 'Notion', description: 'Search pages and knowledge.', capabilities: ['Pages'], authType: 'oauth', connection: { status: 'initiated', displayName: 'Personal notes' } },
];

async function mockReferenceCatalog(page) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const apiUrl = url.replace('/api/v2/', '/api/');
    if (apiUrl.includes('/api/projects')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [{ id: 'socrates', name: 'Socrates', description: '一个用于整理学习对话的项目', color: '#7c9cff', createdAt: '2026-07-29T00:00:00.000Z' }] }),
      });
      return;
    }
    if (!apiUrl.includes('project-connectors')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ configured: true, connectors: REFERENCE_CONNECTORS }),
    });
  });
}

async function openSidebar(page) {
  const sidebar = page.locator('#sidebar');
  if (!(await sidebar.evaluate((node) => node.classList.contains('collapsed')))) return;
  await page.locator('#sidebarOpenBtn').click();
  await expect(sidebar).not.toHaveClass(/collapsed/);
}

test('reference app surfaces render at mobile and desktop target sizes', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await mockAuthedApp(page, { lang: 'zh' });
  await mockReferenceCatalog(page);

  await page.setViewportSize({ width: 390, height: 769 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) window.toggleSidebar?.();
  });
  await expect.poll(async () => Math.round((await page.locator('#sidebar').boundingBox())?.x ?? 0)).toBe(-254);
  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect(page.locator('#modeSegmentedTop')).toBeVisible();
  await expect(page.locator('#topicInputWrap')).toBeVisible();
  await page.screenshot({ path: '/tmp/socrates-reference-mobile-home-390x769.png', fullPage: true });

  const mobileGeometry = await page.evaluate(() => {
    const read = (selector) => {
      const node = document.querySelector(selector);
      const box = node?.getBoundingClientRect();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
    };
    return {
      mode: read('#modeSegmentedTop'),
      composer: read('#topicInputWrap'),
      plus: read('#topicComposerToolsBtn'),
      send: read('#startBtn'),
      background: getComputedStyle(document.querySelector('.main-content')).backgroundColor,
    };
  });
  expect(mobileGeometry.mode?.width).toBeGreaterThanOrEqual(140);
  expect(mobileGeometry.mode?.width).toBeLessThanOrEqual(152);
  expect(mobileGeometry.mode?.height).toBe(32);
  expect(mobileGeometry.composer?.width).toBeGreaterThanOrEqual(320);
  expect(mobileGeometry.composer?.height).toBe(104);
  expect((mobileGeometry.composer?.y ?? 0) + (mobileGeometry.composer?.height ?? 0)).toBeLessThanOrEqual(755);
  expect(mobileGeometry.plus?.width).toBe(40);
  expect(mobileGeometry.send?.width).toBe(40);
  expect(mobileGeometry.background).toBe('rgb(0, 0, 0)');

  await page.locator('#topicComposerToolsBtn').click();
  const toolsMenu = page.locator('#composerToolsMenu');
  await expect(toolsMenu).toBeVisible();
  const toolsBox = await toolsMenu.boundingBox();
  expect(toolsBox?.width).toBeGreaterThanOrEqual(292);
  expect(toolsBox?.width).toBeLessThanOrEqual(308);
  expect(toolsBox?.height).toBeGreaterThanOrEqual(300);
  expect(toolsBox?.height).toBeLessThanOrEqual(368);
  expect(toolsBox?.x).toBeGreaterThanOrEqual(15);
  expect(toolsBox?.x).toBeLessThanOrEqual(17);
  expect(Math.abs(
    ((toolsBox?.y ?? 0) + (toolsBox?.height ?? 0))
      - ((mobileGeometry.composer?.y ?? 0) + (mobileGeometry.composer?.height ?? 0)),
  )).toBeLessThanOrEqual(2);
  const toolsBackground = await toolsMenu.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(toolsBackground).not.toBe('rgba(0, 0, 0, 0)');
  await page.mouse.move(380, 4);
  const mobileActions = toolsMenu.locator('.composer-tools-mobile-items [data-composer-action]');
  expect(await mobileActions.count()).toBeGreaterThanOrEqual(5);
  await expect(toolsMenu.locator('.composer-tools-mobile-items [data-composer-action="createImage"]')).toBeVisible();
  await expect(toolsMenu.locator('.composer-tools-mobile-items [data-composer-action="webSearch"]')).toBeVisible();
  await page.screenshot({ path: '/tmp/socrates-reference-mobile-tools-390x769.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(toolsMenu).toBeHidden();

  await openSidebar(page);
  await expect.poll(async () => Math.round((await page.locator('#sidebar').boundingBox())?.width ?? 0)).toBe(254);
  await expect.poll(async () => Math.round((await page.locator('#sidebar').boundingBox())?.x ?? -254)).toBe(0);
  await expect(page.locator('#sidebarSearchBtn')).toBeVisible();
  await expect(page.locator('#sidebarCloseBtn')).toBeVisible();
  await page.screenshot({ path: '/tmp/socrates-reference-mobile-sidebar-390x769.png', fullPage: true });
  await page.evaluate(() => document.getElementById('navPlugins')?.click());
  await expect(page.locator('.plugin-directory')).toBeVisible();
  await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
  await expect(page.locator('#pluginWorkspaceTabs')).toBeVisible();
  await expect(page.locator('#modeSegmentedTop')).toBeHidden();
  await expect(page.locator('#pluginWorkspacePluginsTab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#pluginsPanel .plugins-panel-head')).toBeHidden();
  const pluginGeometry = await page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    };
    return {
      search: box('.plugin-directory-search'),
      installedLabel: box('.plugin-installed-label'),
      installedIcon: box('.plugin-installed-icons .workspace-row-icon'),
      tabs: box('.plugin-directory-tabs'),
      rowIcon: box('.plugin-directory-row .workspace-row-icon'),
    };
  });
  expect(pluginGeometry.search?.height).toBe(42);
  expect((pluginGeometry.installedLabel?.y ?? 0) + (pluginGeometry.installedLabel?.height ?? 0)).toBeLessThanOrEqual(pluginGeometry.installedIcon?.y ?? 0);
  expect(pluginGeometry.installedIcon?.width).toBe(40);
  expect(pluginGeometry.tabs?.y).toBeGreaterThan(315);
  expect(pluginGeometry.tabs?.y).toBeLessThan(410);
  expect(pluginGeometry.rowIcon?.width).toBe(40);
  await page.screenshot({ path: '/tmp/socrates-reference-mobile-plugins-390x769.png', fullPage: true });
  await page.locator('#pluginWorkspaceSkillsTab').click();
  await expect(page.locator('#promptTemplatesOverlay')).toBeVisible();
  await expect(page.locator('#pluginWorkspaceSkillsTab')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#promptTemplatesOverlay [data-prompt-command="close"]').click();
  await expect(page.locator('#promptTemplatesOverlay')).toHaveCount(0);
  await expect(page.locator('#pluginWorkspacePluginsTab')).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(() => document.getElementById('navProjects')?.click());
  await expect(page.locator('.projects-directory')).toBeVisible();
  await expect(page.locator('.project-row').filter({ hasText: 'Socrates' })).toBeVisible();
  await page.screenshot({ path: '/tmp/socrates-reference-mobile-projects-390x756.png', fullPage: true });
  await page.evaluate(() => document.getElementById('navScheduled')?.click());
  await expect(page.locator('.scheduled-directory')).toBeVisible();
  await expect(page.locator('.scheduled-recommendation')).toHaveCount(5);
  await page.screenshot({ path: '/tmp/socrates-reference-mobile-scheduled-390x756.png', fullPage: true });

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
    document.body.dataset.conversationActive = 'true';
  });
  await expect(page.locator('#chatInputWrap')).toBeVisible();
  const chatComposerBox = await page.locator('#chatInputWrap').boundingBox();
  const chatEditorBox = await page.locator('#chatComposerRoot').boundingBox();
  const chatToolsBox = await page.locator('#chatComposerToolsBtn').boundingBox();
  expect(chatComposerBox?.height).toBe(104);
  expect(chatToolsBox?.y ?? 0).toBeGreaterThan((chatEditorBox?.y ?? 0) + (chatEditorBox?.height ?? 0) - 4);
  await page.screenshot({ path: '/tmp/socrates-reference-mobile-chat-composer-390x769.png', fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar?.classList.contains('collapsed')) window.toggleSidebar?.();
    document.getElementById('navNew')?.click();
  });
  await expect(page.locator('#topicSetup')).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/tmp/socrates-reference-desktop-home-1440x900.png', fullPage: true });

  await page.locator('#topicComposerToolsBtn').click();
  const desktopToolsMenu = page.locator('#composerToolsMenu');
  await expect(desktopToolsMenu).toBeVisible();
  const desktopToolsBox = await desktopToolsMenu.boundingBox();
  expect(desktopToolsBox?.height).toBeLessThanOrEqual(900 / 2);
  const desktopToolsBackground = await desktopToolsMenu.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(desktopToolsBackground).not.toBe('rgba(0, 0, 0, 0)');
  await page.screenshot({ path: '/tmp/socrates-reference-desktop-tools-1440x900.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(desktopToolsMenu).toBeHidden();

  await page.evaluate(() => document.getElementById('navPlugins')?.click());
  await expect(page.locator('.plugin-directory')).toBeVisible();
  await page.screenshot({ path: '/tmp/socrates-reference-desktop-plugins-1440x900.png', fullPage: true });
  await page.evaluate(() => document.getElementById('navProjects')?.click());
  await expect(page.locator('.projects-directory')).toBeVisible();
  await expect(page.locator('.project-row').filter({ hasText: 'Socrates' })).toBeVisible();
  await page.screenshot({ path: '/tmp/socrates-reference-desktop-projects-1440x900.png', fullPage: true });
  await page.evaluate(() => document.getElementById('navScheduled')?.click());
  await expect(page.locator('.scheduled-directory')).toBeVisible();
  await page.screenshot({ path: '/tmp/socrates-reference-desktop-scheduled-1440x900.png', fullPage: true });

  expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  expect(pageErrors, `page errors: ${pageErrors.join('\n')}`).toEqual([]);
});

test('Create image requires Jimeng and activates only after the connection is available', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'zh' });
  await page.setViewportSize({ width: 390, height: 769 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.locator('#topicComposerToolsBtn').click();
  await page.locator('#composerToolsMenu .composer-tools-mobile-items [data-composer-action="createImage"]').click();
  await expect(page.locator('#composerToolsMenu')).toBeHidden();
  await expect(page.locator('.plugin-directory')).toBeVisible();
  expect(await page.evaluate(() => window._activeTemplate?.extensionKey || null)).toBeNull();
  await expect(page.locator('body')).toContainText('请先在插件页连接即梦 AI');
});

test('Create image waits for a user prompt before submitting the image-generation turn', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'en' });
  await page.route('**/project-connectors*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ configured: true, connectors: [
        { id: 'oc_jimeng_ai', name: 'Jimeng AI', description: 'Generate images.', capabilities: ['Image generation 4.6'], authType: 'custom_credential', connection: { status: 'connected' } },
      ] }),
    });
  });
  const chatRequests = [];
  page.on('request', (request) => {
    if (/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/.test(request.url())) chatRequests.push(request);
  });
  await page.route('**/chat/stream*', async (route) => {
    const content = '![Generated image](https://images.example.test/jimeng-46-result.png)\n\nGenerated with Jimeng AI 4.6.';
    const sse = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse });
  });
  await page.setViewportSize({ width: 390, height: 769 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.locator('#topicComposerToolsBtn').click();
  await page.locator('#composerToolsMenu .composer-tools-mobile-items [data-composer-action="createImage"]').click();
  await expect.poll(async () => page.evaluate(() => window._activeTemplate?.extensionKey || null)).toBe('createImage');
  expect(await page.evaluate(() => window._activeTemplate?.systemPrompt || '')).toContain('You are in image creation mode');
  expect(chatRequests).toEqual([]);

  await page.locator('#topicComposerRoot .rich-composer-editor').fill('A tiny blue fox under the northern lights.');
  expect(await page.evaluate(() => window._activeTemplate?.extensionKey || null)).toBe('createImage');
  await page.locator('#startBtn').click();
  await expect.poll(() => chatRequests.length).toBe(1);
  const requestBody = chatRequests[0].postData() || '';
  expect(requestBody).toContain('A tiny blue fox under the northern lights.');
  expect(requestBody).toContain('You are in image creation mode');
  const generatedImage = page.locator('#msgList .msg.assistant .msg-body img').last();
  await expect(generatedImage).toHaveAttribute('src', 'https://images.example.test/jimeng-46-result.png');
  await expect(page.locator('#msgList .msg.assistant .msg-body').last()).toContainText('Generated with Jimeng AI 4.6.');
});
