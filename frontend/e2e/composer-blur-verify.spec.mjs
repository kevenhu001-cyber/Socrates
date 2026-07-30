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

test('click-send blurs before asynchronous attachment preparation finishes', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route(/\/api\/vision\/describe(?:\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ description: 'A delayed test image.' }),
    });
  });
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: 'data: [DONE]\n\n',
  }));
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await enterChat(page);

  const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await editor.fill('send with a slow image');
  await page.evaluate(() => {
    window.attachments.push({
      id: 'blur-delay-image',
      kind: 'image',
      name: 'slow.png',
      mime: 'image/png',
      size: 16,
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    });
  });
  await editor.focus();
  await page.locator('#sendBtn').click();

  // The vision request is still pending here. Focus and selection must
  // already be gone rather than waiting for buildMessageContent().
  await page.waitForTimeout(80);
  expect(await focusInComposer(page)).toBe(false);
  await expect(
    page.locator('#msgList .msg.user').filter({ hasText: 'send with a slow image' }).last(),
    'the submitted bubble must commit before attachment preparation finishes',
  ).toBeVisible();
  await expect(editor, 'the draft clears in the same submit frame').toHaveText('');
  const selectionCleared = await page.evaluate(() => {
    const selection = window.getSelection();
    return !selection || selection.rangeCount === 0;
  });
  expect(selectionCleared).toBe(true);
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
  expect(t.duration).toContain('0.42s');
});
