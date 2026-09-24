import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
});

test('sidebar exposes the primary destinations', async ({ page }) => {
  const visibleIds = await page.locator('#sidebarNav > .sidebar-nav-btn').evaluateAll((buttons) =>
    buttons.filter((button) => getComputedStyle(button).display !== 'none').map((button) => button.id),
  );
  expect(visibleIds).toEqual([
    'navNew',
    'navLibrary',
    'navProjects',
    'navScheduled',
    'navPlugins',
    'navSites',
    'navMore',
  ]);

  for (const id of ['navExam', 'navImages', 'navAssistants', 'navSkills']) {
    await expect(page.locator(`#${id}`)).toBeHidden();
  }
  await expect(page.locator('#navMore')).toHaveCount(1);
});

test('Plugins is a direct sidebar destination', async ({ page }) => {
  await page.locator('#navPlugins').click();
  await expect(page.locator('#navPlugins')).toHaveClass(/active/);
  await expect(page.locator('#pluginsPanel')).toBeVisible();
  /* The React directory opens on the public scope (plugin-directory.spec
     owns the detailed scope/filter matrix). The default smoke catalog has
     no connected apps, so the landing view lists every plugin. */
  await expect(page.locator('.plugin-directory')).toBeVisible();
  await expect(page.locator('.plugin-directory-row')).toHaveCount(5);
  /* The static 插件 / 技能 switch was removed from the shell header. */
  await expect(page.locator('#pluginsPanel .plugins-panel-tabs')).toHaveCount(0);
});

test('workspace destinations replace the chat landing instead of stacking under it', async ({ page }) => {
  /* Regression: the forced `#topicSetup { display:flex !important }` landing
     rules used to outrank `.hidden`, so selecting a sidebar page left the
     greeting/composer on screen and pushed the panel below the fold. */
  for (const [navId, panelId] of [['navPlugins', '#pluginsPanel'], ['navProjects', '#spacesPanel']]) {
    await page.locator(`#${navId}`).click();
    await expect(page.locator(`#${navId}`)).toHaveClass(/active/);
    await expect(page.locator(panelId)).toBeInViewport();
    await expect(page.locator('#topicSetup')).toBeHidden();
    await expect(page.locator('#chatView')).toBeHidden();
  }
});

test('phone workspace destinations hide the landing too', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.openNav('plugins'));
  await expect(page.locator('#pluginsPanel')).toBeInViewport();
  await expect(page.locator('#topicSetup')).toBeHidden();
});

test('desktop share control renders its svg, not the text label', async ({ page }) => {
  /* Regression: the text label used to stay visible on desktop and the
     flex container squeezed the 14px glyph to width 0, so the button
     read as bare "Share" text instead of the icon. */
  await page.evaluate(() => {
    document.body.dataset.conversationActive = 'true';
    document.getElementById('shareBtn')?.classList.remove('hidden');
  });
  const share = await page.locator('#shareBtn').evaluate((el) => {
    const svg = el.querySelector('svg');
    const label = el.querySelector('.share-btn-label');
    return {
      svgWidth: svg ? svg.getBoundingClientRect().width : 0,
      svgHeight: svg ? svg.getBoundingClientRect().height : 0,
      labelDisplay: label ? getComputedStyle(label).display : null,
    };
  });
  expect(share.svgWidth).toBeGreaterThan(0);
  expect(share.svgHeight).toBeGreaterThan(0);
  expect(share.labelDisplay).toBe('none');
});

test('Exam is a direct sidebar destination', async ({ page }) => {
  await page.evaluate(() => window.openNav('exam'));
  await expect(page.locator('#navExam')).toHaveClass(/active/);
  await expect(page.locator('#examView')).toBeVisible();
});

test('More keeps secondary settings and Skills reachable', async ({ page }) => {
  await page.locator('#navMore').click();
  await expect(page.locator('#moreNavPopover')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Skills|技能/ })).toBeVisible();
  await page.getByRole('menuitem', { name: /Keyboard shortcuts|键盘快捷键/ }).click();
  await expect(page.locator('#cheatsheetOverlay')).toBeVisible();
});

test('account row opens a compact menu and its profile action works', async ({ page }) => {
  const trigger = page.locator('.sidebar-account-trigger');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const menu = page.getByRole('menu', { name: /Account menu|账户菜单/ });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: /Profile|个人资料/ }).click();
  await expect(page.locator('#profileOverlay')).toBeVisible();
});

test('phone drawer keeps nav glyphs aligned and account menu in view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 769 });
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar?.classList.contains('collapsed')) window.toggleSidebar?.();
  });
  const rows = await page.locator('#sidebarNav .sidebar-nav-btn:visible').evaluateAll((buttons) => buttons.map((button) => {
    const row = button.getBoundingClientRect();
    const glyph = button.querySelector('svg')?.getBoundingClientRect();
    const label = button.querySelector('[data-i18n-key]')?.getBoundingClientRect();
    return { height: row.height, glyphCenter: glyph && glyph.y + glyph.height / 2, labelCenter: label && label.y + label.height / 2 };
  }));
  expect(rows).toHaveLength(7);
  for (const row of rows) {
    expect(row.height).toBe(40);
    expect(Math.abs(row.glyphCenter - row.labelCenter)).toBeLessThanOrEqual(2);
  }
  await page.locator('.sidebar-account-trigger').click();
  const menu = page.getByRole('menu', { name: /Account menu|账户菜单/ });
  await expect(menu).toBeInViewport();
  await page.screenshot({ path: '/tmp/socrates-reference-mobile-account-390x769.png' });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('Admin console is a standalone /admin page with no sidebar entry', async ({ page }) => {
  // The operator console is deliberately not advertised in the nav —
  // it is reached only through the standalone route.
  await expect(page.locator('#navAdmin')).toHaveCount(0);
  await page.evaluate(() => window.openNav('admin'));
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator('#adminPanel')).toBeVisible();
  // Unauthenticated (mock API has no admin session): the login form
  // renders instead of the console.
  await expect(page.locator('.admin-login')).toBeVisible();
});

test('Admin page hides the chat top-bar chrome', async ({ page }) => {
  // Simulate an active session: the chat runtime unhides the share /
  // find / model controls, which must all disappear on /admin.
  await page.evaluate(() => {
    for (const id of ['shareBtn', 'findBtn', 'chatModelWrap']) {
      document.getElementById(id)?.classList.remove('hidden');
    }
  });
  await page.evaluate(() => window.openNav('admin'));
  await expect(page.locator('#adminPanel')).toBeVisible();
  const displays = await page.locator('#shareBtn, #findBtn, #chatModelWrap, #modeSegmentedTop').evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).display),
  );
  expect(displays).toEqual(['none', 'none', 'none', 'none']);
  // Leaving the console drops the admin body class and restores chrome.
  await page.evaluate(() => window.openNav('library'));
  await expect(page.locator('#shareBtn')).toBeVisible();
});

test('Admin page hides the mode pill on phone viewports too', async ({ page }) => {
  // The <=768px mobile-reference stylesheet force-shows the pill with
  // a double-ID selector; the admin override must outrank it.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.openNav('admin'));
  await expect(page.locator('#adminPanel')).toBeVisible();
  const display = await page.locator('#modeSegmentedTop').evaluate((el) => getComputedStyle(el).display);
  expect(display).toBe('none');
});
