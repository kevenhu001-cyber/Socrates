// debug-topic.spec.mjs — focused inspector for topic vs chat composer
// resize behavior on a mobile viewport. Each test starts fresh from page
// reload, so initial state is documented before any interaction.

import { test } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

function setup(page, viewport) {
  return async () => {
    await mockAuthedApp(page);
    await page.setViewportSize(viewport);
    await gotoAndSettle(page, '/');
    await page.waitForLoadState('domcontentloaded');
    await waitForAppShell(page);
  };
}

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

async function installHeightSampler(page, selector = '#topicInputWrap') {
  await page.evaluate((sel) => {
    const wrap = document.querySelector(sel);
    const editor = wrap.querySelector('.rich-composer-editor');
    window.__samples = [];
    const ro = new ResizeObserver(() => {
      window.__samples.push({
        t: performance.now(),
        wrapH: wrap.getBoundingClientRect().height,
        editorH: editor.getBoundingClientRect().height,
        classes: Array.from(wrap.classList).filter((c) => c.startsWith('composer-')),
      });
    });
    ro.observe(wrap);
    ro.observe(editor);
    window.__resetSamples = () => { window.__samples = []; };
  }, selector);
}

test('DEBUG: topic composer — focus alone must NOT change height', async ({ page }) => {
  await setup(page, { width: 390, height: 844 })(page);
  const before = await snapshotWrap(page, '#topicInputWrap');
  console.log('TOPIC BEFORE:', JSON.stringify(before));
  await installHeightSampler(page);
  await page.locator('#topicComposerRoot .rich-composer-editor').focus();
  await page.waitForTimeout(60);
  await page.locator('#topicComposerRoot .rich-composer-editor').fill('First line only');
  await page.waitForTimeout(400);
  const after = await snapshotWrap(page, '#topicInputWrap');
  console.log('TOPIC AFTER FOCUS+1LINE:', JSON.stringify(after));
  const samples = await page.evaluate(() => window.__samples);
  console.log('TOPIC SAMPLES:', JSON.stringify(samples, null, 2));
});

test('DEBUG: topic composer — multiline content must trigger height growth', async ({ page }) => {
  await setup(page, { width: 390, height: 844 })(page);
  const editor = page.locator('#topicComposerRoot .rich-composer-editor');
  await editor.focus();
  await editor.fill('Long enough content to overflow into a second visual line on the mobile composer.');
  await page.waitForTimeout(700);
  const after = await snapshotWrap(page, '#topicInputWrap');
  console.log('TOPIC AFTER MULTILINE:', JSON.stringify(after));
});

test('DEBUG: chat composer — focus + one line must NOT change wrap height', async ({ page }) => {
  await setup(page, { width: 390, height: 844 })(page);
  await page.evaluate(() => {
    window.state.phase = 'chat';
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
  });
  await page.waitForTimeout(150);
  const before = await snapshotWrap(page, '#chatInputWrap');
  console.log('CHAT BEFORE:', JSON.stringify(before));
  await installHeightSampler(page, '#chatInputWrap');
  await page.evaluate(() => {
    const wrap = document.getElementById('chatInputWrap');
    const editor = wrap.querySelector('.rich-composer-editor');
    window.__samples = [];
    const ro = new ResizeObserver(() => {
      window.__samples.push({
        t: performance.now(),
        wrapH: wrap.getBoundingClientRect().height,
        editorH: editor.getBoundingClientRect().height,
        classes: Array.from(wrap.classList).filter((c) => c.startsWith('composer-')),
      });
    });
    ro.observe(wrap);
    ro.observe(editor);
    window.__resetSamples = () => { window.__samples = []; };
  });
  await page.locator('#chatComposerRoot .rich-composer-editor').focus();
  await page.waitForTimeout(60);
  await page.locator('#chatComposerRoot .rich-composer-editor').fill('First line only');
  await page.waitForTimeout(500);
  const after = await snapshotWrap(page, '#chatInputWrap');
  console.log('CHAT AFTER FOCUS+1LINE:', JSON.stringify(after));
  const samples = await page.evaluate(() => window.__samples);
  console.log('CHAT SAMPLES:', JSON.stringify(samples, null, 2));
});

test('DEBUG: chat composer — multiline content must grow smoothly', async ({ page }) => {
  await setup(page, { width: 390, height: 844 })(page);
  await page.evaluate(() => {
    window.state.phase = 'chat';
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    window.__samples = [];
    const wrap = document.getElementById('chatInputWrap');
    const editor = wrap.querySelector('.rich-composer-editor');
    const ro = new ResizeObserver(() => {
      window.__samples.push({
        t: performance.now(),
        wrapH: wrap.getBoundingClientRect().height,
        editorH: editor.getBoundingClientRect().height,
        classes: Array.from(wrap.classList).filter((c) => c.startsWith('composer-')),
      });
    });
    ro.observe(wrap);
    ro.observe(editor);
  });
  const editor = page.locator('#chatComposerRoot .rich-composer-editor');
  await editor.focus();
  await editor.fill('Short');
  await page.waitForTimeout(150);
  const samplesAfterShort = await page.evaluate(() => window.__samples);
  console.log('CHAT AFTER SHORT (samples):', JSON.stringify(samplesAfterShort, null, 2));
  await page.evaluate(() => { window.__samples = []; });
  await editor.press('Shift+Enter');
  await editor.type('Second line');
  await page.waitForTimeout(500);
  const samplesAfterMulti = await page.evaluate(() => window.__samples);
  console.log('CHAT AFTER MULTILINE (samples):', JSON.stringify(samplesAfterMulti, null, 2));
});
