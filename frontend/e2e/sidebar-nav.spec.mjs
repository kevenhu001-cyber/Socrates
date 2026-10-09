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

test('direct workspace routes restore navigation and browser history', async ({ page }) => {
  await gotoAndSettle(page, '/projects');
  await waitForAppShell(page);
  await expect(page.locator('.projects-directory')).toBeVisible();
  await expect(page.locator('#navProjects')).toHaveClass(/active/);

  await page.locator('#navLibrary').click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.locator('.library-directory')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator('.projects-directory')).toBeVisible();
  await expect(page.locator('#navProjects')).toHaveClass(/active/);
  await page.goForward();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.locator('#navLibrary')).toHaveClass(/active/);
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

test('Projects has one keyboard action and keeps creation in its directory', async ({ page }) => {
  const projectsNav = page.locator('#navProjects');
  await expect(projectsNav.locator('button, [role="button"]')).toHaveCount(0);
  await projectsNav.focus();
  await expect(projectsNav).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.locator('.projects-directory')).toBeVisible();
  const createProject = page.locator('.projects-directory .projects-create-button');
  await expect(createProject).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-qa/projects-directory-entry.png' });

  await createProject.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#projectForm')).toBeVisible();
});

test('phone workspace destinations hide the landing too', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    if (document.getElementById('sidebar')?.classList.contains('collapsed')) window.toggleSidebar();
  });
  await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
  await page.locator('#navPlugins').click();
  await expect(page.locator('#pluginsPanel')).toBeInViewport();
  await expect(page.locator('#topicSetup')).toBeHidden();
  await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
  await expect(page.locator('#sidebarBackdrop')).not.toHaveClass(/show/);
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

test('account row exposes profile and settings through its menu', async ({ page }) => {
  // Account identity is also the accessible trigger for the account menu.
  const row = page.locator('#sidebarUserRow .sidebar-account-trigger');
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('aria-haspopup', 'menu');
  await expect(row).toHaveCSS('cursor', 'pointer');
  /* Reference drawer identity — avatar + name over plan tier: all three are
     painted, and the full "name · tier" label stays in the tooltip and the
     accessible name. */
  const name = await page.evaluate(() => window.__socratesSidebarChromeBridge?.getSnapshot().user.displayName || '');
  expect(name.length).toBeGreaterThan(0);
  await expect(row.locator('.user-name')).toHaveText(name);
  await expect(row.locator('.user-avatar')).toBeVisible();
  await expect(row.locator('.tier-badge')).toBeVisible();
  await expect(row).toHaveAttribute('title', name);
  await expect(row).toHaveAttribute('aria-label', new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  const geo = await row.evaluate((el) => {
    const c = (sel) => { const r = el.querySelector(sel).getBoundingClientRect(); return { w: r.width, h: r.height, cy: r.top + r.height / 2 }; };
    return { avatar: c('.user-avatar'), identity: c('.user-identity'), radius: getComputedStyle(el.querySelector('.user-avatar')).borderTopLeftRadius };
  });
  expect(Math.round(geo.avatar.w)).toBe(32);
  expect(Math.round(geo.avatar.h)).toBe(32);
  expect(geo.radius).toBe('50%');
  expect(Math.abs(geo.avatar.cy - geo.identity.cy)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/visual-qa/sidebar-account-row.png', clip: await page.locator('#sidebarFooter').boundingBox() });
  await row.click();
  await expect(page.locator('.sidebar-account-menu')).toBeInViewport();
  await page.keyboard.press('Escape');
  // The gear still opens the settings modal, whose account pane carries
  // the profile entry.
  await page.locator('#apiSettingsBtn').click();
  const overlay = page.locator('#settingsOverlay');
  await expect(overlay).toBeVisible();
  await overlay.locator('.settings-nav button').last().click();
  await expect(overlay.locator('.settings-account-card')).toBeVisible();
});

test('collapsed sidebar rail keeps only the avatar of the account row', async ({ page }) => {
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) window.toggleSidebar?.();
  });
  await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
  const row = page.locator('#sidebarUserRow');
  await expect(row.locator('.user-avatar')).toBeVisible();
  await expect(row.locator('.user-identity')).toBeHidden();
  const fit = await page.evaluate(() => {
    const rail = document.getElementById('sidebar').getBoundingClientRect();
    const a = document.querySelector('#sidebarUserRow .user-avatar').getBoundingClientRect();
    return { inside: a.left >= rail.left && a.right <= rail.right, offCentre: Math.abs((a.left + a.right) / 2 - (rail.left + rail.right) / 2) };
  });
  expect(fit.inside).toBe(true);
  expect(fit.offCentre).toBeLessThanOrEqual(4);
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
    // Keep the full 48px phone touch target declared by the mobile sidebar
    // owner; the older 40px assertion no longer matches the drawer geometry.
    expect(row.height).toBe(48);
    expect(Math.abs(row.glyphCenter - row.labelCenter)).toBeLessThanOrEqual(2);
  }
  // Portaled account menus stay inside the phone viewport.
  const accountRow = page.locator('#sidebarUserRow .sidebar-account-trigger');
  await expect(accountRow).toBeInViewport();
  await accountRow.click();
  await expect(page.locator('.sidebar-account-menu')).toBeInViewport();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/socrates-reference-mobile-account-390x769.png' });
});

test('mobile free-tier upgrade pill stays in the top bar at 390px', async ({ page }) => {
  // Regression guard for the WIP that hid the pill below 560px. The
  // bridge defaults `tier: 'diophantus'` so this test stays effective
  // without an explicit user override, but we set it for clarity.
  await mockAuthedApp(page, { user: { tier: 'diophantus' } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.dataset.userTier = 'diophantus'; });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  const pill = page.locator('#mobileUpgradeBtn');
  await expect(pill).toBeVisible();
  await expect(pill).toHaveAttribute('href', /pricing/);
  await expect(pill).toHaveAttribute('aria-label', /\S+/);
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
  const displays = await page.locator('#shareBtn, #findBtn, #chatModelWrap').evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).display),
  );
  expect(displays).toEqual(['none', 'none', 'none']);
  // Leaving the console drops the admin body class and restores chrome.
  await page.evaluate(() => window.openNav('library'));
  await expect(page.locator('#shareBtn')).toBeVisible();
});
