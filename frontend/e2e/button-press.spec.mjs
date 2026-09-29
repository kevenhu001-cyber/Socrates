// e2e/button-press.spec.mjs — one press language for every control.
//
// styles/polish/press.css owns press feedback through the individual
// `scale` property (so it composes with each control's own `transform`),
// and ui/pressFeedback.js keeps `.is-pressed` long enough for a fast tap
// to paint. These cases check the computed result in a real browser:
//   - buttons and icon buttons scale down while held and spring back;
//   - row-style controls (menu items, list rows) tint instead of scaling;
//   - a quick touch tap still shows the pressed state for >1 frame;
//   - disabled controls and reduced motion never scale.

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

/* The rendered scale of `selector` after the press-in animation settles.
   `scale: none` computes to "none"; an active press to e.g. "0.92". */
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
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} is on screen`).not.toBeNull();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(160); /* > --ui-press-in (80ms) */
  const pressed = await computedScale(page, selector);
  await page.mouse.up();
  await page.waitForTimeout(400); /* > min press (90ms) + release (180ms) */
  const released = await computedScale(page, selector);
  return { pressed, released };
}

test('the primary composer button presses down and springs back', async ({ page }) => {
  await boot(page);
  const { pressed, released } = await holdAndMeasure(page, '#startBtn');
  expect(pressed).toBeGreaterThan(0.85);
  expect(pressed).toBeLessThan(0.97);
  expect(released).toBe(1);
});

test('a generic button presses with the shared default depth', async ({ page }) => {
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
  const { pressed, released } = await holdAndMeasure(page, '#pressProbe');
  expect(pressed).toBeCloseTo(0.96, 2);
  expect(released).toBe(1);
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

test('real shell controls: an icon button scales, a sidebar row tints', async ({ page }) => {
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
  expect(icon.pressed).toBeCloseTo(0.92, 2);
  expect(icon.released).toBe(1);

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
     The click fires while the trigger is still inside its press, so without
     the pressFeedback geometry guard the measured bottom was the scaled one. */
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
