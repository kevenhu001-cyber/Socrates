// e2e/cmd-k-localization.spec.mjs
// The palette mounts after boot's `data-i18n-*` sweep, so its copy has to be
// resolved at render time. These tests pin the Chinese and English surfaces
// and the focus treatment: the search row owns the cue (its hairline), not a
// 2px ring on a field that has no fill of its own.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function openPalette(page, lang) {
  // `mockAuthedApp` pins the UI language for the whole suite (English by
  // default); the option is the supported way to ask for the other one.
  await mockAuthedApp(page, { lang });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cmdKModal')).toBeVisible({ timeout: 5_000 });
}

test('a Chinese palette speaks Chinese end to end', async ({ page }) => {
  await openPalette(page, 'zh');

  const input = page.locator('#cmdKInput');
  await expect(input).toHaveAttribute('placeholder', '搜索会话与消息…');
  await expect(input).toHaveAttribute('aria-label', '搜索会话与消息');

  // No search history in a fresh profile, so the empty state is the one that
  // renders. The footer hints were a blank strip before this pass.
  await expect(page.locator('.cmd-k-results')).toContainText('输入关键词，搜索全部会话与消息。');
  await expect(page.locator('.cmd-k-foot')).toContainText('选择');
  await expect(page.locator('.cmd-k-foot')).toContainText('打开');
  await expect(page.locator('.cmd-k-foot')).toContainText('关闭');
});

test('a query with no hits explains the server search in Chinese', async ({ page }) => {
  await openPalette(page, 'zh');
  await page.locator('#cmdKInput').fill('zzz-no-such-session');
  await expect(page.locator('.cmd-k-empty')).toContainText('没有结果');
  await expect(page.locator('.cmd-k-empty')).toContainText('在服务器上搜索');
});

test('an English palette stays English', async ({ page }) => {
  await openPalette(page, 'en');

  const input = page.locator('#cmdKInput');
  await expect(input).toHaveAttribute('placeholder', 'Search sessions and messages…');
  await expect(page.locator('.cmd-k-results')).toContainText('Type to search across all your sessions.');
  await expect(page.locator('.cmd-k-foot')).toContainText('Navigate');
});

test('the search row owns the focus cue instead of drawing a ring', async ({ page }) => {
  await openPalette(page, 'zh');

  const input = page.locator('#cmdKInput');
  await input.focus();

  // The field has no fill or border, so the shared 2px ring drew a blue
  // capsule in the middle of the row on every Cmd-K.
  const shadow = await input.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).toBe('none');

  // The row's hairline strengthens instead — same signal as the sidebar
  // search field, which also suppresses the input's own ring.
  const focused = await page.locator('.cmd-k-input-row').evaluate((el) => getComputedStyle(el).borderBottomColor);
  await input.evaluate((el) => el.blur());
  const blurred = await page.locator('.cmd-k-input-row').evaluate((el) => getComputedStyle(el).borderBottomColor);
  expect(focused).not.toBe(blurred);
});
