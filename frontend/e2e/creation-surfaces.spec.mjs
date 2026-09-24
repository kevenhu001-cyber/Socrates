import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { gotoAndSettle } from './_lib.mjs';

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  const rows = { assistants: [], sites: [], images: [] };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/v2\//, '/api/');
    if (!path.startsWith('/api/creations/')) return route.fallback();
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/creations/images') {
      if (request.method() === 'GET') return respond({ images: rows.images });
      const image = { id: `image-${rows.images.length + 1}`, name: `${request.postDataJSON().prompt}.png`, url: '/image.png' };
      rows.images.unshift(image); return respond(image, 201);
    }
    if (path.match(/^\/api\/creations\/images\/[^/]+\/edit$/)) {
      const image = { id: `image-${rows.images.length + 1}`, name: 'Edited image.png', url: '/image.png' };
      rows.images.unshift(image); return respond(image, 201);
    }
    const type = path.match(/^\/api\/creations\/items\/(assistants|sites)(?:\/([^/]+))?$/);
    if (type) {
      const list = rows[type[1]];
      if (request.method() === 'GET') return respond({ items: list });
      if (request.method() === 'DELETE') { rows[type[1]] = list.filter((item) => item.id !== type[2]); return respond({}, 204); }
      const body = request.postDataJSON();
      if (request.method() === 'POST') {
        const item = { id: `${type[1]}-${list.length + 1}`, title: body.title, source: body.source, visibility: 'private', version: 1 };
        list.unshift(item); return respond(item, 201);
      }
      if (request.method() === 'PATCH') {
        const item = list.find((row) => row.id === type[2]);
        Object.assign(item, body); item.version += 1; return respond(item);
      }
    }
    if (path.match(/^\/api\/creations\/sites\/[^/]+\/publish$/)) {
      const id = path.split('/')[4]; const item = rows.sites.find((row) => row.id === id);
      item.visibility = request.postDataJSON().visibility;
      return respond({ id, visibility: item.visibility, version: item.version, url: item.visibility === 'private' ? null : '/s/test-token' });
    }
    if (path === '/api/creations/sites/generate') return respond({ source: '<html><h1>Generated course</h1></html>' });
    return respond({ code: 'NOT_FOUND' }, 404);
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
});

test('assistant can be created and started from More', async ({ page }) => {
  await page.locator('#navMore').click();
  await page.getByRole('menuitem', { name: 'Assistants' }).click();
  await expect(page.locator('#assistantsPanel')).toBeVisible();
  await page.getByRole('button', { name: 'Create assistant' }).click();
  await page.locator('.creation-editor [name=title]').fill('Math coach');
  await page.locator('.creation-editor [name=instructions]').fill('Explain one step at a time.');
  await page.locator('.creation-editor [name=starter]').fill('Help me with algebra');
  await page.locator('.creation-editor [type=submit]').click();
  await expect(page.locator('#assistantsPanel .creation-row')).toContainText('Math coach');
  await page.locator('#assistantsPanel [data-action=use]').click();
  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('socrates-active-assistant'))).toBe('assistants-1');
  await expect(page.locator('#topicComposerRoot')).toContainText('Help me with algebra');
});

test('site can be saved, published and previewed', async ({ page }) => {
  await page.locator('#navSites').click();
  await page.getByRole('button', { name: 'Create site' }).click();
  await page.locator('.creation-editor [name=title]').fill('Course notes');
  await page.locator('.creation-editor [name=prompt]').fill('A simple course landing page');
  await page.locator('.creation-editor [data-action=generate-site]').click();
  await expect(page.locator('.creation-editor [name=source]')).toHaveValue(/Generated course/);
  await page.locator('.creation-editor [name=source]').fill('<h1>Course notes</h1>');
  await page.locator('.creation-editor [name=visibility]').selectOption('unlisted');
  await page.locator('.creation-editor [type=submit]').click();
  await expect(page.locator('#sitesPanel .creation-row')).toContainText('Course notes');
  await page.setViewportSize({ width: 390, height: 769 });
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) window.toggleSidebar?.();
  });
  await expect.poll(async () => Math.round((await page.locator('#sidebar').boundingBox())?.x ?? 0)).toBe(-254);
  await page.screenshot({ path: '/tmp/socrates-reference-mobile-sites-list-390x769.png' });
  await page.locator('#sitesPanel [data-action=site-menu]').click();
  await page.locator('#sitesPanel [data-action=preview]').click();
  await expect(page.locator('.creation-preview-frame')).toBeVisible();
  await expect(page.frameLocator('.creation-preview-frame').getByRole('heading', { name: 'Course notes' })).toBeVisible();
});

test('image gallery supports generation and editing', async ({ page }) => {
  await page.locator('#navMore').click();
  await page.getByRole('menuitem', { name: 'Images' }).click();
  await page.locator('#creationImageForm [name=prompt]').fill('A quiet library');
  await page.locator('#creationImageForm [name=model]').fill('image-model');
  await page.locator('#creationImageForm [type=submit]').click();
  await expect(page.locator('#imagesPanel .creation-image-card')).toHaveCount(1);
  await page.locator('#imagesPanel [data-action=edit-image]').click();
  await page.locator('#creationImageForm [name=prompt]').fill('Add morning light');
  await page.locator('#creationImageForm [type=submit]').click();
  await expect(page.locator('#imagesPanel .creation-image-card')).toHaveCount(2);
});

test('settings exposes appearance, language and model configuration', async ({ page }) => {
  await page.locator('#apiSettingsBtn').click();
  await expect(page.locator('.settings-modal--full')).toBeVisible();
  await expect(page.getByRole('button', { name: 'General' })).toBeVisible();
  await page.getByRole('button', { name: 'Models & voice' }).click();
  await expect(page.locator('#providerList')).toBeAttached();
  await expect(page.locator('.settings-pane:not([hidden]) input[placeholder="gpt-image-1"]')).toBeVisible();
});

test('new pages and settings fit a phone viewport in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => document.querySelector(`[data-theme-option="${value}"]`)?.click(), theme);
    await page.evaluate(() => window.openNav('sites'));
    await expect(page.locator('#sitesPanel')).toBeInViewport();
    await page.screenshot({ path: `/tmp/socrates-reference-mobile-sites-empty-${theme}-390x844.png` });
    const sizes = await page.evaluate(() => ({
      panel: document.getElementById('sitesPanel').getBoundingClientRect().width,
      viewport: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(sizes.panel).toBeLessThanOrEqual(sizes.viewport + 2);
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.viewport + 2);
  }
  await page.evaluate(() => window.openSettings());
  await expect(page.locator('.settings-modal--full')).toBeInViewport();
  await expect(page.locator('.settings-nav')).toBeVisible();
});
