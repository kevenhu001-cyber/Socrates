// TEMP verification for composer blur-on-send + focus transition smoothness.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function enterChat(page) {
  await page.evaluate(() => {
    window.state.phase = 'chat';
    window.state.topic = 'Composer check';
    window.state.currentSessionId = '44444444-4444-4444-8444-444444444444';
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
  });
  await page.waitForTimeout(300);
}

function focusInComposer(page) {
  return page.evaluate(() => {
    const rootEl = document.getElementById('chatComposerRoot');
    return Boolean(rootEl && document.activeElement && rootEl.contains(document.activeElement));
  });
}

test('click-send blurs the composer; Enter-send keeps focus', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: 'data: [DONE]\n\n',
  }));
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await enterChat(page);

  const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await editor.click();
  await editor.type('blur me after click send');
  expect(await focusInComposer(page)).toBe(true);

  await page.locator('#sendBtn').click();
  await page.waitForTimeout(600);
  expect(await focusInComposer(page), 'click-send must blur the composer').toBe(false);
  const collapsed = await page.evaluate(() => {
    const sel = window.getSelection();
    return !sel || sel.rangeCount === 0 || sel.isCollapsed;
  });
  expect(collapsed, 'selection must be collapsed after click-send').toBe(true);

  // Enter-send regression: focus must be preserved.
  await editor.click();
  await editor.type('enter send keeps focus');
  await editor.press('Enter');
  await page.waitForTimeout(600);
  expect(await focusInComposer(page), 'Enter-send must keep composer focus').toBe(true);
});

test('chat-input-wrap transitions cover focus geometry', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await enterChat(page);
  const t = await page.evaluate(() => {
    const wrap = document.getElementById('chatInputWrap');
    const cs = getComputedStyle(wrap);
    return { property: cs.transitionProperty, duration: cs.transitionDuration };
  });
  console.log('[transition]', JSON.stringify(t));
  for (const prop of ['border-color', 'box-shadow', 'min-height', 'padding', 'border-radius']) {
    expect(t.property, `transition must include ${prop}`).toContain(prop);
  }
});
