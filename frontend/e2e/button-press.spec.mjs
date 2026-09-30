// e2e/button-press.spec.mjs — one press language for every control.
//
// styles/polish/press.css owns paint-only press feedback without changing
// control or icon geometry, and ui/pressFeedback.js keeps `.is-pressed`
// long enough for a fast tap to paint. These cases check the computed result
// in a real browser:
//   - buttons and icon buttons stay at scale 1 while held and released;
//   - row-style controls acknowledge the press with a stable tint;
//   - a quick touch tap still shows the pressed state for >1 frame;
//   - disabled controls and reduced motion remain geometrically stable.

import { test } from './_lib.mjs';
import { expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function boot(page, opts = {}) {
  await mockAuthedApp(page);
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
}

/* The rendered scale of `selector` while the paint-only pressed state is held.
   `scale: none` computes to "none" and is normalized to the stable value 1. */
function computedScale(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const value = getComputedStyle(el).scale;
    if (!value || value === 'none') return 1;
    return parseFloat(value);
  }, selector);
}

async function holdAndMeasure(page, selector) {
  const target = page.locator(selector).first();
  /* Only the painted icon has geometry. A control may carry several svgs
     where one is switched off by mode (`.theme-toggle` renders sun + moon
     and hides the one for the inactive mode), and a hidden svg measures
     null — which would read as "the icon moved" instead of "there is no
     icon to measure". */
  const icon = target.locator('svg:visible').first();
  const opacityOf = () => page.evaluate((sel) => parseFloat(getComputedStyle(document.querySelector(sel)).opacity), selector);
  const box = await target.boundingBox();
  const iconBefore = await icon.count() ? await icon.boundingBox() : null;
  const opacityBefore = await opacityOf();
  expect(box, `${selector} is on screen`).not.toBeNull();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(160);
  const pressed = await computedScale(page, selector);
  const boxDuring = await target.boundingBox();
  const iconDuring = iconBefore ? await icon.boundingBox() : null;
  const opacityDuring = await opacityOf();
  await page.mouse.up();
  await page.waitForTimeout(400);
  const released = await computedScale(page, selector);
  const opacityReleased = await opacityOf();
  return {
    pressed, released, boxBefore: box, boxDuring, iconBefore, iconDuring,
    opacityBefore, opacityDuring, opacityReleased,
  };
}

test('the primary composer button stays geometrically stable while pressed', async ({ page }) => {
  await boot(page);
  const { pressed, released } = await holdAndMeasure(page, '#startBtn');
  expect(pressed).toBe(1);
  expect(released).toBe(1);
});

test('a generic button uses stable paint-only feedback', async ({ page }) => {
  await boot(page);
  /* Inject a plain button so the check does not depend on a particular
     screen's layout. */
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.id = 'pressProbe';
    b.textContent = 'Probe';
    b.style.cssText = 'position:fixed;left:40px;top:40px;z-index:99999;padding:12px 24px';
    document.body.appendChild(b);
  });
  const { pressed, released, opacityBefore, opacityDuring, opacityReleased } = await holdAndMeasure(page, '#pressProbe');
  expect(pressed).toBe(1);
  expect(released).toBe(1);
  /* Stable geometry is only half the contract — the press has to be *seen*.
     press.css reads --ui-press-opacity, and a missing token makes the whole
     `opacity` declaration invalid at computed-value time, which drops the
     feedback while every scale assertion above still passes. */
  expect(opacityDuring).toBeLessThan(opacityBefore);
  expect(opacityReleased).toBe(opacityBefore);
});

test('row-style controls tint instead of scaling', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.id = 'rowProbe';
    b.setAttribute('role', 'menuitem');
    b.textContent = 'Menu row';
    b.style.cssText = 'position:fixed;left:40px;top:120px;z-index:99999;width:240px;padding:10px';
    document.body.appendChild(b);
  });
  const before = await page.evaluate(() => getComputedStyle(document.getElementById('rowProbe')).backgroundColor);
  const box = await page.locator('#rowProbe').boundingBox();
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(120);
  const during = await page.evaluate(() => {
    const el = document.getElementById('rowProbe');
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, scale: cs.scale };
  });
  await page.mouse.up();
  expect(during.bg).not.toBe(before);
  expect(during.scale === 'none' || parseFloat(during.scale) === 1).toBe(true);
});

