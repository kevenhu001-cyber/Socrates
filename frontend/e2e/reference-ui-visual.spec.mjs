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
  if (await sidebar.isVisible().catch(() => false)) return;
  await page.locator('#sidebarOpenBtn').click();
  await expect(sidebar).toBeVisible();
}

test('reference app surfaces render at mobile and desktop target sizes', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'zh' });
  await mockReferenceCatalog(page);

  await page.setViewportSize({ width: 390, height: 756 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) window.toggleSidebar?.();
  });
  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect(page.locator('#modeSegmentedTop')).toBeVisible();
  await expect(page.locator('#topicInputWrap')).toBeVisible();
  await page.screenshot({ path: '/tmp/socrates-reference-mobile-home-390x756.png', fullPage: true });

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
  expect(mobileGeometry.mode?.width).toBeGreaterThanOrEqual(168);
  expect(mobileGeometry.mode?.height).toBeGreaterThanOrEqual(40);
  expect(mobileGeometry.composer?.width).toBeGreaterThanOrEqual(320);
  expect(mobileGeometry.composer?.height).toBeGreaterThanOrEqual(100);
  expect(mobileGeometry.composer?.height).toBeLessThanOrEqual(140);
  expect(mobileGeometry.plus?.width).toBe(40);
  expect(mobileGeometry.send?.width).toBe(40);
  expect(mobileGeometry.background).toBe('rgb(0, 0, 0)');

  await page.locator('#topicComposerToolsBtn').click();
  const toolsMenu = page.locator('#composerToolsMenu');
  await expect(toolsMenu).toBeVisible();
  const toolsBox = await toolsMenu.boundingBox();
  expect(toolsBox?.width).toBeGreaterThanOrEqual(240);
  expect(toolsBox?.width).toBeLessThanOrEqual(260);
  await page.screenshot({ path: '/tmp/socrates-reference-mobile-tools-390x756.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(toolsMenu).toBeHidden();

  await openSidebar(page);
  await page.evaluate(() => document.getElementById('navPlugins')?.click());
  await expect(page.locator('.plugin-directory')).toBeVisible();
  await page.screenshot({ path: '/tmp/socrates-reference-mobile-plugins-390x756.png', fullPage: true });
  await page.evaluate(() => document.getElementById('navProjects')?.click());
  await expect(page.locator('.projects-directory')).toBeVisible();
  await expect(page.locator('.project-row').filter({ hasText: 'Socrates' })).toBeVisible();
  await page.screenshot({ path: '/tmp/socrates-reference-mobile-projects-390x756.png', fullPage: true });
  await page.evaluate(() => document.getElementById('navScheduled')?.click());
  await expect(page.locator('.scheduled-directory')).toBeVisible();
  await expect(page.locator('.scheduled-recommendation')).toHaveCount(5);
  await page.screenshot({ path: '/tmp/socrates-reference-mobile-scheduled-390x756.png', fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar?.classList.contains('collapsed')) window.toggleSidebar?.();
    document.getElementById('navNew')?.click();
  });
  await expect(page.locator('#topicSetup')).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/tmp/socrates-reference-desktop-home-1440x900.png', fullPage: true });
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
});
