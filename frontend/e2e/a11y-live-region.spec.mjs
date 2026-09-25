// e2e/a11y-live-region.spec.mjs — P0 accessibility contract:
// 1) the skip link is the first Tab stop and moves focus into #mainContent;
// 2) a finished streaming turn writes its prose into the #srLiveRegion
//    polite announcer (and the announcer stays visually hidden).

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function startMockedTurn(page) {
  await page.evaluate(async () => {
    const originalFetch = window.fetch.bind(window);
    const deltas = [
      'The announcer must receive',
      ' the final Markdown of this turn.',
    ];
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!/\/api\/(?:v2\/)?chat\/stream/.test(url)) return originalFetch(input, init);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          let index = 0;
          const push = () => {
            if (index < deltas.length) {
              const payload = { choices: [{ delta: { content: deltas[index++] } }] };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
              setTimeout(push, 80);
              return;
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          };
          setTimeout(push, 80);
        },
      });
      return Promise.resolve(new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };

    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: '66666666-6666-4666-8666-666666666666' });
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: [
      { clientId: 'user-announce', role: 'user', rawText: 'Announce this turn', html: null },
    ] });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    window.__announceTurn = window.askChatTurn('Announce this turn');
  });
}

test('skip link is the first Tab stop and focuses the main content', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const skipLink = page.locator('a.skip-link');
  await expect(skipLink, 'index.html must carry exactly one skip link as the first focusable node').toHaveCount(1);

  // Parked off-screen until focus: its box must sit above the viewport.
  const hiddenBox = await skipLink.boundingBox();
  expect(hiddenBox.y + hiddenBox.height).toBeLessThanOrEqual(0);

  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => ({
    cls: document.activeElement && document.activeElement.className,
    href: document.activeElement && document.activeElement.getAttribute('href'),
  }));
  expect(focused.cls).toContain('skip-link');
  expect(focused.href).toBe('#mainContent');

  // Focused state is visible inside the viewport (the reveal is a 140ms
  // transform transition, so poll instead of reading one mid-animation frame).
  await expect
    .poll(() => skipLink.boundingBox().then((box) => box.y + box.height), { timeout: 2_000 })
    .toBeGreaterThan(0);

  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => document.activeElement && document.activeElement.id))
    .toBe('mainContent');
});

test('a finished streaming turn is announced in the polite live region', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await startMockedTurn(page);
  await page.evaluate(() => window.__announceTurn);

  // The announcer only appears once a turn finishes announcing.
  await expect
    .poll(() => page.evaluate(() => {
      const node = document.getElementById('srLiveRegion');
      return node ? node.textContent : '';
    }), { timeout: 5_000 })
    .toContain('final Markdown of this turn');

  const region = page.locator('#srLiveRegion');
  await expect(region).toHaveAttribute('aria-live', 'polite');
  // Visually hidden but rendered (clip technique), never display:none.
  const style = await region.evaluate((node) => {
    const s = getComputedStyle(node);
    return {
      position: s.position,
      width: s.width,
      overflow: s.overflow,
      display: s.display,
      visibility: s.visibility,
    };
  });
  expect(style.display).not.toBe('none');
  expect(style.visibility).not.toBe('hidden');
  expect(style.position).toBe('absolute');
  expect(style.overflow).toBe('hidden');
});
