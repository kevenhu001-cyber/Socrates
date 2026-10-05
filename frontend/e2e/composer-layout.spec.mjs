// e2e/composer-layout.spec.mjs — desktop composer geometry (chatgpt.com
// parity, docs/ref/chatgpt-parity.md) and the web-search chip flow.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function boot(page, { lang = 'zh', width = 1440 } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => { localStorage.setItem('socrates-websearch', 'false'); });
  await mockAuthedApp(page, { lang });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
}

function measure(page, wrapSel) {
  return page.evaluate((wrapSel) => {
    const wrap = document.querySelector(wrapSel);
    const box = (n) => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, w: r.width, cy: r.top + r.height / 2 }; };
    const controls = [...wrap.querySelectorAll('.composer-tools-trigger, .effort-trigger, .mobile-mic-btn, #composerPrimaryBtn, #composerPrimaryBtn')]
      .filter((n) => n.getClientRects().length);
    const range = document.createRange();
    const lineCount = (n) => {
      range.selectNodeContents(n);
      // Cluster rect tops: inline spans/icons on one line differ by a few px.
      const tops = [...range.getClientRects()].filter((r) => r.width > 0).map((r) => r.top).sort((a, b) => a - b);
      return tops.reduce((acc, t) => (acc.length && t - acc[acc.length - 1] < 10 ? acc : [...acc, t]), []).length;
    };
    return {
      wrap: box(wrap),
      radius: parseFloat(getComputedStyle(wrap).borderTopLeftRadius),
      editor: box(wrap.querySelector('.rich-composer-editor')),
      controls: controls.map((n) => ({ id: n.id || n.className, ...box(n), lines: lineCount(n) })),
      chip: wrap.querySelector('.composer-tool-chip') ? box(wrap.querySelector('.composer-tool-chip')) : null,
      legacyToggle: document.querySelectorAll('.composer-search-toggle-btn').length,
    };
  }, wrapSel);
}

for (const lang of ['zh', 'en']) {
  test(`landing composer is one 52px row with centred, unwrapped controls (${lang})`, async ({ page }) => {
    await boot(page, { lang });
    const m = await measure(page, '#composerInputWrap');
    expect(m.legacyToggle).toBe(0);
    expect(Math.round(m.wrap.h)).toBe(52);
    expect(m.radius).toBe(28);
    const centres = m.controls.map((c) => c.cy);
    expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(1);
    for (const c of m.controls) expect(c.lines, `${c.id} must not wrap`).toBeLessThanOrEqual(1);
  });
}

for (const width of [1024, 1280]) {
  test(`in-session composer stays a single aligned row at ${width}px`, async ({ page }) => {
    await boot(page, { width });
    await page.evaluate(() => {
      window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
      window.__testActivateMainView('chatView');
      document.body.dataset.conversationActive = 'true';
    });
    await page.waitForTimeout(300);
    const m = await measure(page, '#composerInputWrap');
    expect(Math.round(m.wrap.h)).toBe(52);
    const centres = m.controls.map((c) => c.cy);
    expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(1);
  });
}

test('web search is picked from the + menu, shows a removable chip, and clears', async ({ page }) => {
  await boot(page, { lang: 'en' });
  const wrap = page.locator('#composerInputWrap');
  await page.locator('#composerToolsBtn').click();
  await page.locator('#composerToolsMenu [data-composer-action="webSearch"]:visible').first().click();

  const chip = wrap.locator('.composer-tool-chip[data-tool="webSearch"]');
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('aria-label', 'Web search, click to remove');
  expect(await page.evaluate(() => window.webSearchOn)).toBe(true);

  // chatgpt.com layout: editor on its own row, chip in the footer after "+".
  const m = await measure(page, '#composerInputWrap');
  const plus = m.controls.find((c) => c.id === 'composerToolsBtn');
  expect(m.editor.bottom).toBeLessThanOrEqual(m.chip.top + 2);
  expect(Math.abs(m.chip.cy - plus.cy)).toBeLessThanOrEqual(1);
  const centres = m.controls.map((c) => c.cy);
  expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(1);
  await expect(wrap.locator('.rich-composer')).toHaveAttribute('style', /Search the web/);

  await chip.click();
  await expect(chip).toHaveCount(0);
  expect(await page.evaluate(() => window.webSearchOn)).toBe(false);
  expect(Math.round((await wrap.boundingBox()).height)).toBe(52);
});
