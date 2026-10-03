// e2e/theme-contrast.spec.mjs — light-mode colour and motion regressions.
//
// Pins the 2026-09-30 audit fixes:
//   - muted labels (disclaimer, recents section headers) clear WCAG AA on
//     the light page and sidebar; the composer placeholder keeps its
//     lighter reference tone;
//   - light surfaces never carry dark islands: phone code blocks, the phone
//     "+" menu icon chips, dialog cards;
//   - dialog scrims are the flat --ui-backdrop dim (no blur);
//   - the scrollbar thumb is visible on light surfaces;
//   - settled history rows do not replay the msgIn reveal and the boot
//     spinners stop once the app has booted;
//   - Plotly charts follow a light/dark switch after they mounted.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SESSION_ID = '77777777-7777-4777-8777-777777777777';
const RECENTS = [
  { id: SESSION_ID, title: 'Bayes', updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() },
  { id: 's-older', title: 'Older', updatedAt: new Date(Date.now() - 3 * 86400e3).toISOString(), createdAt: new Date().toISOString() },
];

function rgb(value) {
  const parts = (String(value).match(/[\d.]+/g) ?? []).map(Number);
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}
function luminance({ r, g, b }) {
  const [R, G, B] = [r, g, b].map((c) => {
    const n = c / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function openApp(page, { mode, viewport = { width: 1440, height: 900 }, session } = {}) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ colorScheme: mode });
  await page.addInitScript((m) => { try { localStorage.setItem('socrates-theme', m); } catch (_) {} }, mode);
  await mockAuthedApp(page);
  await page.route(/\/api\/(?:v2\/)?sessions(?:\?.*)?$/, (route) => (route.request().method() === 'GET'
    ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ sessions: RECENTS }) })
    : route.fallback()));
  if (session) {
    await page.route(new RegExp(`/api/(?:v2/)?sessions/${SESSION_ID}(?:\\?.*)?$`), (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ id: SESSION_ID, topic: 'Bayes', title: 'Bayes', mode: 'chat', kind: 'chat', phase: 'chat', kbNodes: [], mistakes: [], ...session }),
    }));
  }
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
}

async function loadSession(page) {
  await page.waitForFunction(() => typeof window.loadSession === 'function', null, { timeout: 15_000 });
  await page.evaluate((id) => window.loadSession(id), SESSION_ID);
  await expect(page.locator('#msgList .msg.assistant').first()).toBeVisible();
}

test('light muted labels clear AA and the placeholder keeps its reference tone', async ({ page }) => {
  await openApp(page, { mode: 'light' });
  const probe = await page.evaluate(() => {
    const pick = (selector) => {
      const node = document.querySelector(selector);
      return node ? getComputedStyle(node).color : null;
    };
    const root = getComputedStyle(document.documentElement);
    return {
      disclaimer: pick('#topicDisclaimer'),
      sectionLabel: pick('#recentsList .recents-time-label'),
      page: getComputedStyle(document.querySelector('.main-content')).backgroundColor,
      sidebar: getComputedStyle(document.getElementById('sidebar')).backgroundColor,
      placeholder: root.getPropertyValue('--ui-text-placeholder').trim(),
      thumb: root.getPropertyValue('--ui-scrollbar-thumb').trim(),
    };
  });
  expect(probe.disclaimer).not.toBeNull();
  expect(probe.sectionLabel).not.toBeNull();
  expect(contrast(rgb(probe.disclaimer), rgb(probe.page))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(rgb(probe.sectionLabel), rgb(probe.sidebar))).toBeGreaterThanOrEqual(4.5);
  expect(probe.placeholder).toBe('#8f8f8f');
  // A dark thumb on light surfaces (it used to be a 12% white alpha).
  const thumb = rgb(probe.thumb);
  expect(thumb.r).toBeLessThan(40);
  expect(thumb.a).toBeGreaterThan(0.1);
});

test('light dialogs are white cards over a flat token scrim', async ({ page }) => {
  await openApp(page, { mode: 'light' });
  await page.evaluate(() => window.openSettings());
  await expect(page.locator('#settingsOverlay')).toBeVisible();
  const settings = await page.evaluate(() => {
    const overlay = getComputedStyle(document.getElementById('settingsOverlay'));
    return { scrim: overlay.backgroundColor, blur: overlay.backdropFilter };
  });
  expect(rgb(settings.scrim).a).toBeLessThanOrEqual(0.5);
  expect(settings.blur).toBe('none');
  await page.evaluate(() => window.closeSettings());

  await page.evaluate(() => window.openCmdK());
  await expect(page.locator('#cmdKOverlay')).toBeVisible();
  const palette = await page.evaluate(() => getComputedStyle(document.getElementById('cmdKOverlay')).backdropFilter);
  expect(palette).toBe('none');
});

