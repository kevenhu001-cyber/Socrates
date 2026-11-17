// e2e/turn-viewport-stability.spec.mjs — the reader's paragraph must not move
// while content above it changes during a live turn.
//
// A live turn owns the transcript through the send anchor
// (`#msgList[data-turn-viewport-owner="turn"]`), which keeps the submitted
// prompt at its top offset. That ownership used to suppress the
// above-viewport compensation entirely, so an earlier row that grew (a tool
// row, an expanded step, a finished chart) pushed the paragraph under the
// reader down by its full height. This asserts the compensation still runs
// while the anchor owns the prompt.
import { test, expect } from './_state-fixture.mjs';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const FILLER = 'A settled answer paragraph with enough text to occupy the transcript. '.repeat(12);

async function bootConversation(page) {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate((filler) => {
    window.__socratesTestState.patch({ session: { phase: 'chat' } });
    window.__testActivateMainView('chatView');
    window.addMessage('user', `Why does a gradient point uphill? ${filler}`);
    window.addMessage('assistant', `First, a short note about slopes. ${filler}`);
    window.addMessage('user', `Go on. ${filler}`);
    window.addMessage('assistant', `The paragraph the reader is following sits here. ${filler}`);
  }, FILLER);
  const list = page.locator('#msgList');
  await expect(list.locator(':scope > .msg')).toHaveCount(4);
  return list;
}

for (const anchorOwned of [false, true]) {
  test(`a row growing above the reader does not move the paragraph (anchor ${anchorOwned ? 'held' : 'released'})`, async ({
    page,
  }) => {
    const list = await bootConversation(page);

    /* Release the send's bottom-pin first: a programmatic scrollTop does not
       count as reader intent, and while the sticky follow is armed it owns
       the transcript (that is the intended behaviour, not this regression). */
    await list.hover();
    await page.mouse.wheel(0, -160);
    await page.waitForTimeout(120);

    /* Put the reader mid-transcript: the last row starts 180px below the top
       of the scroller, so its content is on screen and NOT bottom-pinned. */
    const geometry = await list.evaluate(
      (host, owned) =>
        new Promise((resolve) => {
          if (owned) host.dataset.turnViewportOwner = 'turn';
          const rows = [...host.children];
          const last = rows[rows.length - 1];
          const lastTop =
            last.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop;
          host.scrollTop = Math.max(0, lastTop - 180);
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              resolve({
                before: last.getBoundingClientRect().top - host.getBoundingClientRect().top,
                scrollable: host.scrollHeight - host.clientHeight,
                scrollTop: host.scrollTop,
              }),
            ),
          );
        }),
      anchorOwned,
    );

    expect(geometry.scrollable).toBeGreaterThan(600);
    expect(geometry.scrollTop).toBeGreaterThan(200);
    expect(geometry.before).toBeGreaterThan(40);
    expect(geometry.before).toBeLessThan(320);

    /* Grow the first message through the store, so React commits the change
       exactly like a tool row / chart landing in an earlier answer. */
    await page.evaluate((filler) => {
      window.__socratesTestState.dispatchSession({
        type: 'session/update-message',
        index: 0,
        patch: { rawText: `Why does a gradient point uphill? ${filler}\n\n${filler}` },
      });
    }, FILLER);
    await page.waitForTimeout(200);

    const after = await list.evaluate((host) => {
      const rows = [...host.children];
      const last = rows[rows.length - 1];
      return last.getBoundingClientRect().top - host.getBoundingClientRect().top;
    });

    expect(Math.abs(after - geometry.before)).toBeLessThanOrEqual(1);
  });
}
