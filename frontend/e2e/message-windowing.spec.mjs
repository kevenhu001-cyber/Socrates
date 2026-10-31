import { test, expect } from '@playwright/test';

import { prepareChatWorkbench } from './_chat-workbench.mjs';

function history(count) {
  return Array.from({ length: count }, (_, index) => ({
    clientId: `history-${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    type: index % 2 === 0 ? 'user' : 'assistant',
    rawText: `History message ${index}`,
    html: `<p>History message ${index}</p>`,
  }));
}

async function residentRows(page) {
  return page.locator('#msgList > .msg').count();
}

async function scrollWindow(page, edge) {
  await page.evaluate((edge) => {
    const list = document.getElementById('msgList');
    if (!list) return;
    list.scrollTop = edge === 'top' ? 0 : list.scrollHeight;
    list.dispatchEvent(new Event('scroll'));
  }, edge);
  await page.waitForTimeout(40);
}

test('long settled histories keep a bounded DOM while sliding in both directions', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: history(240) });
  await expect(page.locator('[data-client-id="history-239"]')).toBeVisible();

  // The old progressive mount eventually filled all 240 rows during idle time.
  // Give idle expansion enough time to prove normal residency remains bounded.
  await page.waitForTimeout(1200);
  expect(await residentRows(page)).toBeLessThanOrEqual(60);

  for (let index = 0; index < 24; index += 1) {
    await scrollWindow(page, 'top');
    expect(await residentRows(page)).toBeLessThanOrEqual(60);
    if (await page.locator('[data-client-id="history-0"]').count()) break;
  }
  await expect(page.locator('[data-client-id="history-0"]')).toHaveCount(1);
  expect(await residentRows(page)).toBeLessThanOrEqual(60);

  for (let index = 0; index < 24; index += 1) {
    await scrollWindow(page, 'bottom');
    expect(await residentRows(page)).toBeLessThanOrEqual(60);
    if (await page.locator('[data-client-id="history-239"]').count()) break;
  }
  await expect(page.locator('[data-client-id="history-239"]')).toHaveCount(1);
  expect(await residentRows(page)).toBeLessThanOrEqual(60);
});

test('in-session find temporarily full-mounts history and restores the bounded window', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: history(120) });
  await expect.poll(() => residentRows(page)).toBeLessThanOrEqual(60);

  await page.keyboard.press('Control+f');
  await expect(page.locator('#findInput')).toBeVisible();
  await page.locator('#findInput').fill('History message 0');

  await expect(page.locator('#findCount')).toHaveText('1/1');
  await expect(page.locator('mark.find-hl')).toHaveCount(1);
  await expect.poll(() => residentRows(page)).toBe(120);

  await page.getByRole('button', { name: 'Close find' }).click();
  await expect(page.locator('#findBar')).toHaveClass(/hidden/);
  await expect.poll(() => residentRows(page)).toBeLessThanOrEqual(60);
});
