// e2e/placeholder-localization.spec.mjs — the zh chat placeholder must
// localize at runtime and keep the bundled western UI face first in the
// mixed-script stack, with the bundled CJK face available for CJK fallback.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* The CJK face is MiSans (Xiaomi), bundled from the `misans` npm package and
   served from this app's own origin — it replaced Noto Sans SC in
   824b0864. The face is what the assertion is about; the name in the stack
   is only the proof that the stack points at it. */
const CJK_FACE = 'MiSans';

/* The name in a font stack is not proof the face is usable: a @font-face
   whose file is missing still leaves the name in the computed style, and the
   glyphs then silently fall back to a system CJK font. Ask the FontFaceSet
   to actually load the face for CJK codepoints and require a match. */
async function cjkFaceLoads(page) {
  return page.evaluate(async (family) => {
    const faces = await document.fonts.load(`16px "${family}"`, '中文测试');
    return faces.length > 0;
  }, CJK_FACE);
}

test('zh UI localizes live with the bundled Inter face', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const editor = page.locator('#composerRoot .rich-composer-editor').first();
  await expect(editor).toHaveAttribute('aria-label', 'Ask Socrates');

  /* Switch the app language at runtime — the composer must re-localize
     without a reload and without losing the draft. */
  await page.evaluate(() => window.setLang('zh'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh');
  await expect(editor).toHaveAttribute('aria-label', '有问题，随便问');

  const zhState = await editor.evaluate((el) => {
    const p = el.querySelector('p.is-editor-empty:first-child');
    if (!p) return null;
    const before = getComputedStyle(p, '::before');
    return { content: before.content, fontFamily: before.fontFamily };
  });
  expect(zhState).not.toBeNull();
  expect(zhState.content).toContain('有问题，随便问');
  expect(zhState.fontFamily.split(',')[0].replace(/["']/g, '').trim()).toBe('Inter');
  expect(zhState.fontFamily).toContain(CJK_FACE);
  expect(zhState.fontFamily).toContain('Inter');
  expect(zhState.fontFamily).not.toContain('Microsoft YaHei');
  expect(await cjkFaceLoads(page)).toBe(true);

  /* Switching back to English must restore the Latin UI face. */
  await page.evaluate(() => window.setLang('en'));
  await expect(editor).toHaveAttribute('aria-label', 'Ask Socrates');
  const enFont = await editor.evaluate((el) => {
    const p = el.querySelector('p.is-editor-empty:first-child');
    return p ? getComputedStyle(p, '::before').fontFamily : '';
  });
  expect(enFont).toContain('Inter');
});

test('landing greeting has no leading logo and keeps the western Inter face in Chinese UI', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => window.setLang('zh'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh');

  /* The greeting is a single line drawn at random from the zh pool; the
     assertion only has to prove that a localized greeting rendered so the
     CJK font fallback is measured against real Chinese glyphs. */
  const greeting = page.locator('#topicTitle');
  await expect(greeting).toHaveText(/今天有什么计划|想做点什么|在想什么|我们从哪里开始|准备好了就开始|想聊点什么|有什么我能帮忙的|开始吧|我们先从哪里开始呢？/);
  const zhStyle = await greeting.evaluate((el) => ({
    fontFamily: getComputedStyle(el).fontFamily,
    paddingLeft: getComputedStyle(el).paddingLeft,
    beforeContent: getComputedStyle(el, '::before').content,
  }));
  expect(zhStyle.fontFamily.split(',')[0].replace(/["']/g, '').trim()).toBe('Inter');
  expect(zhStyle.fontFamily).toContain(CJK_FACE);
  expect(zhStyle.fontFamily).toContain('Inter');
  expect(zhStyle.fontFamily).not.toContain('Microsoft YaHei');
  expect(await cjkFaceLoads(page)).toBe(true);
  expect(zhStyle.paddingLeft).toBe('0px');
  expect(['none', 'normal']).toContain(zhStyle.beforeContent);

  await page.evaluate(() => window.setLang('en'));
  const enFont = await greeting.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(enFont.split(',')[0].replace(/["']/g, '').trim()).toBe('Inter');
});
