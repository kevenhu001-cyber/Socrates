// e2e/composer-layout.spec.mjs — desktop composer geometry and the
// web-search chip flow. RN-7: the question box is the site ask-box
// (packages/ui/src/composer/ComposerFrame.tsx) — one white 24px sheet, two
// storeys always: the editor on top, the control rail underneath, the 36px
// controls inset 8px so they sit concentric with the corner.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function boot(page, { lang = 'zh', width = 1440 } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => { localStorage.setItem('socrates-websearch', 'false'); });
  await mockAuthedApp(page, { lang });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.locator('#composerInputWrap [data-composer-frame]').waitFor();
}

function measure(page, wrapSel) {
  return page.evaluate((wrapSel) => {
    const wrap = document.querySelector(wrapSel);
    const frame = wrap.querySelector('[data-composer-frame]');
    const box = (n) => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, w: r.width, cy: r.top + r.height / 2 }; };
    const controls = [...wrap.querySelectorAll('#composerToolsBtn, #effortTrigger, #composerMicBtn, #composerPrimaryBtn')]
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
      frame: box(frame),
      radius: parseFloat(getComputedStyle(frame).borderTopLeftRadius),
      shadow: getComputedStyle(frame).boxShadow,
      editor: box(wrap.querySelector('.rich-composer-editor')),
      rail: box(wrap.querySelector('[data-composer-slot="rail"]')),
      controls: controls.map((n) => ({ id: n.id || n.className, ...box(n), lines: lineCount(n) })),
      chip: wrap.querySelector('.composer-tool-chip') ? box(wrap.querySelector('.composer-tool-chip')) : null,
      legacyToggle: document.querySelectorAll('.composer-search-toggle-btn').length,
    };
  }, wrapSel);
}

/* Two storeys, controls concentric with the 24px corner. */
function expectAskBox(m) {
  expect(m.radius).toBe(24);
  expect(m.shadow).not.toBe('none');
  expect(Math.round(m.wrap.h)).toBe(Math.round(m.frame.h));
  expect(m.editor.bottom).toBeLessThanOrEqual(m.rail.top + 1);
  const centres = m.controls.map((c) => c.cy);
  expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(1);
  const plus = m.controls.find((c) => c.id === 'composerToolsBtn');
  const send = m.controls.find((c) => c.id === 'composerPrimaryBtn');
  expect(Math.round(plus.h)).toBe(36);
  expect(Math.round(send.h)).toBe(36);
  expect(Math.round(plus.left - m.frame.left)).toBe(8);
  expect(Math.round(m.frame.right - send.right)).toBe(8);
  expect(Math.round(m.frame.bottom - send.bottom)).toBe(8);
}

const RESTING_HEIGHT = 94; // 16 + 26 (one line) + 8 + 36 (rail) + 8

for (const lang of ['zh', 'en']) {
  test(`landing composer is the two-storey ask-box with centred, unwrapped controls (${lang})`, async ({ page }) => {
    await boot(page, { lang });
    const m = await measure(page, '#composerInputWrap');
    expect(m.legacyToggle).toBe(0);
    expectAskBox(m);
    expect(Math.round(m.frame.h)).toBe(RESTING_HEIGHT);
    for (const c of m.controls) expect(c.lines, `${c.id} must not wrap`).toBeLessThanOrEqual(1);
  });
}

for (const width of [1024, 1280]) {
  test(`in-session composer keeps the resting ask-box geometry at ${width}px`, async ({ page }) => {
    await boot(page, { width });
    await page.evaluate(() => {
      window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
      window.__testActivateMainView('chatView');
      document.body.dataset.conversationActive = 'true';
    });
    await page.waitForTimeout(300);
    const m = await measure(page, '#composerInputWrap');
    expectAskBox(m);
    expect(Math.round(m.frame.h)).toBe(RESTING_HEIGHT);
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
  await expect(wrap.locator('.composer-tool-chip[data-tool="webSearch"]')).toBeVisible();

  // The chip strip sits under the editor, inside the body slot, above the rail.
  const m = await measure(page, '#composerInputWrap');
  expect(m.editor.bottom).toBeLessThanOrEqual(m.chip.top + 2);
  expect(m.chip.bottom).toBeLessThanOrEqual(m.rail.top + 1);
  const centres = m.controls.map((c) => c.cy);
  expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(1);
  await expect(wrap.locator('.rich-composer')).toHaveAttribute('style', /Search the web/);

  await chip.click();
  await expect(chip).toHaveCount(0);
  await expect(wrap.locator('.composer-tool-chip[data-tool="webSearch"]')).toHaveCount(0);
  expect(Math.round((await wrap.boundingBox()).height)).toBe(RESTING_HEIGHT);
});
