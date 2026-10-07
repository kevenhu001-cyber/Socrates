import { test, expect } from '@playwright/test';

/**
 * Universal App smoke (apps/socrates web export). Self-contained: every
 * server call is routed to a mock, so it runs offline in CI. Covers the
 * migration modules Chat/Sidebar/Auth/Settings/Library-Projects/Search:
 * boot → projects list → rename → move session → filter → archive →
 * archived restore → search (local + server <mark> stripping) →
 * session delete → project delete.
 *
 * Served by `npm run test:universal` (export + serve + this spec). Do NOT
 * point it at the frozen mobile shell — that has its own rn-web-smoke.spec.
 */
test('universal app manages projects and sessions end to end', async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const sessions = [
    { id: 's1', title: 'HW 1', topic: '', mode: 'chat', phase: 'chat', projectId: 'p1' },
    { id: 's2', title: 'Free chat', topic: '', mode: 'chat', phase: 'chat', projectId: null },
  ];
  await page.route('**/auth/me', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'u1', email: 't@e.c', displayName: 'T', isGuest: false } }),
  }));
  await page.route('**/api/v2/projects', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ projects: [
      { id: 'p1', name: 'Math', description: 'Algebra', color: '#d72319' },
      { id: 'p2', name: 'Physics', description: '', color: '#027e6b' },
    ] }),
  }));
  await page.route('**/api/v2/sessions?limit=50', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sessions }),
  }));
  await page.route('**/api/v2/sessions?limit=50&archived=true', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sessions: [], nextCursor: null }),
  }));
  await page.route('**/api/v2/search', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ hits: [
      { kind: 'message', id: 7, sessionId: 's1', snippet: 'Lets solve <mark>x+2=5</mark> today', updatedAt: null, rank: 1 },
    ] }),
  }));
  // Settings also loads providers for the Models & keys entry subtitle.
  await page.route('**/api/v2/api-key', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [] }),
  }));
  // Library sync also loads the user's assistant personas (chat-header chip).
  await page.route('**/api/v2/creations/items/assistants', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }),
  }));
  await page.route('**/api/v2/account/usage', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      user: { id: 'u1', email: 't@e.c', displayName: 'T', tier: 'diophantus' },
      plan: { name: 'Diophantus' },
      usage: { sessionCount: 2, providerCount: 1, graphNodes: 5, beagleUsed: 1200, beagleLimit: 1000000 },
    }),
  }));
  await page.route('**/api/v2/sessions/s1', (route) => {
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 204, body: '' });
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...sessions[0], messages: [{ clientId: 'a0', role: 'assistant', rawText: 'Lets solve x+2=5.' }] }),
    });
  });
  await page.route('**/api/v2/sessions/s2', (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...sessions[1], projectId: 'p1' }),
      });
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...sessions[1], messages: [{ clientId: 'a1', role: 'assistant', rawText: 'Hello.' }] }),
    });
  });
  await page.route('**/api/v2/projects/p1', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 'p1', name: 'Maths', description: 'Algebra', color: '#d72319' }),
  }));
  await page.route('**/api/v2/projects/p2', async (route) => {
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(null) });
    return route.continue();
  });
  await page.route('**/api/v2/sessions/s1/archive', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }),
  }));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Choose model' })).toBeVisible({ timeout: 20000 });

  // Compact viewports (mobile project) start with the sidebar closed.
  // Settle after every screen/sidebar transition: the sidebar mounts
  // without entering animations, but web fonts still shift row layout,
  // which used to cancel taps between pointerdown/up.
  async function settle() {
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null)).catch(() => {});
    await page.waitForTimeout(400);
  }

  // The baseline chrome keeps navigation in the sidebar (parity/sidebar.css):
  // open the drawer first on phones, then use the nav rows.
  async function openSidebar() {
    const toggle = page.getByRole('button', { name: 'Toggle sidebar' });
    const nav = page.getByRole('button', { name: 'Open projects' });
    if (!(await nav.isVisible()) && (await toggle.isVisible())) {
      await toggle.click();
      await settle();
    }
  }

  async function selectRow(name) {
    const row = page.getByRole('button', { name, exact: true });
    if (!(await row.isVisible())) {
      await page.getByRole('button', { name: 'Toggle sidebar' }).click();
      await settle();
    }
    await expect(row).toBeVisible();
    await row.click();
    return row;
  }

  async function expectRowVisible(name) {
    const row = page.getByRole('button', { name, exact: true });
    if (!(await row.isVisible())) {
      await page.getByRole('button', { name: 'Toggle sidebar' }).click();
      await settle();
    }
    await expect(row).toBeVisible();
  }

  async function openSessionMenu(title) {
    const actions = page.getByRole('button', { name: `Session actions for ${title}` });
    if (!(await actions.isVisible())) {
      const toggle = page.getByRole('button', { name: 'Toggle sidebar' });
      if (await toggle.isVisible()) { await toggle.click(); await settle(); }
    }
    await actions.click();
  }

  // Projects list + rename.
  await openSidebar();
  await page.getByRole('button', { name: 'Open projects' }).click();
  await settle();
  await expect(page.getByRole('button', { name: 'Project Math' })).toBeVisible();
  await page.getByRole('button', { name: 'Rename Math' }).click();
  await page.getByLabel('Rename Math').fill('Maths');
  await page.getByRole('button', { name: 'Save name for Math' }).click();
  await expect(page.getByRole('button', { name: 'Project Maths' })).toBeVisible();

  // Back to chat, move Free chat into Maths via the session menu.
  await page.getByRole('button', { name: 'Back to chat' }).click();
  await settle();
  await selectRow('Free chat');
  await settle();
  await openSessionMenu('Free chat');
  await page.getByRole('button', { name: 'Move Free chat to project' }).click();
  await expect(page.getByText('Move “Free chat” to…')).toBeVisible();
  await page.getByRole('button', { name: 'Move to Maths' }).click();
  await expect(page.getByRole('button', { name: 'Choose model' })).toBeVisible();

  // Filter to Maths: both sessions visible, nothing else.
  await openSidebar();
  await page.getByRole('button', { name: 'Open projects' }).click();
  await settle();
  await page.getByRole('button', { name: 'Project Maths' }).click();
  await settle();
  await expect(page.getByRole('button', { name: /Clear project filter/ })).toBeVisible();
  await expectRowVisible('HW 1');
  await expectRowVisible('Free chat');

  // Archive HW 1 from the session menu: select it first, then archive.
  await selectRow('HW 1');
  await settle();
  await openSessionMenu('HW 1');
  await page.getByRole('button', { name: 'Archive HW 1' }).click();
  await expect(page.getByRole('button', { name: 'HW 1', exact: true })).toHaveCount(0);

  // Archived section lists HW 1; restoring brings it back to the sidebar.
  if (!(await page.getByRole('button', { name: 'Show archived conversations (1)' }).isVisible())) {
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await settle();
  }
  await page.getByRole('button', { name: 'Show archived conversations (1)' }).click();
  await expect(page.getByRole('button', { name: 'Restore HW 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore HW 1' }).click();
  await settle();
  await expectRowVisible('HW 1');


  // Search: instant local title hit plus the server message hit whose
  // <mark> highlight must render as literal text. Opening jumps to chat.
  await page.getByRole('button', { name: 'Find in conversation' }).click();
  await page.getByLabel('Search conversations').fill('hw');
  await expect(page.getByRole('button', { name: 'Open HW 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open message in conversation' })).toBeVisible();
  await expect(page.getByText('<mark>')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open HW 1' }).click();
  await settle();
  await expect(page.getByRole('button', { name: 'Choose model' })).toBeVisible();

  // Settings: tone presets, profile and server usage snapshot. Picking a
  // tone persists it to storage across a reload.
  await openSidebar();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByText('Assistant tone')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Friendly tone' })).toBeVisible();
  await expect(page.getByText('t@e.c')).toBeVisible();
  await expect(page.getByText('1,200 / 1,000,000')).toBeVisible();
  await page.getByRole('button', { name: 'Friendly tone' }).click();
  expect(await page.evaluate(() => localStorage.getItem('socrates.settings'))).toMatch(/"tone":"friendly"/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Choose model' })).toBeVisible({ timeout: 20000 });
  await openSidebar();
  await page.getByRole('button', { name: 'Open settings' }).click();
  expect(await page.evaluate(() => localStorage.getItem('socrates.settings'))).toMatch(/"tone":"friendly"/);
  await page.getByRole('button', { name: 'Back to chat' }).click();
  await settle();

  // Composer attachment entry points render; the native-only camera stays
  // hidden on web (no OS dialog is opened). Desktop Chromium ships
  // SpeechRecognition, so voice input renders there too. The attach items
  // live behind the composer's + menu, exactly like the baseline shell.
  await page.getByRole('button', { name: 'Add photos and files' }).click();
  await expect(page.getByRole('button', { name: 'Attach photos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attach a file' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take a photo' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add photos and files' }).click();
  await expect(page.getByRole('button', { name: 'Start voice input' })).toBeVisible();

  // Delete HW 1 from the session menu (two-tap confirm purges everywhere).
  await selectRow('HW 1');
  await settle();
  await openSessionMenu('HW 1');
  await page.getByRole('button', { name: 'Delete HW 1' }).click();
  await page.getByRole('button', { name: 'Confirm delete HW 1' }).click();
  await expect(page.getByRole('button', { name: 'HW 1', exact: true })).toHaveCount(0);

  // Delete Physics (two-tap confirm).
  await openSidebar();
  await page.getByRole('button', { name: 'Open projects' }).click();
  await settle();
  await page.getByRole('button', { name: 'Delete Physics' }).click();
  await page.getByRole('button', { name: 'Confirm delete Physics' }).click();
  await expect(page.getByRole('button', { name: 'Project Physics' })).toHaveCount(0);

  // Language switch re-labels the app without a reload, then back.
  await page.getByRole('button', { name: 'Back to chat' }).click();
  await settle();
  await openSidebar();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('button', { name: 'zh language' }).click();
  await expect(page.getByText('助手语气')).toBeVisible();
  await expect(page.getByRole('button', { name: '退出登录' })).toBeVisible();
  await page.getByRole('button', { name: '英文' }).click();
  await expect(page.getByText('Assistant tone')).toBeVisible();
  await expect(await page.evaluate(() => localStorage.getItem('socrates.settings'))).toMatch(/"language":"en"/);

  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
