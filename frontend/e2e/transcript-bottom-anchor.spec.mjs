import { expect, test } from '@playwright/test';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './_chat-workbench.mjs';

/* The conversation column is a bottom-anchored flex column: a short exchange
 * rests on the composer's edge instead of leaving the reading area empty, and
 * a long one still starts at its first line. */

function history(count) {
  return Array.from({ length: count }, (_, index) => ({
    clientId: `anchored-${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    type: index % 2 === 0 ? 'user' : 'assistant',
    rawText: `Anchored line ${index}`,
    html: `<p>Anchored line ${index}</p>`,
  }));
}

/* The first row's offset inside the scrollable content, independent of where
 * the transcript happens to be scrolled to. */
const firstLineOffset = (page) => page.evaluate(() => {
  const list = document.getElementById('msgList');
  const row = list.querySelector('.msg');
  return Math.round(row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop);
});

const geometry = (page) => page.evaluate(() => {
  const rect = (node) => {
    if (!node) return null;
    const value = node.getBoundingClientRect();
    return { top: Math.round(value.top), bottom: Math.round(value.bottom), height: Math.round(value.height) };
  };
  const list = document.getElementById('msgList');
  const rows = [...list.querySelectorAll('.msg')];
  return {
    list: rect(list),
    first: rect(rows[0]),
    last: rect(rows[rows.length - 1]),
    scrollTop: list.scrollTop,
    scrollHeight: list.scrollHeight,
    clientHeight: list.clientHeight,
    rows: rows.length,
  };
});

for (const mobile of [false, true]) {
  const viewport = mobile ? WORKBENCH_VIEWPORTS.mobile : WORKBENCH_VIEWPORTS.desktop;

  test(`${mobile ? 'mobile' : 'desktop'} short conversation rests on the composer instead of the top of the transcript`, async ({ page }) => {
    await prepareChatWorkbench(page, { viewport, messages: history(2) });
    await expect(page.locator('#msgList .msg')).toHaveCount(2);

    const view = await geometry(page);
    // The conversation block sits on the composer's edge: only the transcript's
    // own bottom padding separates the last line from the composer.
    expect(view.list.bottom - view.last.bottom).toBeLessThanOrEqual(56);
    // ... and the free space is above it, not below it.
    expect(view.first.top - view.list.top).toBeGreaterThan(120);
    expect(await firstLineOffset(page)).toBeGreaterThan(120);
    // A short exchange still fits, so the transcript has nothing to scroll.
    expect(view.scrollHeight).toBeLessThanOrEqual(view.clientHeight + 1);
    expect(view.scrollTop).toBe(0);
  });

  test(`${mobile ? 'mobile' : 'desktop'} long conversation still starts at its first line`, async ({ page }) => {
    await prepareChatWorkbench(page, { viewport, messages: history(30) });
    await expect(page.locator('[data-client-id="anchored-29"]')).toBeVisible();

    const overflowing = await geometry(page);
    expect(overflowing.scrollHeight).toBeGreaterThan(overflowing.clientHeight);
    // The anchor margin collapses once the content overflows, so the first
    // line of a long conversation is not pushed below a void.
    expect(await firstLineOffset(page)).toBeLessThanOrEqual(40);

    await page.evaluate(() => {
      const list = document.getElementById('msgList');
      list.scrollTop = list.scrollHeight;
      list.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(200);
    const bottom = await geometry(page);
    // The tail stays pinned to the composer's edge.
    expect(bottom.list.bottom - bottom.last.bottom).toBeLessThanOrEqual(56);
  });
}