test('phone light code blocks are light cards', async ({ page }) => {
  const rich = ['Intro', '', '```python', 'print(1)', '```', '', 'Done.'].join('\n');
  await openApp(page, {
    mode: 'light',
    viewport: { width: 390, height: 844 },
    session: { messages: [
      { id: 'u1', role: 'user', rawText: 'hi', html: '<p>hi</p>' },
      { id: 'a1', role: 'assistant', rawText: rich, html: '' },
    ] },
  });
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) window.toggleSidebar?.();
  });
  await loadSession(page);
  const code = await page.evaluate(() => {
    const pre = document.querySelector('#msgList .msg.assistant pre');
    const header = document.querySelector('#msgList .msg.assistant .code-block-header');
    return {
      pre: pre ? getComputedStyle(pre).backgroundColor : null,
      preText: pre ? getComputedStyle(pre).color : null,
      header: header ? getComputedStyle(header).backgroundColor : null,
    };
  });
  expect(code.pre).not.toBeNull();
  expect(luminance(rgb(code.pre))).toBeGreaterThan(0.8);
  expect(contrast(rgb(code.preText), rgb(code.pre))).toBeGreaterThanOrEqual(7);
  if (code.header) expect(luminance(rgb(code.header))).toBeGreaterThan(0.8);
});

test('phone light tools menu keeps light icon chips', async ({ page }) => {
  await openApp(page, { mode: 'light', viewport: { width: 390, height: 844 } });
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) window.toggleSidebar?.();
  });
  await page.locator('#composerToolsBtn').click();
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeVisible();
  const chips = await menu.locator('.composer-tools-mobile-items .composer-tools-icon').evaluateAll((nodes) => nodes
    .filter((node) => node.getBoundingClientRect().width > 0)
    .map((node) => ({ bg: getComputedStyle(node).backgroundColor, color: getComputedStyle(node).color })));
  expect(chips.length).toBeGreaterThan(0);
  for (const chip of chips) {
    // Translucent chip token: composite it on the white sheet.
    const c = rgb(chip.bg);
    const onWhite = { r: c.r * c.a + 255 * (1 - c.a), g: c.g * c.a + 255 * (1 - c.a), b: c.b * c.a + 255 * (1 - c.a) };
    expect(luminance(onWhite)).toBeGreaterThan(0.8);
    expect(contrast(rgb(chip.color), onWhite)).toBeGreaterThanOrEqual(4.5);
  }
});

test('history rows do not replay the reveal and boot spinners stop', async ({ page }) => {
  const messages = [];
  for (let i = 0; i < 4; i += 1) {
    messages.push({ id: `u${i}`, role: 'user', rawText: `q${i}`, html: `<p>q${i}</p>` });
    messages.push({ id: `a${i}`, role: 'assistant', rawText: `answer ${i}`, html: '' });
  }
  await openApp(page, { mode: 'light', session: { messages } });
  const bootAnimations = await page.evaluate(() => document.getAnimations()
    .filter((animation) => animation.animationName === 'bootSpin' && animation.playState === 'running').length);
  expect(bootAnimations).toBe(0);
  await expect(page.locator('#bootLoading')).toHaveCSS('visibility', 'hidden');

  await loadSession(page);
  const rows = await page.locator('#msgList .msg.assistant[data-stream-settled]').evaluateAll((nodes) => nodes
    .map((node) => getComputedStyle(node).animationName));
  expect(rows.length).toBeGreaterThan(0);
  for (const name of rows) expect(name).toBe('none');
});

test('plotly charts follow a theme switch after mounting', async ({ page }) => {
  await openApp(page, {
    mode: 'dark',
    session: { messages: [
      { id: 'u1', role: 'user', rawText: 'plot', html: '<p>plot</p>' },
      { id: 'a1', role: 'assistant', rawText: 'Here.', html: '', toolCalls: [{
        id: 'viz-1',
        name: 'render_visualization',
        input: { version: 1, template: 'function', title: 'Parabola', caption: 'y = x²', accessibilitySummary: 'A parabola.', payload: { functions: [{ expression: 'x^2', label: 'y' }], xLabel: 'x', yLabel: 'y' } },
        output: 'ok',
        artifacts: [],
      }] },
    ] },
  });
  await loadSession(page);
  const tick = page.locator('.visualization-card .xtick text').first();
  await expect(tick).toBeVisible({ timeout: 20_000 });
  const darkFill = await tick.evaluate((node) => getComputedStyle(node).fill);
  expect(luminance(rgb(darkFill))).toBeGreaterThan(0.5);

  await page.evaluate(() => document.documentElement.setAttribute('data-mode', 'light'));
  await expect.poll(async () => luminance(rgb(await tick.evaluate((node) => getComputedStyle(node).fill))), { timeout: 5_000 })
    .toBeLessThan(0.2);
  const modebar = await page.locator('.visualization-card .modebar-group').first()
    .evaluate((node) => getComputedStyle(node).backgroundColor).catch(() => null);
  if (modebar) expect(rgb(modebar).a).toBe(0);
});
