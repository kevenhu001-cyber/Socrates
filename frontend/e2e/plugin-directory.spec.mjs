import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const CONNECTORS = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Bring repositories, issues, pull requests, and CI context into a chat.',
    capabilities: ['Repositories', 'Issues'],
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

async function mockConnectedCatalog(page) {
  await page.route('**/api/**', async (route) => {
    if (!route.request().url().includes('project-connectors')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ configured: true, connectors: CONNECTORS }),
    });
  });
}

test('plus menu supports real connector search, multi-select, and removal', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'en' });
  await mockConnectedCatalog(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.locator('#topicComposerToolsBtn').click();
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-composer-plugin]')).toHaveCount(3);

  const search = menu.locator('.composer-tools-search input');
  await search.fill('notion');
  await expect(menu.locator('[data-composer-plugin]')).toHaveCount(1);
  await expect(menu.locator('[data-composer-plugin="notion"]')).toBeVisible();

  await search.fill('');
  await page.locator('[data-composer-plugin="github"]').click();
  await page.locator('[data-composer-plugin="notion"]').click();
  await expect(page.locator('#topicInputWrap .composer-plugin-chip')).toHaveCount(2);
  await expect(page.locator('#topicInputWrap .composer-plugin-chip-label')).toHaveText(['GitHub', 'Notion']);

  await page.locator('#topicInputWrap .composer-plugin-chip-remove').first().click();
  await expect(page.locator('#topicInputWrap .composer-plugin-chip')).toHaveCount(1);
  await expect(page.locator('#topicInputWrap .composer-plugin-chip-label')).toHaveText(['Notion']);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('plugin center filters public/personal apps and scheduled templates prefill the form', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'en' });
  await mockConnectedCatalog(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.locator('#navPlugins').click();
  await expect(page.locator('.plugin-directory')).toBeVisible();
  // The public scope is the default, matching the reference design.
  await expect(page.locator('.plugin-directory-row')).toHaveCount(3);

  const appSearch = page.locator('.plugin-directory-search input');
  await appSearch.fill('gmail');
  await expect(page.locator('.plugin-directory-row')).toHaveCount(1);
  await appSearch.fill('zzz-no-such-app');
  await expect(page.locator('.plugin-directory-row')).toHaveCount(0);
  await expect(page.locator('.plugin-directory-empty')).toBeVisible();
  await appSearch.fill('');
  await expect(page.locator('.plugin-directory-row')).toHaveCount(3);
  await page.getByRole('tab', { name: 'Personal' }).click();
  await expect(page.locator('.plugin-directory-row')).toHaveCount(2);

  // The directory is a direct sidebar destination; new-chat returns home.
  await page.locator('#navNew').click();
  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect(page.locator('#pluginsPanel')).toBeHidden();

  await page.locator('#navScheduled').click();
  await expect(page.locator('.scheduled-directory')).toBeVisible();
  await expect(page.locator('.scheduled-recommendation')).toHaveCount(5);
  await page.locator('.scheduled-recommendation').first().click();
  await expect(page.locator('#taskForm')).toBeVisible();
  await expect(page.locator('#taskForm input[name="title"]')).toHaveValue(/daily briefing/i);
  await expect(page.locator('#taskForm textarea[name="prompt"]')).toHaveValue(/daily briefing/i);
});

test('OpenConnector apps the sidecar does not serve yet render disabled', async ({ page }) => {
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
          { id: 'github', name: 'GitHub', description: 'Repositories', authType: 'oauth', available: undefined, connection: null },
          { id: 'oc_slack', name: 'Slack', description: 'Connect Slack to use its actions in chat. (via OpenConnector)', capabilities: ['Actions'], authType: 'oauth', available: false, connection: null },
          { id: 'oc_amap', name: '高德地图', description: 'Connect 高德地图 to use its actions in chat. (via OpenConnector)', capabilities: ['Actions'], authType: 'api_key', available: false, connection: null },
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
  await expect(page.locator('[data-connector-id="github"] button.plugin-directory-icon-action')).toBeEnabled();
  /* Sidecar-stubbed apps are greyed out with the setup-needed title. */
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
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'disconnected' }) });
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
          { id: 'oc_slack', name: 'Slack', description: 'Team chat', capabilities: ['Messaging'], authType: 'oauth', available: true,
            connection: { status: 'connected', displayName: 'Study org', updatedAt: '2026-09-09T00:00:00.000Z' } },
          { id: 'oc_amap', name: '高德地图', description: 'Maps', capabilities: ['Location'], authType: 'api_key', available: true,
            credentialInput: { fields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }] },
            connection: { status: 'connected', displayName: null, updatedAt: '2026-09-09T00:00:00.000Z' } },
        ],
      }),
    });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.locator('#navPlugins').click();
  await expect(page.locator('.plugin-directory')).toBeVisible();
  await page.evaluate(() => { window.showConfirm = async () => true; });

  /* OAuth app without a credential form gets the manage dialog. */
  await page.locator('[data-connector-id="oc_slack"] button.plugin-directory-icon-action').click();
  await expect(page.locator('#workspaceDialog [data-action="disconnect"]')).toBeVisible();
  await expect(page.locator('#workspaceDialog input').first()).toHaveValue(/connected.*Study org/);
  await page.locator('#workspaceDialog [data-action="disconnect"]').click();
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
          { id: 'oc_slack', name: 'Slack', description: 'Connect Slack to use its 2 actions in chat. (via OpenConnector)', capabilities: ['Messaging'], authType: 'oauth', available: true, connection: null },
          { id: 'oc_amap', name: '高德地图', description: 'Connect 高德地图 to use its 15 actions in chat. (via OpenConnector)', capabilities: ['Location'], authType: 'api_key', available: true, credentialInput: { fields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }] }, connection: null },
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
  await expect(page.locator('[data-connector-id="oc_slack"] button.plugin-directory-icon-action')).toBeEnabled();
  const amap = page.locator('[data-connector-id="oc_amap"] button.plugin-directory-icon-action');
  await expect(amap).toBeEnabled();
  await expect(amap).toHaveAttribute('title', 'Connect');
});

test('OAuth return restores the original composer surface and plugin context', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'en' });
  await page.addInitScript(() => {
    sessionStorage.setItem('socrates-connector-return-v1', JSON.stringify({
      connectorId: 'github',
      returnPath: '/',
      createdAt: Date.now(),
      composer: {
        topic: [{
          id: 'github',
          name: 'GitHub',
          description: 'Repositories',
          capabilities: ['Repositories'],
          directiveTemplate: 'Use my connected GitHub context.',
          iconMarkup: '',
        }],
        chat: [],
        drafts: { topic: 'Restored OAuth draft', chat: '' },
      },
    }));
  });
  await gotoAndSettle(page, '/plugins?connector=github');
  await waitForAppShell(page);

  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect(page.locator('#pluginsPanel')).toBeHidden();
  await expect(page.locator('#topicInputWrap .composer-plugin-chip-label')).toHaveText(['GitHub']);
  await expect.poll(() => page.evaluate(() => window.__socratesComposerController?.getMarkdown('topic')))
    .toBe('Restored OAuth draft');
  await expect(page).toHaveURL(/127\.0\.0\.1:4173\/$/);
});
