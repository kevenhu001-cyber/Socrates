// TEMP verification for composer blur-on-send + focus transition smoothness.
import { test, expect } from './_state-fixture.mjs';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function enterChat(page) {
  await page.evaluate(() => {
    window.__socratesTestState.patch({ session: { phase: 'chat' } });
    window.__socratesTestState.patch({ session: { topic: 'Composer check' } });
    window.__socratesTestState.patch({
      session: { currentSessionId: '44444444-4444-4444-8444-444444444444' },
    });
    window.__testActivateMainView('chatView');
  });
  await page.waitForTimeout(300);
}

function focusInComposer(page) {
  return page.evaluate(() => {
    const rootEl = document.getElementById('composerRoot');
    return Boolean(rootEl && document.activeElement && rootEl.contains(document.activeElement));
  });
}

test('click-send blurs the composer; Enter-send keeps focus', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: [DONE]\n\n',
    }),
  );
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await enterChat(page);

  const editor = page.locator('#composerRoot .rich-composer-editor').first();
  await editor.click();
  await editor.type('blur me after click send');
  expect(await focusInComposer(page)).toBe(true);

  await page.locator('#composerPrimaryBtn').click();
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
  let uploadStarted = false;
  let releaseUpload;
  const uploadGate = new Promise((resolve) => {
    releaseUpload = resolve;
  });
  await page.route(/\/api\/(?:v2\/)?files(?:\?|$)/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    uploadStarted = true;
    await uploadGate;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'blur-image',
        name: 'slow.png',
        mimeType: 'image/png',
        size: 68,
        kind: 'image',
      }),
    });
  });
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: [DONE]\n\n',
    }),
  );
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await enterChat(page);

  const editor = page.locator('#composerRoot .rich-composer-editor').first();
  await editor.fill('send with a slow image');
  await page.locator('#composerAttachInput').setInputFiles({
    name: 'slow.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/g6sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.locator('#composerAttachmentChips .attachment-chip')).toHaveCount(1);
  await editor.focus();
  try {
    await page.locator('#composerPrimaryBtn').click();

    // The upload is still pending here. Focus and selection must already be
    // gone rather than waiting for buildMessageContent().
    await expect.poll(() => uploadStarted).toBe(true);
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
  } finally {
    releaseUpload?.();
  }
});

test('composer frame transitions cover focus feedback without geometry animation', async ({
  page,
}) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await enterChat(page);
  const t = await page.evaluate(() => {
    const frame = document.querySelector('#composerInputWrap [data-composer-frame]');
    const cs = getComputedStyle(frame);
    return { property: cs.transitionProperty, duration: cs.transitionDuration };
  });
  console.log('[transition]', JSON.stringify(t));
  /* The painter is the frame, not the transparent moving host. Focus never
     changes its geometry, so only the paint feedback (box-shadow ring,
     background-color) may transition. box-shadow is paint-only. */
  for (const prop of ['box-shadow', 'background-color']) {
    expect(t.property, `transition must include ${prop}`).toContain(prop);
  }
  expect(t.property, 'no geometry property may transition').not.toMatch(
    /min-height|padding|border-radius/,
  );
  expect(t.duration).toContain('0.3s');
});
