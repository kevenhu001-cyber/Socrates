import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { gotoAndSettle } from './_lib.mjs';

async function boot(page, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await mockAuthedApp(page);
  await page.addInitScript(() => {
    if (window.top === window) localStorage.setItem('socrates-theme', 'light');
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
}

async function openArtifact(page) {
  await page.evaluate(() => {
    let trigger = document.getElementById('auditPreview');
    if (!trigger) {
      trigger = document.createElement('button');
      trigger.id = 'auditPreview';
      trigger.textContent = 'Preview';
      trigger.setAttribute('data-artifact-preview', '1');
      trigger.setAttribute('data-artifact-url', '/logo.png');
      trigger.setAttribute('data-artifact-mime', 'image/png');
      trigger.setAttribute('data-artifact-name', 'Logo');
      document.getElementById('topicSetup').appendChild(trigger);
    }
    trigger.click();
  });
  await expect(page.locator('.detail-surface')).toBeVisible();
}

test('reasoning and artifact replace each other in one docked detail shell', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__socratesThinkingPanelBridge.publish({ type: 'panel-open' }));
  await expect(page.locator('[data-thinking-panel="1"]')).toBeVisible();
  await openArtifact(page);
  await expect(page.locator('[data-thinking-panel="1"]')).toHaveCount(0);
  await expect(page.locator('.detail-surface')).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('data-detail-layout', 'docked');
  const bounds = await page.evaluate(() => ({ main: document.querySelector('.main').getBoundingClientRect().right, detail: document.querySelector('.detail-surface').getBoundingClientRect().left }));
  expect(bounds.main).toBeLessThanOrEqual(bounds.detail + 1);
  const footer = await page.locator('#topicDisclaimer').boundingBox();
  expect(footer.x + footer.width).toBeLessThanOrEqual(bounds.detail + 1);
  await page.screenshot({ path: 'test-results/detail-surface-desktop.png' });
  await page.evaluate(() => window.__socratesThinkingPanelBridge.publish({ type: 'panel-open' }));
  await expect(page.locator('[data-thinking-panel="1"]')).toBeVisible();
  await expect(page.locator('.artifact-preview-image')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.detail-root')).toBeHidden();
});

test('navigation clears detail and workspace hides chat-specific chrome', async ({ page }) => {
  await boot(page);
  await openArtifact(page);
  await page.locator('#navSites').click();
  await expect(page.locator('#sitesPanel')).toBeVisible();
  await expect(page.locator('.detail-root')).toBeHidden();
  await expect(page.locator('#topModelSwitcher')).toBeHidden();
  await page.screenshot({ path: 'test-results/detail-surface-workspace.png' });
  await page.locator('#newChatBtn').click();
  await expect(page.locator('#topModelSwitcher')).toBeVisible();
});

test('mobile detail fills one viewport and traps focus until dismissed', async ({ page }) => {
  await boot(page, 390);
  await openArtifact(page);
  await expect(page.locator('#appShell')).toHaveJSProperty('inert', true);
  const box = await page.locator('.detail-surface').boundingBox();
  expect(box.width).toBeCloseTo(390, 1);
  expect(box.height).toBeCloseTo(900, 1);
  await page.keyboard.press('Tab');
  await expect(page.locator('.detail-close')).toBeFocused();
  await page.screenshot({ path: 'test-results/detail-surface-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#appShell')).toHaveJSProperty('inert', false);
  await expect(page.locator('.detail-root')).toBeHidden();
});

test('site draft preview shares the detail shell and preserves the page editor', async ({ page }) => {
  await boot(page);
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v2/', '/api/');
    if (path !== '/api/creations/items/sites' || route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { items: [{ id: 'draft-site', title: 'Draft site', source: '<h1>Original</h1>', visibility: 'private' }] } });
  });
  await page.locator('#navSites').click();
  await page.locator('#sitesPanel [data-action="edit"]').first().click();
  await expect(page.locator('#sitesPanel [data-creation-list]')).toHaveCount(0);
  const source = page.locator('.creation-editor [name="source"]');
  await source.fill('<h1>Revised draft</h1>');
  await page.locator('[data-action="preview-draft"]').click();
  await expect(page.locator('.detail-surface')).toBeVisible();
  await expect(page.locator('.creation-preview-overlay, .creation-editor-backdrop')).toHaveCount(0);
  await expect(page.locator('.creation-preview-frame')).toHaveAttribute('srcdoc', '<h1>Revised draft</h1>');
  await page.locator('.detail-close').click();
  await expect(source).toHaveValue('<h1>Revised draft</h1>');
  expect(runtimeErrors).toEqual([]);
});
