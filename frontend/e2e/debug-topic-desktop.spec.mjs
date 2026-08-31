// debug-topic-desktop.spec.mjs — Desktop inspect.
import { test } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function snapshotWrap(page, wrapSelector) {
  return page.evaluate((sel) => {
    const wrap = document.querySelector(sel);
    if (!wrap) return null;
    const editor = wrap.querySelector('.rich-composer-editor');
    return {
      wrapH: wrap.getBoundingClientRect().height,
      wrapClasses: Array.from(wrap.classList),
      editorH: editor ? editor.getBoundingClientRect().height : 0,
      editorComputedHeight: editor ? getComputedStyle(editor).height : null,
      editorComputedMaxHeight: editor ? getComputedStyle(editor).maxHeight : null,
      editorStyleHeight: editor ? editor.style.height : null,
    };
  }, wrapSelector);
}

test('DEBUG: topic composer on DESKTOP — focus + 1 line behavior', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const baseline = await snapshotWrap(page, '#topicInputWrap');
  console.log('DESKTOP TOPIC BASELINE:', JSON.stringify(baseline));

  await page.locator('#topicComposerRoot .rich-composer-editor').focus();
  await page.waitForTimeout(150);
  const afterFocus = await snapshotWrap(page, '#topicInputWrap');
  console.log('DESKTOP TOPIC AFTER FOCUS:', JSON.stringify(afterFocus));

  await page.locator('#topicComposerRoot .rich-composer-editor').fill('First line only');
  await page.waitForTimeout(300);
  const afterOneLine = await snapshotWrap(page, '#topicInputWrap');
  console.log('DESKTOP TOPIC AFTER 1LINE:', JSON.stringify(afterOneLine));

  await page.locator('#topicComposerRoot .rich-composer-editor').fill('A much longer line of text that should wrap to the second line on desktop');
  await page.waitForTimeout(500);
  const afterMulti = await snapshotWrap(page, '#topicInputWrap');
  console.log('DESKTOP TOPIC AFTER MULTILINE:', JSON.stringify(afterMulti));
});

test('DEBUG: chat composer on DESKTOP — focus + 1 line behavior', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.state.phase = 'chat';
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
  });
  await page.waitForTimeout(150);
  const baseline = await snapshotWrap(page, '#chatInputWrap');
  console.log('DESKTOP CHAT BASELINE:', JSON.stringify(baseline));

  await page.locator('#chatComposerRoot .rich-composer-editor').focus();
  await page.waitForTimeout(150);
  const afterFocus = await snapshotWrap(page, '#chatInputWrap');
  console.log('DESKTOP CHAT AFTER FOCUS:', JSON.stringify(afterFocus));

  await page.locator('#chatComposerRoot .rich-composer-editor').fill('First line only');
  await page.waitForTimeout(500);
  const afterOneLine = await snapshotWrap(page, '#chatInputWrap');
  console.log('DESKTOP CHAT AFTER 1LINE:', JSON.stringify(afterOneLine));

  await page.locator('#chatComposerRoot .rich-composer-editor').fill('A much longer line of text that should wrap to the second line on desktop');
  await page.waitForTimeout(800);
  const afterMulti = await snapshotWrap(page, '#chatInputWrap');
  console.log('DESKTOP CHAT AFTER MULTILINE:', JSON.stringify(afterMulti));
});
