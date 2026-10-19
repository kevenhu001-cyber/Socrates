import { expect, test } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const errorsByPage = new WeakMap();

test.beforeEach(({ page }) => {
  const errors = [];
  errorsByPage.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(({ page }) => expect(errorsByPage.get(page)).toEqual([]));

function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

async function boot(page, { mobile = false, theme = 'light' } = {}) {
  await page.setViewportSize(mobile ? { width: 390, height: 640 } : { width: 1440, height: 900 });
  await mockAuthedApp(page);
  await page.addInitScript((theme) => localStorage.setItem('socrates-theme', theme), theme);
  const session = { id: SESSION_ID, title: 'Menu fixture', mode: 'chat', phase: 'chat', kind: 'chat',
    updatedAt: new Date().toISOString(), createdAt: new Date().toISOString(), pinned: false, tags: [] };
  const fixture = { projects: [{ id: 'alpha', name: 'Project Alpha' }, { id: 'beta', name: 'Project Beta' }],
    projectStatus: 200, saveStatus: 200, projectGate: null, saveGate: null, patches: [] };
  await page.route(/\/api\/(?:v2\/)?sessions(?:\?|$)/, (route) => route.fulfill({ json: { sessions: [session] } }));
  await page.route(new RegExp(`/api/(?:v2/)?sessions/${SESSION_ID}(?:\\?|$)`), async (route) => {
    if (route.request().method() !== 'PATCH') return route.fulfill({ json: { ...session, messages: [] } });
    const patch = route.request().postDataJSON();
    fixture.patches.push(patch);
    if (fixture.saveGate) await fixture.saveGate.promise;
    if (fixture.saveStatus !== 200) return route.fulfill({ status: fixture.saveStatus, json: { error: 'Save failed' } });
    Object.assign(session, patch);
    return route.fulfill({ json: { session } });
  });
  await page.route(/\/api\/(?:v2\/)?projects(?:\?|$)/, async (route) => {
    if (fixture.projectGate) await fixture.projectGate.promise;
    return route.fulfill({ status: fixture.projectStatus, json: fixture.projectStatus === 200
      ? { projects: fixture.projects } : { error: 'Projects unavailable' } });
  });
  const initialProjects = page.waitForResponse(/\/api\/(?:v2\/)?projects(?:\?|$)/);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForAppShell(page);
  await (await initialProjects).finished();
  if (mobile) await page.locator('#sidebarOpenBtn').click();
  const row = page.locator(`.recent-item[data-recent-actual="${SESSION_ID}"]`);
  await expect(row).toBeVisible();
  return { fixture, row, trigger: row.locator('.recent-item-overflow'), menu: page.locator('.recent-item-menu[role="menu"]') };
}

test('keyboard opening, project navigation and dismissal preserve the session and focus', async ({ page }) => {
  const { trigger, menu } = await boot(page);
  const current = await page.evaluate(() => window.stateStore.read('currentSessionId'));
  await trigger.focus();
  await page.keyboard.press('ArrowUp');
  await expect(menu.locator('.recent-item-project')).toBeFocused();
  await page.keyboard.press('Enter');
  const back = menu.getByRole('menuitem', { name: 'Back', exact: true });
  await expect(menu.getByRole('menuitem', { name: 'Project Alpha' })).toBeVisible();
  await expect(back).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu.locator('.recent-item-project')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => window.stateStore.read('currentSessionId'))).toBe(current);
  await trigger.click();
  await expect(menu.locator('.recent-item-share')).toBeFocused();
  await page.keyboard.press('Tab');
  const destination = await page.locator(':focus').elementHandle();
  await expect(menu).toHaveCount(0);
  expect(await page.evaluate((node) => document.activeElement === node, destination)).toBe(true);
});

for (const action of ['Escape', 'Back']) {
  test(`${action} cancels project loading without restoring a stale picker`, async ({ page }) => {
    const { fixture, trigger, menu } = await boot(page);
    const loading = gate();
    fixture.projectGate = loading;
    try {
      await trigger.click();
      await menu.locator('.recent-item-project').click();
      await expect(menu.getByRole('status')).toHaveText('Loading projects…');
      if (action === 'Escape') await page.keyboard.press('Escape');
      else await menu.getByRole('menuitem', { name: 'Back', exact: true }).click();
      const response = page.waitForResponse(/\/api\/(?:v2\/)?projects(?:\?|$)/);
      loading.release();
      await (await response).finished();
      await page.evaluate(() => new Promise(requestAnimationFrame));
      if (action === 'Escape') {
        await expect(menu).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await trigger.click();
      }
      await expect(menu.locator('.recent-item-project')).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: 'Back', exact: true })).toHaveCount(0);
    } finally { loading.release(); }
  });
}

