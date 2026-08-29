// e2e/placeholder-localization.spec.mjs — the zh chat placeholder must
// localize at runtime and keep the standard UI font stack.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('zh chat placeholder localizes live with the standard UI font', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await expect(editor).toHaveAttribute('aria-label', 'Send a message');

  /* Switch the app language at runtime — the composer must re-localize
     without a reload and without losing the draft. */
  await page.evaluate(() => window.setLang('zh'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh');
  await expect(editor).toHaveAttribute('aria-label', '输入你的想法...');

  const zhState = await editor.evaluate((el) => {
    const p = el.querySelector('p.is-editor-empty:first-child');
    if (!p) return null;
    const before = getComputedStyle(p, '::before');
    return { content: before.content, fontFamily: before.fontFamily };
  });
  expect(zhState).not.toBeNull();
  expect(zhState.content).toContain('输入你的想法');
  expect(zhState.fontFamily).toContain('Inter');
  expect(zhState.fontFamily).not.toContain('Ma Shan Zheng');

  /* Switching back to English must restore the Latin UI face. */
  await page.evaluate(() => window.setLang('en'));
  await expect(editor).toHaveAttribute('aria-label', 'Send a message');
  const enFont = await editor.evaluate((el) => {
    const p = el.querySelector('p.is-editor-empty:first-child');
    return p ? getComputedStyle(p, '::before').fontFamily : '';
  });
  expect(enFont).toContain('Inter');
});

test('zh landing greeting keeps the original display font stack', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => window.setLang('zh'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh');

  /* The assertion only has to prove the zh string rendered so the CJK font
     fallback below is measured against CJK glyphs — the copy itself moved
     from "你好，{name}。" to the shorter landing greeting. */
  const greeting = page.locator('#topicTitle');
  await expect(greeting).toContainText('你来了');
  const zhFont = await greeting.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(zhFont).toContain('Newsreader');
  expect(zhFont).toContain('Noto Sans SC');
  expect(zhFont).not.toContain('Noto Serif SC');

  await page.evaluate(() => window.setLang('en'));
  const enFont = await greeting.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(enFont).toContain('Newsreader');
});
