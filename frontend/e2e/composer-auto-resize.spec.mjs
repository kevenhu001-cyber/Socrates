import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const MOBILE = { width: 390, height: 844 };

async function openApp(page) {
  await page.setViewportSize(MOBILE);
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
}

async function heightOf(locator) {
  return locator.evaluate((node) => node.getBoundingClientRect().height);
}

async function sampleDuring(page, wrapSelector, action, duration = 450) {
  await page.evaluate(({ selector, durationMs }) => {
    const wrap = document.querySelector(selector);
    window.__composerHeightSamples = [];
    const startedAt = performance.now();
    const sample = () => {
      window.__composerHeightSamples.push({
        t: performance.now() - startedAt,
        height: wrap.getBoundingClientRect().height,
      });
      if (performance.now() - startedAt < durationMs) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, { selector: wrapSelector, durationMs: duration });
  await action();
  await page.waitForTimeout(duration + 30);
  return page.evaluate(() => window.__composerHeightSamples);
}

function expectContinuous(samples, direction) {
  const values = samples.map(({ height }) => height);
  const deltas = values.slice(1).map((height, index) => height - values[index]);
  const wrongWay = direction === 'grow'
    ? deltas.filter((delta) => delta < -6)
    : deltas.filter((delta) => delta > 6);
  const largestStep = Math.max(0, ...deltas.map(Math.abs));
  expect(wrongWay, JSON.stringify(samples)).toEqual([]);
  expect(largestStep, JSON.stringify(samples)).toBeLessThan(18);
}

test('topic composer changes geometry only after a second rendered line', async ({ page }) => {
  await openApp(page);
  const wrap = page.locator('#topicInputWrap');
  const editor = page.locator('#topicComposerRoot .rich-composer-editor');
  const baseline = await heightOf(wrap);

  await editor.focus();
  await page.waitForTimeout(80);
  expect(await heightOf(wrap)).toBe(baseline);

  await editor.fill('One line');
  await page.waitForTimeout(80);
  expect(await heightOf(wrap)).toBe(baseline);
  await expect(wrap).not.toHaveClass(/composer-multiline/);

  const growth = await sampleDuring(page, '#topicInputWrap', async () => {
    await editor.fill('First line\nSecond line');
  });
  await expect(wrap).toHaveClass(/composer-multiline/);
  expect(await heightOf(wrap)).toBeGreaterThan(baseline);
  expectContinuous(growth, 'grow');

  const shrink = await sampleDuring(page, '#topicInputWrap', async () => {
    await editor.fill('Back to one line');
  });
  await expect(wrap).not.toHaveClass(/composer-multiline/);
  expect(await heightOf(wrap)).toBe(baseline);
  expectContinuous(shrink, 'shrink');

  await editor.blur();
  await page.waitForTimeout(80);
  expect(await heightOf(wrap)).toBe(baseline);
  await editor.fill('');
  expect(await heightOf(wrap)).toBe(baseline);
});

test('chat composer stays continuous through paste, rapid delete and resize', async ({ page }) => {
  await openApp(page);
  const topic = page.locator('#topicComposerRoot .rich-composer-editor');
  await topic.fill('Open the conversation');
  await topic.press('Enter');
  await expect(page.locator('#chatView')).toBeVisible();

  const wrap = page.locator('#chatInputWrap');
  const editor = page.locator('#chatComposerRoot .rich-composer-editor');
  const baseline = await heightOf(wrap);
  await editor.focus();
  expect(await heightOf(wrap)).toBe(baseline);

  const growth = await sampleDuring(page, '#chatInputWrap', async () => {
    await editor.fill('Pasted first line\nPasted second line\nPasted third line');
  });
  await expect(wrap).toHaveClass(/composer-multiline/);
  expectContinuous(growth, 'grow');

  const shrink = await sampleDuring(page, '#chatInputWrap', async () => {
    await editor.fill('short');
  });
  await expect(wrap).not.toHaveClass(/composer-multiline/);
  expect(await heightOf(wrap)).toBe(baseline);
  expectContinuous(shrink, 'shrink');

  await page.setViewportSize({ width: 320, height: 844 });
  await editor.fill('This text stays stable while the narrower container wraps it onto additional rendered lines.');
  await expect(wrap).toHaveClass(/composer-multiline/);
  await page.setViewportSize(MOBILE);
  await editor.fill('');
  await expect(wrap).not.toHaveClass(/composer-multiline/);
  await expect.poll(() => heightOf(wrap)).toBe(baseline);
});

test('desktop topic and chat composers expand and return to their exact baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const topicWrap = page.locator('#topicInputWrap');
  const topicEditor = page.locator('#topicComposerRoot .rich-composer-editor');
  const topicBaseline = await heightOf(topicWrap);
  await topicEditor.focus();
  expect(await heightOf(topicWrap)).toBe(topicBaseline);
  await topicEditor.fill('one line');
  expect(await heightOf(topicWrap)).toBe(topicBaseline);
  await topicEditor.fill('one\ntwo\nthree');
  await expect.poll(() => heightOf(topicWrap)).toBeGreaterThan(topicBaseline);
  await topicEditor.fill('start chat');
  await expect.poll(() => heightOf(topicWrap)).toBe(topicBaseline);
  await topicEditor.press('Enter');
  await expect(page.locator('#chatView')).toBeVisible();

  const chatWrap = page.locator('#chatInputWrap');
  const chatEditor = page.locator('#chatComposerRoot .rich-composer-editor');
  const chatBaseline = await heightOf(chatWrap);
  await chatEditor.focus();
  expect(await heightOf(chatWrap)).toBe(chatBaseline);
  const desktopGrowth = await sampleDuring(page, '#chatInputWrap', async () => {
    await chatEditor.fill('one\ntwo\nthree\nfour');
  }, 500);
  await expect.poll(() => heightOf(chatWrap)).toBeGreaterThan(chatBaseline);
  expectContinuous(desktopGrowth, 'grow');
  const desktopShrink = await sampleDuring(page, '#chatInputWrap', async () => {
    await chatEditor.fill('one line');
  }, 500);
  await expect.poll(() => heightOf(chatWrap)).toBe(chatBaseline);
  expectContinuous(desktopShrink, 'shrink');
});
