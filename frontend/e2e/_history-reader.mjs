import { expect } from '@playwright/test';

/**
 * Read a progressively-mounted transcript through its real scroll surface.
 * `expectedRows` is the complete ordered text fixture, not just the initial
 * DOM window; the helper verifies every row is eventually present and intact.
 */
export async function readHistory(page, expectedRows) {
  const list = page.locator('#msgList');
  const rows = list.locator(':scope > .msg');

  /* A wheel at scrollTop=0 cannot emit the scroll event that expands the
     window. Start at the mounted tail before reading toward older rows. */
  await rows.last().scrollIntoViewIfNeeded();
  await list.hover();
  await expect.poll(async () => {
    const count = await rows.count();
    if (count < expectedRows.length) await page.mouse.wheel(0, -2000);
    return count;
  }).toBe(expectedRows.length);

  await expect(rows).toHaveCount(expectedRows.length);
  const actualRows = await rows.allTextContents();
  expect(actualRows).toHaveLength(expectedRows.length);
  for (let index = 0; index < expectedRows.length; index += 1) {
    expect(actualRows[index], `history row ${index + 1}`).toContain(expectedRows[index]);
  }
}
