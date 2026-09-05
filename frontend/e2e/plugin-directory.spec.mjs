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
  // The installed scope is the default, matching the reference design.
  await expect(page.locator('.plugin-directory-row')).toHaveCount(2);

  const appSearch = page.locator('.plugin-directory-search input');
  await appSearch.fill('gmail');
  await expect(page.locator('.plugin-directory-row')).toHaveCount(0);
  await expect(page.locator('.plugin-directory-empty')).toBeVisible();
  await appSearch.fill('');
  await expect(page.locator('.plugin-directory-row')).toHaveCount(2);
  await page.getByRole('tab', { name: 'All plugins' }).click();
  await expect(page.locator('.plugin-directory-row')).toHaveCount(3);

  // The in-page back button returns to the previous chat/topic view.
  await page.locator('.plugin-directory-back').click();
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