test('a fast touch tap keeps the pressed state visible for more than a frame', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await boot(page);
    await page.evaluate(() => {
      const b = document.createElement('button');
      b.id = 'tapProbe';
      b.textContent = 'Tap';
      b.style.cssText = 'position:fixed;left:40px;top:40px;z-index:99999;padding:12px 24px';
      document.body.appendChild(b);
      /* Record every class change so the check does not race a timer. */
      window.__pressLog = [];
      new MutationObserver(() => {
        window.__pressLog.push({ t: performance.now(), pressed: b.classList.contains('is-pressed') });
      }).observe(b, { attributes: true, attributeFilter: ['class'] });
    });
    const box = await page.locator('#tapProbe').boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    const log = await page.evaluate(() => window.__pressLog);
    const on = log.find((e) => e.pressed);
    const off = log.find((e) => on && e.t > on.t && !e.pressed);
    expect(on, JSON.stringify(log)).toBeTruthy();
    expect(off, JSON.stringify(log)).toBeTruthy();
    expect(off.t - on.t).toBeGreaterThanOrEqual(85);
  } finally {
    await context.close();
  }
});

test('disabled buttons do not press', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.id = 'disabledProbe';
    b.disabled = true;
    b.textContent = 'Disabled';
    b.style.cssText = 'position:fixed;left:40px;top:40px;z-index:99999;padding:12px 24px';
    document.body.appendChild(b);
  });
  const box = await page.locator('#disabledProbe').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(160);
  const scale = await computedScale(page, '#disabledProbe');
  const pressedClass = await page.evaluate(() => document.getElementById('disabledProbe').classList.contains('is-pressed'));
  await page.mouse.up();
  expect(scale).toBe(1);
  expect(pressedClass).toBe(false);
});

test('reduced motion: presses never scale', async ({ page }) => {
  await boot(page, { reducedMotion: true });
  const { pressed } = await holdAndMeasure(page, '#startBtn');
  expect(pressed).toBe(1);
});

test('real shell controls: an icon button stays stable and a sidebar row tints', async ({ page }) => {
  await boot(page);
  const iconSel = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('#appShell .icon-btn'))
      .find((b) => !b.disabled && b.offsetParent !== null && b.getBoundingClientRect().width > 0);
    if (!el) return null;
    el.setAttribute('data-press-probe', 'icon');
    return '[data-press-probe="icon"]';
  });
  test.skip(!iconSel, 'no visible .icon-btn in this shell layout');
  const icon = await holdAndMeasure(page, iconSel);
  expect(icon.pressed).toBe(1);
  expect(icon.released).toBe(1);
  expect(icon.iconBefore).not.toBeNull();
  expect(icon.iconDuring).not.toBeNull();
  for (const key of ['x', 'y', 'width', 'height']) {
    expect(Math.abs(icon.boxBefore[key] - icon.boxDuring[key])).toBeLessThanOrEqual(0.01);
    expect(Math.abs(icon.iconBefore[key] - icon.iconDuring[key])).toBeLessThanOrEqual(0.01);
  }

  const rowSel = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('#appShell .sidebar-nav-btn'))
      .find((b) => !b.disabled && b.offsetParent !== null && b.getBoundingClientRect().width > 0);
    if (!el) return null;
    el.setAttribute('data-press-probe', 'row');
    return '[data-press-probe="row"]';
  });
  test.skip(!rowSel, 'no visible sidebar row in this shell layout');
  const box = await page.locator(rowSel).boundingBox();
  await page.mouse.move(box.x + 12, box.y + box.height / 2);
  const hoverBg = await page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).backgroundColor, rowSel);
  await page.mouse.down();
  await page.waitForTimeout(120);
  const pressed = await page.evaluate((sel) => {
    const cs = getComputedStyle(document.querySelector(sel));
    return { bg: cs.backgroundColor, scale: cs.scale };
  }, rowSel);
  await page.mouse.up();
  /* Pressed must differ from the hover background the row already had. */
  expect(pressed.bg).not.toBe(hoverBg);
  expect(pressed.scale === 'none' || parseFloat(pressed.scale) === 1).toBe(true);
});

test('a popover opened by a pressed trigger is placed from the trigger\'s resting box', async ({ page }) => {
  await boot(page);
  /* Desktop landing: composerTools.js places the menu at trigger.bottom + 8.
     The trigger now stays fixed during a press; the compatibility geometry
     guard must preserve that exact resting anchor. */
  await page.locator('#topicComposerToolsBtn').click();
  await expect(page.locator('#composerToolsMenu')).toBeVisible();
  await page.waitForTimeout(400); /* press + release fully settled */
  const geo = await page.evaluate(() => {
    const trigger = document.getElementById('topicComposerToolsBtn');
    const menu = document.getElementById('composerToolsMenu');
    return {
      restingBottom: trigger.getBoundingClientRect().bottom,
      menuTop: parseFloat(menu.style.top),
      inlineScale: trigger.style.getPropertyValue('scale'),
    };
  });
  expect(Math.abs(geo.menuTop - (geo.restingBottom + 8)), JSON.stringify(geo)).toBeLessThanOrEqual(0.5);
  expect(geo.inlineScale, 'the guard lifted its pin').toBe('');
  await page.keyboard.press('Escape');
});
