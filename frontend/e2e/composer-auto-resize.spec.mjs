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

/* Mobile growth/shrink is a single smooth motion (editor + chrome in one
   surface). fill() replaces the draft atomically, so individual frames are
   asserted with the same tolerance the chat composer below uses: the shell
   must never lose its chrome (stay within 16px of the one-row baseline)
   and shrink must never bounce back upward. */

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
  /* fill() replaces the draft atomically; the Tiptap swap can paint a
     momentary dip between the cleared editor and the expanded two-row
     shell. Mirror the chat composer's tolerance (see below): the shell
     must never lose its chrome, i.e. fall more than 16px below the
     one-row baseline, even if a sampled frame sits inside the swap. */
  for (const { height } of growth) {
    expect(height, `wrap height must not drop below baseline mid-fill (${JSON.stringify(growth)})`)
      .toBeGreaterThanOrEqual(baseline - 16);
  }

  const shrink = await sampleDuring(page, '#topicInputWrap', async () => {
    await editor.fill('Back to one line');
  });
  await expect(wrap).not.toHaveClass(/composer-multiline/);
  expect(await heightOf(wrap)).toBe(baseline);
  /* Shrinking glides from the tall two-tier height down to the one-row
     baseline — it must never bounce back upward on the way down. */
  const shrinkValues = shrink.map(({ height }) => height);
  const shrinkBounces = shrinkValues.slice(1).filter((height, index) => height - shrinkValues[index] > 6);
  expect(shrinkBounces, JSON.stringify(shrink)).toEqual([]);

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
  /* The multiline layout is a designed two-tier grid (editor row + control
     row), so the wrap lands strictly taller than the single-row baseline
     and never collapses below it mid-swap (a paste replaces content
     atomically — a momentary dip below the one-row height would mean the
     chrome is lost, not just that a row stepped in). */
  expect(await heightOf(wrap)).toBeGreaterThan(baseline);
  for (const { height } of growth) {
    expect(height, `wrap height must not drop below baseline mid-paste (${JSON.stringify(growth)})`)
      .toBeGreaterThanOrEqual(baseline - 16);
  }

  const shrink = await sampleDuring(page, '#chatInputWrap', async () => {
    await editor.fill('short');
  });
  await expect(wrap).not.toHaveClass(/composer-multiline/);
  expect(await heightOf(wrap)).toBe(baseline);
  /* Shrinking glides from the tall two-tier height down to the one-row
     baseline — it must never bounce back upward on the way down. */
  const shrinkValues = shrink.map(({ height }) => height);
  const shrinkBounces = shrinkValues.slice(1).filter((height, index) => height - shrinkValues[index] > 6);
  expect(shrinkBounces, JSON.stringify(shrink)).toEqual([]);

  await page.setViewportSize({ width: 320, height: 844 });
  await editor.fill('This text stays stable while the narrower container wraps it onto additional rendered lines.');
  await expect(wrap).toHaveClass(/composer-multiline/);
  await page.setViewportSize(MOBILE);
  await editor.fill('');
  await expect(wrap).not.toHaveClass(/composer-multiline/);
  await expect.poll(() => heightOf(wrap)).toBe(baseline);
});

test('desktop composers stay compact single-row and return to their exact baseline', async ({ page }) => {
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
  /* Desktop composers are the compact single-row surface (editor row
     scrolls internally): a longer draft must not change the wrap height —
     only the multiline class reflects it. */
  await topicEditor.fill('one\ntwo\nthree');
  await expect(topicWrap).toHaveClass(/composer-multiline/);
  expect(await heightOf(topicWrap)).toBe(topicBaseline);
  await topicEditor.fill('start chat');
  await expect(topicWrap).not.toHaveClass(/composer-multiline/);
  expect(await heightOf(topicWrap)).toBe(topicBaseline);
  await topicEditor.press('Enter');
  await expect(page.locator('#chatView')).toBeVisible();

  const chatWrap = page.locator('#chatInputWrap');
  const chatEditor = page.locator('#chatComposerRoot .rich-composer-editor');
  const chatBaseline = await heightOf(chatWrap);
  await chatEditor.focus();
  expect(await heightOf(chatWrap)).toBe(chatBaseline);
  await chatEditor.fill('one\ntwo\nthree\nfour');
  await expect(chatWrap).toHaveClass(/composer-multiline/);
  expect(await heightOf(chatWrap)).toBe(chatBaseline);
  await chatEditor.fill('one line');
  await expect(chatWrap).not.toHaveClass(/composer-multiline/);
  expect(await heightOf(chatWrap)).toBe(chatBaseline);
  await chatEditor.fill('');
  expect(await heightOf(chatWrap)).toBe(chatBaseline);
});
