// e2e/placeholder-localization.spec.mjs — the zh chat placeholder must
// localize at runtime and keep the bundled western UI face first in the
// mixed-script stack, with the bundled CJK face available for CJK fallback.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* Match the marketing site's Geist UI and locally hosted Noto Sans SC
   fallback. Require real font loading as well as the declared stack. */
const CJK_FACE = 'Noto Sans SC';

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

test('zh UI localizes live with the bundled Geist Sans face', async ({ page }) => {
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
  expect(zhState.fontFamily.split(',')[0].replace(/["']/g, '').trim()).toBe('Geist Sans');
  expect(zhState.fontFamily).toContain(CJK_FACE);
  expect(zhState.fontFamily).toContain('Geist Sans');
  expect(zhState.fontFamily).not.toContain('MiSans');
  expect(await cjkFaceLoads(page)).toBe(true);
  const brandFaces = await page.evaluate(async () => Promise.all([
    document.fonts.load('400 16px "Geist Sans"', 'Socrates'),
    document.fonts.load('700 16px "Geist Sans"', 'Socrates'),
    document.fonts.load('400 16px "Geist Mono"', 'const value = 1;'),
  ]).then((groups) => groups.every((faces) => faces.length > 0 && faces.every((face) => face.status === 'loaded'))));
  expect(brandFaces).toBe(true);

  /* Switching back to English must restore the Latin UI face. */
  await page.evaluate(() => window.setLang('en'));
  await expect(editor).toHaveAttribute('aria-label', 'Ask Socrates');
  const enFont = await editor.evaluate((el) => {
    const p = el.querySelector('p.is-editor-empty:first-child');
    return p ? getComputedStyle(p, '::before').fontFamily : '';
  });
  expect(enFont).toContain('Geist Sans');
});

test('landing greeting has no leading logo and keeps the western Geist Sans face in Chinese UI', async ({ page }) => {
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
  expect(zhStyle.fontFamily.split(',')[0].replace(/["']/g, '').trim()).toBe('Geist Sans');
  expect(zhStyle.fontFamily).toContain(CJK_FACE);
  expect(zhStyle.fontFamily).toContain('Geist Sans');
  expect(zhStyle.fontFamily).not.toContain('MiSans');
  expect(await cjkFaceLoads(page)).toBe(true);
  expect(zhStyle.paddingLeft).toBe('0px');
  expect(['none', 'normal']).toContain(zhStyle.beforeContent);

  await page.evaluate(() => window.setLang('en'));
  const enFont = await greeting.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(enFont.split(',')[0].replace(/["']/g, '').trim()).toBe('Geist Sans');
});
