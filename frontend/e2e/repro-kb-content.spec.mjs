// Repro: existing conversation + focus composer + keyboard lift.
// Dumps what happens to the last assistant message under different
// real-world focus paths.
import { test } from './_lib.mjs';
import { expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

function installFakeVisualViewport(page) {
  return page.addInitScript(() => {
    const listeners = { resize: new Set(), scroll: new Set() };
    const fake = {
      width: 390, height: 844, offsetTop: 0, offsetLeft: 0,
      pageTop: 0, pageLeft: 0, scale: 1,
      addEventListener(type, fn) { (listeners[type] || (listeners[type] = new Set())).add(fn); },
      removeEventListener(type, fn) { if (listeners[type]) listeners[type].delete(fn); },
      dispatchEvent(event) {
        const type = event && event.type;
        if (listeners[type]) listeners[type].forEach((fn) => fn(event));
        return true;
      },
      __resize({ height, offsetTop = 0 }) {
        fake.height = height; fake.offsetTop = offsetTop;
        fake.dispatchEvent(new Event('resize'));
      },
    };
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
    window.__fakeViewport = fake;
  });
}

async function seedChat(page, count = 30) {
  await page.evaluate((n) => {
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: '99999999-9999-4999-8999-999999999999' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    for (let i = 0; i < n; i += 1) {
      window.addMessage(i % 2 ? 'assistant' : 'user', `History ${i + 1}: ${'content '.repeat(8)}`);
    }
  }, count);
  await expect(page.locator('#msgList .msg')).toHaveCount(count);
  await page.waitForTimeout(250);
}

async function snapshot(page, label) {
  const s = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const rows = list.querySelectorAll(':scope > .msg');
    const last = rows[rows.length - 1];
    const listRect = list.getBoundingClientRect();
    const lastRect = last ? last.getBoundingClientRect() : null;
    const bar = document.getElementById('chatInputBar').getBoundingClientRect();
    return {
      scrollTop: Math.round(list.scrollTop),
      clientHeight: Math.round(list.clientHeight),
      distanceFromBottom: Math.round(list.scrollHeight - list.scrollTop - list.clientHeight),
      lastMsgBottomVsListBottom: lastRect ? Math.round(lastRect.bottom - listRect.bottom) : null,
      lastMsgBottomVsBarTop: lastRect ? Math.round(lastRect.bottom - bar.top) : null,
      away: Boolean(window.stateStore.read('_userScrolledAway')),
      hold: list.dataset.turnAnchorHold || null,
      inset: document.documentElement.style.getPropertyValue('--keyboard-inset'),
    };
  });
  console.log(`[${label}]`, JSON.stringify(s));
  return s;
}

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await installFakeVisualViewport(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
});

test('A: clean focus at bottom', async ({ page }) => {
  await seedChat(page);
  await page.evaluate(() => { const l = document.getElementById('msgList'); l.scrollTop = l.scrollHeight; });
  await page.waitForTimeout(150);
  await snapshot(page, 'A before-focus');
  await page.locator('#chatComposerRoot .rich-composer-editor').first().focus();
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__fakeViewport.__resize({ height: 510 }));
  await page.waitForTimeout(600);
  await snapshot(page, 'A after-kb');
});

test('B: sloppy tap (touchmove drift) then focus', async ({ page }) => {
  await seedChat(page);
  await page.evaluate(() => { const l = document.getElementById('msgList'); l.scrollTop = l.scrollHeight; });
  await page.waitForTimeout(150);
  await snapshot(page, 'B before-focus');
  await page.evaluate(() => {
    const el = document.querySelector('#chatComposerRoot .rich-composer-editor');
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + 10;
    const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    document.dispatchEvent(new TouchEvent('touchstart', { touches: [t], bubbles: true }));
    const t2 = new Touch({ identifier: 1, target: el, clientX: x, clientY: y + 8 });
    document.dispatchEvent(new TouchEvent('touchmove', { touches: [t2], bubbles: true }));
    const t3 = new Touch({ identifier: 1, target: el, clientX: x, clientY: y + 8 });
    document.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t3], bubbles: true }));
    el.focus();
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__fakeViewport.__resize({ height: 510 }));
  await page.waitForTimeout(600);
  await snapshot(page, 'B after-kb');
});

test('C: wheel-up (scrolledAway) then back to bottom WITHOUT new scroll, then focus', async ({ page }) => {
  await seedChat(page);
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true }));
    list.scrollTop = 400;
    list.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await page.waitForTimeout(100);
  await snapshot(page, 'C scrolled-up');
  // User returns to bottom via dragging scrollbar / programmatic — no wheel-down intent
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
    list.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await page.waitForTimeout(100);
  await snapshot(page, 'C back-at-bottom');
  await page.locator('#chatComposerRoot .rich-composer-editor').first().focus();
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__fakeViewport.__resize({ height: 510 }));
  await page.waitForTimeout(600);
  await snapshot(page, 'C after-kb');
});