test('project lookup failure offers retry and an empty list retains Back', async ({ page }) => {
  const { fixture, trigger, menu } = await boot(page);
  fixture.projectStatus = 503;
  await trigger.click();
  await menu.locator('.recent-item-project').click();
  await expect(menu.getByRole('alert')).toHaveText('Could not load projects. Try again.');
  fixture.projectStatus = 200;
  fixture.projects = [];
  await menu.getByRole('menuitem', { name: 'Retry', exact: true }).click();
  await expect(menu).toContainText('Create a project first');
  await expect(menu.getByRole('menuitem', { name: 'Back', exact: true })).toBeFocused();
  await expect(menu.getByRole('alert')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(menu.locator('.recent-item-project')).toBeFocused();
});

test('project save remains open and disables choices until persistence succeeds', async ({ page }) => {
  const { fixture, trigger, menu } = await boot(page);
  const saving = gate();
  fixture.saveGate = saving;
  try {
    await trigger.click();
    await menu.locator('.recent-item-project').click();
    await menu.getByRole('menuitem', { name: 'Project Alpha' }).click();
    await expect(menu.getByRole('status')).toHaveText('Saving…');
    await expect(menu.getByRole('menuitem', { name: 'Project Alpha' })).toBeDisabled();
    await expect(menu.getByRole('menuitem', { name: 'Project Beta' })).toBeDisabled();
    await expect(menu.getByRole('menuitem', { name: 'Back', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    // Base UI deliberately keeps disabled menu items discoverable by keyboard.
    await expect(menu.getByRole('menuitem', { name: 'Project Alpha' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    expect(fixture.patches).toEqual([{ projectId: 'alpha' }]);
    saving.release();
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(menu.locator('.recent-item-share')).toBeFocused();
  } finally { saving.release(); }
});

test('failed project save keeps the picker usable for another choice', async ({ page }) => {
  const { fixture, trigger, menu } = await boot(page);
  fixture.saveStatus = 500;
  await trigger.click();
  await menu.locator('.recent-item-project').click();
  await menu.getByRole('menuitem', { name: 'Project Alpha' }).click();
  await expect(menu.getByRole('alert')).toHaveText('Could not save. Try again.');
  await expect(menu.getByRole('menuitem', { name: 'Project Beta' })).toBeEnabled();
  fixture.saveStatus = 200;
  await menu.getByRole('menuitem', { name: 'Project Beta' }).click();
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(fixture.patches).toEqual([{ projectId: 'alpha' }, { projectId: 'beta' }]);
});

test('rename keeps focus in the editor after menu exit and persists the new title', async ({ page }) => {
  const { fixture, row, trigger, menu } = await boot(page);
  await trigger.click();
  await menu.locator('.recent-item-rename').click();
  await expect(menu).toHaveCount(0);
  const input = row.locator('input[name="title"]');
  await expect(input).toBeFocused();
  await input.fill('Renamed fixture');
  await input.press('Enter');
  await expect(row.locator('.recent-item-text')).toHaveText('Renamed fixture');
  expect(fixture.patches).toEqual([{ title: 'Renamed fixture' }]);
});

for (const variant of ['desktop', 'phone']) {
  test(`session menu and project picker stay within the ${variant} viewport`, async ({ page }, testInfo) => {
    const { trigger, menu } = await boot(page, { mobile: variant === 'phone', theme: variant === 'phone' ? 'dark' : 'light' });
    await trigger.click();
    await expect(menu).toBeInViewport();
    await menu.evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    const checkBounds = async () => {
      const rect = await menu.boundingBox();
      const viewport = page.viewportSize();
      expect(rect.x).toBeGreaterThanOrEqual(5);
      expect(rect.y).toBeGreaterThanOrEqual(5);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width - 5);
      expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height - 5);
    };
    await checkBounds();
    await testInfo.attach(`session-menu-${variant}`, {
      body: await page.screenshot({ path: `test-results/session-menu-${encodeURIComponent(variant)}.png` }), contentType: 'image/png',
    });
    await menu.locator('.recent-item-project').click();
    await expect(menu.getByRole('menuitem', { name: 'Project Alpha' })).toBeVisible();
    await checkBounds();
    await testInfo.attach(`project-picker-${variant}`, {
      body: await page.screenshot({ path: `test-results/project-picker-${encodeURIComponent(variant)}.png` }), contentType: 'image/png',
    });
  });
}
