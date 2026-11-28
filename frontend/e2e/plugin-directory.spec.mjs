import { test, expect } from '@playwright/test';
import { ACTIVE_CLASS, gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const CONNECTORS = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Bring repositories, issues, pull requests, and CI context into a chat.',
    capabilities: ['Repositories', 'Issues'],
    chatActions: [
      { name: 'github.get_current_user', description: 'Get the authenticated GitHub user.' },
    ],
    authType: 'oauth',
    connection: { status: 'connected', displayName: 'Study org' },
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Search mail context that you explicitly authorize.',
    capabilities: ['Mail search'],
    authType: 'oauth',
    connection: null,
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Search pages and knowledge you share with Socrates.',
    capabilities: ['Page search'],
    authType: 'oauth',
    connection: { status: 'connected', displayName: 'Personal notes' },
  },
];

async function mockConnectedCatalog(page, connectors = CONNECTORS) {
  await page.route('**/api/**', async (route) => {
    if (!route.request().url().includes('project-connectors')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ configured: true, connectors }),
    });
  });
}

async function openConnectedPluginDetail(page) {
  await mockAuthedApp(page, { lang: 'en' });
  await mockConnectedCatalog(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  if (
    await page.locator('#sidebar').evaluate((sidebar) => sidebar.classList.contains('collapsed'))
  ) {
    await page.locator('#sidebarOpenBtn').click();
  }
  await page.locator('#navPlugins').click();
  const entry = page.locator('[data-connector-id="github"] .plugin-directory-card-main');
  await entry.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.plugin-detail-view')).toBeVisible();
  await expect(page.locator('.plugin-detail-view')).toHaveAttribute('data-page-frame', '');
  await expect(page.locator('.plugin-detail-page-header')).toHaveAttribute(
    'data-page-header-variant',
    'account',
  );
  await expect(page.locator('#plugin-detail-title')).toHaveAttribute('data-page-title', '');
}

test('plugin directory search and card surfaces follow shared responsive tokens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAuthedApp(page, { lang: 'en' });
  await mockConnectedCatalog(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.locator('#navPlugins').click();
  const search = page.locator('.plugin-directory-search');
  const row = page.locator('.plugin-directory-row').first();
  await expect(search).toBeVisible();
  await expect(search).toHaveCSS('border-radius', '999px');
  await expect(row).toHaveCSS('display', 'flex');
  await expect(row.locator('.connector-icon')).toHaveCSS('width', '40px');
  await expect(row.locator('.connector-icon')).toHaveCSS('height', '40px');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(search).toHaveCSS('height', '44px');
  await expect(row.locator('.connector-icon')).toHaveCSS('width', '40px');
  const overflow = await page
    .locator('.plugin-directory')
    .evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

for (const theme of ['light', 'dark']) {
  test(`plugin action ink and official glyphs stay crisp in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('socrates-theme', value), theme);
    await page.setViewportSize({ width: 390, height: 844 });
    await openConnectedPluginDetail(page);
    await expect(page.locator('html')).toHaveAttribute('data-mode', theme);
    const ink = theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)';
    const inverse = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    await expect(page.locator('#plugin-detail-title')).toHaveCSS('color', ink);
    const back = page.locator('.plugin-detail-back-btn');
    await expect(back).toHaveCSS('color', ink);
    await expect(back.locator('svg')).toHaveCSS('color', ink);
    const primary = page.locator('.plugin-detail-btn-primary');
    await expect(primary).toHaveCSS('color', inverse);
    await expect(primary).toHaveCSS('background-color', ink);
    await expect(page.locator('.plugin-detail-btn-secondary')).toHaveCSS('color', ink);
    await expect(page.locator('.plugin-detail-prompt-card svg').first()).toBeVisible();
    const example = page.locator('button.plugin-detail-prompt-card').first();
    await expect(example).toHaveCSS('border-radius', '0px');
    await expect(example).toHaveCSS('border-top-width', '0px');
    await expect(example).toHaveCSS('border-inline-start-width', '0px');
    const examples = await page.locator('.plugin-detail-prompts-list').boundingBox();
    const permissions = await page.locator('.plugin-detail-permissions').boundingBox();
    expect(examples.y + examples.height).toBeLessThan(permissions.y);
    await page.screenshot({
      path: `test-results/plugin-detail-flat-${encodeURIComponent(theme)}.png`,
      animations: 'disabled',
      caret: 'hide',
    });
    const description = await page
      .locator('.plugin-detail-desc')
      .first()
      .evaluate((node) => getComputedStyle(node).color);
    expect(description).toBe(ink);
  });
}

test('plugin detail header and actions fit a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await openConnectedPluginDetail(page);
  const bounds = await page.locator('.plugin-detail-page-header').evaluate((header) => ({
    width: header.clientWidth,
    scrollWidth: header.scrollWidth,
    actionsWidth: header.querySelector('.account-page-actions')?.getBoundingClientRect().width ?? 0,
  }));
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width + 1);
  expect(bounds.actionsWidth).toBeGreaterThan(120);
  await expect(page.locator('.plugin-detail-btn-primary')).toBeVisible();
});

test('plugin detail shows only verified chat actions and connection requirements', async ({
  page,
}) => {
  await openConnectedPluginDetail(page);
  const detail = page.locator('.plugin-detail-view');
  await detail.getByText('What you can do', { exact: false }).click();
  await expect(detail.locator('.plugin-detail-feature-item')).toHaveCount(1);
  await expect(detail.locator('.plugin-detail-feature-item')).toContainText(
    'Get the authenticated GitHub user.',
  );
  await expect(detail.locator('.plugin-detail-feature-item')).not.toContainText('Issues');
  await expect(detail.locator('.plugin-detail-prompts-list')).toContainText('Which GitHub account');
  await detail.getByText('Connection details', { exact: true }).click();
  await expect(detail.locator('.plugin-detail-security-card')).toContainText('OAuth 2.0');
  await expect(detail.locator('.plugin-detail-security-card')).toContainText('Study org');
});

test('unverified plugin actions cannot launch chat and pending apps are not installed', async ({
  page,
}) => {
  await mockAuthedApp(page, { lang: 'en' });
  await mockConnectedCatalog(
    page,
    CONNECTORS.map((plugin) =>
      plugin.id === 'gmail' ? { ...plugin, connection: { status: 'initiated' } } : plugin,
    ),
  );
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.locator('#navPlugins').click();
  await expect(
    page.locator('.plugin-installed-icons').getByRole('button', { name: 'Gmail' }),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-connector-id="gmail"] .plugin-directory-card-status'),
  ).toHaveText('Awaiting authorization');
  await page.getByRole('button', { name: 'Personal' }).click();
  await expect(page.locator('[data-connector-id="gmail"]')).toBeVisible();
  await page.getByRole('button', { name: 'Find plugins' }).click();
  await expect(page.locator('.plugin-directory-search input')).toBeFocused();
  await page.locator('[data-connector-id="notion"] .plugin-directory-card-main').click();
  await expect(page.locator('.plugin-detail-btn-primary')).toBeDisabled();
  await expect(page.locator('.plugin-detail-body')).toContainText(
    'The server has not supplied a verified action list.',
  );
  await expect(page.locator('button.plugin-detail-prompt-card')).toHaveCount(0);
});

test('failed plugin launch gives actionable feedback', async ({ page }) => {
  await openConnectedPluginDetail(page);
  await page.evaluate(() => {
    window.__socratesLegacy.navigation.startNewChat = async () => {
      throw new Error('Reset failed');
    };
  });
  await page.locator('.plugin-detail-btn-primary').click();
  await expect(page.locator('.msg-toast-error')).toContainText('Could not open this app in chat.');
  await expect(page.locator('.plugin-detail-view')).toBeVisible();
});

test('plugin launch is single-flight and cancellation restores controls', async ({ page }) => {
  await openConnectedPluginDetail(page);
  await page.evaluate(() => {
    window.__pluginLaunchCalls = 0;
    window.__socratesLegacy.navigation.startNewChat = () => {
      window.__pluginLaunchCalls += 1;
      return new Promise((resolve) => {
        window.__cancelPluginLaunch = () => resolve(false);
      });
    };
  });
  const primary = page.locator('.plugin-detail-btn-primary');
  const example = page.locator('button.plugin-detail-prompt-card').first();
  // Two activations in the same task also exercise the synchronous ref guard,
  // before React can commit the disabled state.
  await primary.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(primary).toBeDisabled();
  await expect(primary).toHaveAttribute('aria-busy', 'true');
  await expect(example).toBeDisabled();
  expect(await page.evaluate(() => window.__pluginLaunchCalls)).toBe(1);
  await page.evaluate(() => window.__cancelPluginLaunch());
  await expect(primary).toBeEnabled();
  await expect(example).toBeEnabled();
  await expect(primary).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.composer-plugin-chip')).toHaveCount(0);
});

test('using a connected plugin waits for the chat reset to succeed', async ({ page }) => {
  await openConnectedPluginDetail(page);

  await page.locator('.plugin-detail-btn-primary').click();

  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect(page.locator('#composerInputWrap .composer-plugin-chip-label')).toHaveText([
    'GitHub',
  ]);
  expect(await page.evaluate(() => '__socratesComposerPluginSelectionBridge' in window)).toBe(
    false,
  );
});

test('plugin example opens a draft without submitting the request', async ({ page }) => {
  await openConnectedPluginDetail(page);
  await page.locator('button.plugin-detail-prompt-card').first().click();
  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect(page.locator('#composerInputWrap .composer-plugin-chip-label')).toHaveText([
    'GitHub',
  ]);
  await expect(page.locator('#composerInputWrap')).toContainText(
    'Which GitHub account am I connected to?',
  );
});

test('canceling the chat reset keeps the connected plugin unselected', async ({ page }) => {
  await openConnectedPluginDetail(page);
  await page.evaluate(() => {
    window.__socratesLegacy.navigation.startNewChat = async () => false;
  });

  await page.locator('.plugin-detail-btn-primary').click();

  await expect(page.locator('.plugin-detail-view')).toBeVisible();
  await expect(page.locator('.composer-plugin-chip')).toHaveCount(0);
});

test('plus menu supports connector multi-select and removal', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'en' });
  await mockConnectedCatalog(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.locator('#composerToolsBtn').click();
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-composer-plugin]')).toHaveCount(2);
  // Disconnected connectors stay out of the composer roster.
  await expect(menu.locator('[data-composer-plugin="gmail"]')).toHaveCount(0);
  // The composer roster carries no filter field any more, so every connected
  // app stays on screen.
  await expect(menu.locator('.composer-tools-search')).toHaveCount(0);
  await expect(menu.locator('[data-composer-plugin="notion"]')).toBeVisible();
  await expect(menu.locator('[data-composer-plugin="github"]')).toBeVisible();

  await page.locator('[data-composer-plugin="github"]').click();
  await page.locator('[data-composer-plugin="notion"]').click();
  await expect(page.locator('#composerInputWrap .composer-plugin-chip')).toHaveCount(2);
  await expect(page.locator('#composerInputWrap .composer-plugin-chip-label')).toHaveText([
    'GitHub',
    'Notion',
  ]);

  await page.locator('#composerInputWrap .composer-plugin-chip-remove').first().click();
  await expect(page.locator('#composerInputWrap .composer-plugin-chip')).toHaveCount(1);
  await expect(page.locator('#composerInputWrap .composer-plugin-chip-label')).toHaveText([
    'Notion',
  ]);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('plugin center filters public/personal apps and scheduled templates prefill the form', async ({
  page,
}) => {
  await mockAuthedApp(page, { lang: 'en' });
  await mockConnectedCatalog(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.locator('#navPlugins').click();
  await expect(page.locator('.plugin-directory')).toBeVisible();
  // The public scope is the default, matching the reference design.
  await expect(page.locator('.plugin-directory-row')).toHaveCount(3);
  await page.screenshot({
    path: 'test-results/plugin-directory-reference-desktop.png',
    fullPage: true,
  });

  const appSearch = page.locator('.plugin-directory-search input');
  await appSearch.fill('gmail');
  await expect(page.locator('.plugin-directory-row')).toHaveCount(1);
  await appSearch.fill('zzz-no-such-app');
  await expect(page.locator('.plugin-directory-row')).toHaveCount(0);
  await expect(page.locator('.ui-page-empty')).toBeVisible();
  await appSearch.fill('');
  await expect(page.locator('.plugin-directory-row')).toHaveCount(3);
  const publicScope = page.getByRole('button', { name: 'Public' });
  const personalScope = page.getByRole('button', { name: 'Personal' });
  await expect(publicScope).toHaveAttribute('aria-pressed', 'true');
  await publicScope.focus();
  await page.keyboard.press('ArrowRight');
  await expect(personalScope).toBeFocused();
  await page.keyboard.press('Space');
  await expect(personalScope).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.plugin-directory-row')).toHaveCount(2);

  // The directory is a direct sidebar destination; new-chat returns home.
  await page.locator('#navNew').click();
  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect(page.locator('#pluginsPanel')).toBeHidden();
  await expect(page.locator('#navPlugins')).not.toHaveClass(ACTIVE_CLASS);
  await expect(page.locator('#navPlugins')).not.toHaveAttribute('aria-current', 'page');

  await page.locator('#navScheduled').click();
  await expect(page.locator('.scheduled-directory')).toBeVisible();
  await expect(page.locator('.scheduled-recommendation')).toHaveCount(5);
  await page.locator('.scheduled-recommendation').first().click();
  await expect(page.locator('#taskForm')).toBeVisible();
  await expect(page.locator('#taskForm input[name="title"]')).toHaveValue(/daily briefing/i);
  await expect(page.locator('#taskForm textarea[name="prompt"]')).toHaveValue(/daily briefing/i);
  const scheduledRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && /\/api\/(v2\/)?scheduled-tasks(?:\?|$)/.test(request.url()),
  );
  await page.locator('#taskForm button[type="submit"]').click();
  expect((await scheduledRequest).postDataJSON()).toMatchObject({
    title: expect.stringMatching(/daily briefing/i),
    prompt: expect.stringMatching(/daily briefing/i),
    frequency: 'once',
  });
  await expect(page.locator('#workspaceDialog')).toBeHidden();
});

test('OpenConnector apps the hosted runtime does not serve yet render disabled', async ({
  page,
}) => {
  await mockAuthedApp(page, { lang: 'en' });
  await page.route('**/api/**', async (route) => {
    if (!route.request().url().includes('project-connectors')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        openConnector: { available: false },
        connectors: [
          {
            id: 'github',
            name: 'GitHub',
            description: 'Repositories',
            authType: 'oauth',
            available: undefined,
            connection: null,
          },
          {
            id: 'oc_slack',
            name: 'Slack',
            description: 'Connect Slack to use its actions in chat. (via OpenConnector)',
            capabilities: ['Actions'],
            authType: 'oauth',
            available: false,
            connection: null,
          },
          {
            id: 'oc_amap',
            name: '高德地图',
            description: 'Connect 高德地图 to use its actions in chat. (via OpenConnector)',
            capabilities: ['Actions'],
            authType: 'api_key',
            available: false,
            connection: null,
          },
        ],
      }),
    });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.locator('#navPlugins').click();
  await expect(page.locator('.plugin-directory')).toBeVisible();
  await expect(page.locator('.plugin-directory-row')).toHaveCount(3);

  /* Legacy OOMOL apps stay connectable when the gateway is configured. */
  await expect(
    page.locator('[data-connector-id="github"] button.plugin-directory-icon-action'),
  ).toBeEnabled();
  /* Stub-catalog apps (not covered by the gateway snapshot) are greyed out
     with the setup-needed title. */
  const slack = page.locator('[data-connector-id="oc_slack"] button.plugin-directory-icon-action');
  await expect(slack).toBeDisabled();
  await expect(slack).toHaveAttribute('title', 'Server setup needed');
  const amap = page.locator('[data-connector-id="oc_amap"] button.plugin-directory-icon-action');
  await expect(amap).toBeDisabled();
});

test('connected apps open manage or credential dialogs, disconnect works', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'en' });
  let deleteSeen = null;
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('project-connectors') && route.request().method() === 'DELETE') {
      deleteSeen = url;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'disconnected' }),
      });
      return;
    }
    if (!route.request().url().includes('project-connectors')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        connectors: [
          {
            id: 'oc_slack',
            name: 'Slack',
            description: 'Team chat',
            capabilities: ['Messaging'],
            authType: 'oauth',
            available: true,
            connection: {
              status: 'connected',
              displayName: 'Study org',
              updatedAt: '2026-09-09T00:00:00.000Z',
            },
          },
          {
            id: 'oc_amap',
            name: '高德地图',
            description: 'Maps',
            capabilities: ['Location'],
            authType: 'api_key',
            available: true,
            credentialInput: {
              fields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }],
            },
            connection: {
              status: 'connected',
              displayName: null,
              updatedAt: '2026-09-09T00:00:00.000Z',
            },
          },
        ],
      }),
    });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.locator('#navPlugins').click();
  await expect(page.locator('.plugin-directory')).toBeVisible();

  /* OAuth app without a credential form gets the manage dialog. */
  await page.locator('[data-connector-id="oc_slack"] button.plugin-directory-icon-action').click();
  await expect(page.locator('#workspaceDialog [data-action="disconnect"]')).toBeVisible();
  await expect(page.locator('#workspaceDialog input').first()).toHaveValue(/connected.*Study org/);
  await page.locator('#workspaceDialog [data-action="disconnect"]').click();
  await expect(page.locator('#confirmDialog')).not.toHaveClass(/hidden/);
  await page.locator('#confirmOkBtn').click();
  await expect.poll(() => deleteSeen).toContain('/oc_slack/connection');
  await expect(page.locator('#workspaceDialog')).toHaveClass(/hidden/);

  /* Key-based app still gets its credential form. */
  await page.locator('[data-connector-id="oc_amap"] button.plugin-directory-icon-action').click();
  await expect(page.locator('#projectConnectorForm')).toBeVisible();
});

test('OpenConnector apps served through the OOMOL cloud stay connectable', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'en' });
  await page.route('**/api/**', async (route) => {
    if (!route.request().url().includes('project-connectors')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        openConnector: { available: false, cloud: true },
        connectors: [
          {
            id: 'oc_slack',
            name: 'Slack',
            description: 'Connect Slack to use its 2 actions in chat. (via OpenConnector)',
            capabilities: ['Messaging'],
            authType: 'oauth',
            available: true,
            connection: null,
          },
          {
            id: 'oc_amap',
            name: '高德地图',
            description: 'Connect 高德地图 to use its 15 actions in chat. (via OpenConnector)',
            capabilities: ['Location'],
            authType: 'api_key',
            available: true,
            credentialInput: {
              fields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }],
            },
            connection: null,
          },
        ],
      }),
    });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.locator('#navPlugins').click();
  await expect(page.locator('.plugin-directory')).toBeVisible();
  await expect(page.locator('.plugin-directory-row')).toHaveCount(2);

  /* Cloud-served apps are enabled with the Connect title. */
  await expect(
    page.locator('[data-connector-id="oc_slack"] button.plugin-directory-icon-action'),
  ).toBeEnabled();
  const amap = page.locator('[data-connector-id="oc_amap"] button.plugin-directory-icon-action');
  await expect(amap).toBeEnabled();
  await expect(amap).toHaveAttribute('title', 'Connect');
});

test('OAuth return restores the original composer surface and plugin context', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'en' });
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'socrates-connector-return-v1',
      JSON.stringify({
        connectorId: 'github',
        returnPath: '/',
        createdAt: Date.now(),
        composer: {
          topic: [
            {
              id: 'github',
              name: 'GitHub',
              description: 'Repositories',
              capabilities: ['Repositories'],
              directiveTemplate: 'Use my connected GitHub context.',
              iconMarkup: '',
            },
          ],
          chat: [],
          drafts: { topic: 'Restored OAuth draft', chat: '' },
        },
      }),
    );
  });
  await gotoAndSettle(page, '/plugins?connector=github');
  await waitForAppShell(page);

  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect(page.locator('#pluginsPanel')).toBeHidden();
  await expect(page.locator('#composerInputWrap .composer-plugin-chip-label')).toHaveText([
    'GitHub',
  ]);
  await expect(page.locator('#composerRoot .rich-composer-editor')).toContainText(
    'Restored OAuth draft',
  );
  await expect(page).toHaveURL((url) => url.pathname === '/' && url.search === '');
});

test('plugin detail preserves directory query and themed SVG tiles', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'en' });
  await mockConnectedCatalog(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.locator('#navPlugins').click();
  const search = page.locator('.plugin-directory-search input');
  await search.fill('GitHub');
  const tile = page.locator('[data-connector-id="github"] svg rect').first();
  for (const mode of ['light', 'dark']) {
    await page.evaluate((mode) => {
      document.documentElement.dataset.mode = mode;
      document.documentElement.classList.toggle('dark', mode === 'dark');
    }, mode);
    const colors = await tile.evaluate((el) => ({
      fill: getComputedStyle(el).fill,
      expected: getComputedStyle(el).getPropertyValue('--ui-connector-tile').trim(),
    }));
    expect(colors.expected).toBeTruthy();
    if (mode === 'light')
      await page.screenshot({ path: 'test-results/plugin-tile-light.png', animations: 'disabled' });
    else
      await page.screenshot({ path: 'test-results/plugin-tile-dark.png', animations: 'disabled' });
  }
  const trigger = page.getByRole('button', { name: 'GitHub', exact: true });
  await trigger.focus();
  await trigger.press('Enter');
  await expect(page.locator('.plugin-detail-view')).toBeVisible();
  await page.locator('.plugin-detail-back-btn').click();
  await expect(search).toHaveValue('GitHub');
  await expect(page.locator('[data-connector-id="github"]')).toBeVisible();
});

test('returning from plugin detail restores the directory scroll position', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'en' });
  await mockConnectedCatalog(
    page,
    Array.from({ length: 40 }, (_, i) => ({
      ...CONNECTORS[0],
      id: `service_${i}`,
      name: `Service ${i}`,
    })),
  );
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.locator('#navPlugins').click();
  const row = page.locator('[data-connector-id="service_30"]');
  await row.scrollIntoViewIfNeeded();
  const position = await page.locator('#pluginsPanel').evaluate((el) => el.scrollTop);
  expect(position).toBeGreaterThan(0);
  await row.click();
  await expect(page.locator('.plugin-detail-view')).toBeVisible();
  await page.locator('.plugin-detail-back-btn').click();
  await expect
    .poll(() => page.locator('#pluginsPanel').evaluate((el) => el.scrollTop))
    .toBe(position);
});

for (const theme of ['light', 'dark']) {
  test(`narrow plugin cards expose connection state and keep long labels bounded in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await page.addInitScript((mode) => localStorage.setItem('socrates-theme', mode), theme);
    await mockAuthedApp(page, { lang: 'en' });
    const name = 'An unusually long connector name for responsive layout verification';
    await mockConnectedCatalog(page, [{ ...CONNECTORS[0], name }]);
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);
    await page.locator('#sidebarOpenBtn').click();
    await page.locator('#navPlugins').click();
    const row = page.locator('[data-connector-id="github"]');
    const main = row.locator('.plugin-directory-card-main');
    await expect(main).toBeVisible();
    await expect(main).toHaveAttribute('aria-description', 'Connected');
    expect(await row.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
      1,
    );
    await main.click();
    await expect(page.locator('.plugin-detail-view')).toBeVisible();
    expect(
      await page
        .locator('.plugin-detail-page-header')
        .evaluate((node) => node.scrollWidth - node.clientWidth),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: `test-results/detail-polish/plugins-320-${encodeURIComponent(theme)}.png`,
      animations: 'disabled',
    });
  });
}
