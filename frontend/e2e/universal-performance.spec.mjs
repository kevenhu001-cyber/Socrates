import { test, expect } from '@playwright/test';

async function mockAccount(page, sessions = []) {
  await page.route('**/api/v2/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body = {};
    if (path.endsWith('/auth/me')) body = { user: { id: 'perf-user', email: 'test@example.com', displayName: 'Reader' } };
    else if (path.endsWith('/sessions')) body = route.request().method() === 'POST'
      ? { ...route.request().postDataJSON(), id: '11111111-1111-4111-8111-111111111111' }
      : { sessions, nextCursor: null };
    else if (path.endsWith('/chat/stream')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"Keyboard response"}}]}\n\ndata: [DONE]\n\n' });
    else if (path.endsWith('/projects')) body = { projects: [] };
    else if (path.endsWith('/api-key')) body = { providers: [] };
    else if (path.endsWith('/assistants')) body = { items: [] };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('font downloads never block authentication or typing', async ({ page }) => {
  const pending = [];
  // Hold every font response until the UI has already become interactive.
  // This catches a font readiness gate, not merely successful error fallback.
  await page.route('**/*.woff2', (route) => new Promise((resolve) => pending.push({ route, resolve })));
  await page.route('**/api/v2/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Unauthorized"}' }));
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 5000 });
    const email = page.getByLabel('Email', { exact: true });
    await email.fill('reader@example.com');
    await expect(email).toHaveValue('reader@example.com');
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    for (const { route, resolve } of pending) { await route.abort().catch(() => {}); resolve(); }
  }
});

test('English startup requests no large Chinese font files', async ({ page }) => {
  const largeCjkRequests = [];
  page.on('request', (request) => {
    if (/NotoSansSC-(400|500|600)\./.test(request.url())) largeCjkRequests.push(request.url());
  });
  await mockAccount(page);
  await page.goto('/');
  const composer = page.getByLabel('Ask Socrates', { exact: true });
  await expect(composer).toBeVisible();
  await composer.pressSequentially('A responsive composer', { delay: 5 });
  await expect(composer).toHaveValue('A responsive composer');
  await expect(composer).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
  expect(largeCjkRequests).toEqual([]);
  expect(await page.locator('#socrates-web-fonts').count()).toBe(1);
});

test('Chinese content loads its face on demand without replacing the font stack', async ({ page }) => {
  const cjkRequests = [];
  page.on('request', (request) => {
    if (/NotoSansSC-(400|500|600)\./.test(request.url())) cjkRequests.push(request.url());
  });
  await mockAccount(page);
  await page.goto('/');
  const composer = page.getByLabel('Ask Socrates', { exact: true });
  await composer.fill('解释一下勾股定理');
  await expect(composer).toHaveValue('解释一下勾股定理');
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => cjkRequests.length).toBeGreaterThan(0);
  // Only the normal-weight face is needed for typed text, not every weight.
  expect(cjkRequests.every((url) => /NotoSansSC-400\./.test(url))).toBe(true);
});

test('starter prompts fill the draft without sending and the editor grows for multiline text', async ({ page }) => {
  let streams = 0;
  page.on('request', (request) => { if (new URL(request.url()).pathname.endsWith('/chat/stream')) streams++; });
  await mockAccount(page);
  await page.goto('/');
  const composer = page.getByLabel('Ask Socrates', { exact: true });
  await page.getByRole('button', { name: 'Explain a concept', exact: true }).click();
  await expect(composer).toHaveValue('Explain a concept');
  expect(streams).toBe(0);
  const before = await composer.boundingBox();
  await composer.fill('Line one\nLine two\nLine three\nLine four');
  await expect.poll(async () => (await composer.boundingBox()).height).toBeGreaterThan(before.height);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('desktop Enter sends once, Shift+Enter and IME confirmation do not send', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Mobile return inserts a newline.');
  const requests = [];
  page.on('request', (request) => { if (new URL(request.url()).pathname.endsWith('/chat/stream')) requests.push(request.postDataJSON()); });
  await mockAccount(page);
  await page.goto('/');
  const composer = page.getByLabel('Ask Socrates', { exact: true });
  await composer.fill('First line');
  await composer.press('Shift+Enter');
  await expect(composer).toHaveValue('First line\n');
  await composer.pressSequentially('Second line');
  await composer.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229, bubbles: true });
  await expect(composer).toHaveValue('First line\nSecond line');
  expect(requests).toHaveLength(0);
  await composer.press('Enter');
  await expect(page.getByText('Keyboard response', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
  await expect(composer).toHaveValue('');
  await expect(composer).toBeFocused();
});

for (const theme of ['dark', 'light']) {
  test(`${theme} landing keeps the composer visible and suggestions usable`, async ({ page }, testInfo) => {
    await page.addInitScript((mode) => localStorage.setItem('socrates.settings', JSON.stringify({ theme: mode, language: 'en' })), theme);
    await mockAccount(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'How can I help you learn today?' })).toBeVisible();
    await expect(page.getByLabel('Ask Socrates', { exact: true })).toBeInViewport();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `test-results/universal-landing-${theme}-${encodeURIComponent(testInfo.project.name)}.png` });
  });
}
