// e2e/placeholder-localization.spec.mjs — the zh chat placeholder must
// localize at runtime and keep the bundled western UI face first in the
// mixed-script stack, with Noto Sans SC available for CJK fallback.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('zh UI localizes live with the bundled Plus Jakarta Sans face', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await expect(editor).toHaveAttribute('aria-label', 'How can I help you today?');

  /* Switch the app language at runtime — the composer must re-localize
     without a reload and without losing the draft. */
  await page.evaluate(() => window.setLang('zh'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh');
  await expect(editor).toHaveAttribute('aria-label', '今天有什么可以帮你的？');

  const zhState = await editor.evaluate((el) => {
    const p = el.querySelector('p.is-editor-empty:first-child');
    if (!p) return null;
    const before = getComputedStyle(p, '::before');
    return { content: before.content, fontFamily: before.fontFamily };
  });
  expect(zhState).not.toBeNull();
  expect(zhState.content).toContain('今天有什么可以帮你的');
  expect(zhState.fontFamily.split(',')[0].replace(/["']/g, '').trim()).toBe('Plus Jakarta Sans');
  expect(zhState.fontFamily).toContain('Noto Sans SC');
  expect(zhState.fontFamily).toContain('Inter');
  expect(zhState.fontFamily).not.toContain('Microsoft YaHei');

  /* Switching back to English must restore the Latin UI face. */
  await page.evaluate(() => window.setLang('en'));
  await expect(editor).toHaveAttribute('aria-label', 'How can I help you today?');
  const enFont = await editor.evaluate((el) => {
    const p = el.querySelector('p.is-editor-empty:first-child');
    return p ? getComputedStyle(p, '::before').fontFamily : '';
  });
  expect(enFont).toContain('Plus Jakarta Sans');
});

test('landing greeting has no leading logo and keeps the western Plus Jakarta Sans face in Chinese UI', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => window.setLang('zh'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh');

  /* The greeting is time-aware; this assertion only has to prove that a
     localized greeting rendered so the CJK font fallback is measured against
     real Chinese glyphs. */
  const greeting = page.locator('#topicTitle');
  await expect(greeting).toContainText(/欢迎回来|早上好|下午好|晚上好|夜深了/);
  const zhStyle = await greeting.evaluate((el) => ({
    fontFamily: getComputedStyle(el).fontFamily,
    paddingLeft: getComputedStyle(el).paddingLeft,
    beforeContent: getComputedStyle(el, '::before').content,
  }));
  expect(zhStyle.fontFamily.split(',')[0].replace(/["']/g, '').trim()).toBe('Plus Jakarta Sans');
  expect(zhStyle.fontFamily).toContain('Noto Sans SC');
  expect(zhStyle.fontFamily).toContain('Inter');
  expect(zhStyle.fontFamily).not.toContain('Microsoft YaHei');
  expect(zhStyle.paddingLeft).toBe('0px');
  expect(['none', 'normal']).toContain(zhStyle.beforeContent);

  await page.evaluate(() => window.setLang('en'));
  const enFont = await greeting.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(enFont.split(',')[0].replace(/["']/g, '').trim()).toBe('Plus Jakarta Sans');
});
