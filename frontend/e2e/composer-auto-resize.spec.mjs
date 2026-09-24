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

/* Wait until the capsule reports the same height on two consecutive frames,
   so a sample window never starts inside the tail of the previous motion. */
async function settle(locator) {
  let previous = -1;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const current = await heightOf(locator);
    if (Math.abs(current - previous) < 0.5) return current;
    previous = current;
    await locator.page().waitForTimeout(32);
  }
  return previous;
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

  const growth = await sampleDuring(page, '#topicInputWrap', async () => {
    await editor.fill('First line\nSecond line');
  });
  expect(await heightOf(wrap)).toBeGreaterThan(baseline);
  /* fill() clears then retypes, which can paint one isolated empty-editor
     frame; a real paste replaces atomically. Allow a single dip but never
     two consecutive frames below the one-row baseline. */
  let consecutiveDips = 0;
  for (const { height } of growth) {
    consecutiveDips = height < baseline - 16 ? consecutiveDips + 1 : 0;
    expect(consecutiveDips, `wrap height must not stay below baseline mid-fill (${JSON.stringify(growth)})`)
      .toBeLessThan(2);
  }

  /* The collapse probe measures at the *collapsed* row width — with the
     effort pill inline that editor column is ~100px, so the probe string
     must be short enough to fit one collapsed line. */
  /* Let the expansion finish before sampling the collapse: the sample window
     otherwise starts inside the growth animation's tail, which reads as a
     bounce. */
  await settle(wrap);
  const shrink = await sampleDuring(page, '#topicInputWrap', async () => {
    await editor.fill('Back');
  });
  /* The capsule glides back to the one-row baseline; poll for the settled
     height instead of reading a frame that is still animating. */
  await expect.poll(() => heightOf(wrap)).toBe(baseline);
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
  /* The multiline layout is a designed two-tier grid (editor row + control
     row), so the wrap lands strictly taller than the single-row baseline.
     fill() replaces content as clear-then-retype, which can paint a single
     isolated empty-editor frame (the atomic paste a real user triggers does
     not). A sustained dip below the one-row height would mean the chrome is
     lost, so allow one such frame but never two in a row. */
  expect(await heightOf(wrap)).toBeGreaterThan(baseline);
  let consecutiveDips = 0;
  for (const { height } of growth) {
    consecutiveDips = height < baseline - 16 ? consecutiveDips + 1 : 0;
    expect(consecutiveDips, `wrap height must not stay below baseline mid-paste (${JSON.stringify(growth)})`)
      .toBeLessThan(2);
  }

  await settle(wrap);
  const shrink = await sampleDuring(page, '#chatInputWrap', async () => {
    await editor.fill('short');
  });
  /* Same settled-height poll as the topic composer above: the capsule
     animates from the two-tier card back to the one-row baseline. */
  await expect.poll(() => heightOf(wrap)).toBe(baseline);
  /* Shrinking glides from the tall two-tier height down to the one-row
     baseline — it must never bounce back upward on the way down. */
  const shrinkValues = shrink.map(({ height }) => height);
  const shrinkBounces = shrinkValues.slice(1).filter((height, index) => height - shrinkValues[index] > 6);
  expect(shrinkBounces, JSON.stringify(shrink)).toEqual([]);

  await page.setViewportSize({ width: 320, height: 844 });
  await editor.fill('This text stays stable while the narrower container wraps it onto additional rendered lines.');
  /* The resize + rewrap needs a layout pass before the wrap grows — poll
     for it instead of sampling the first frame after fill. */
  await expect.poll(() => heightOf(wrap)).toBeGreaterThan(baseline);
  await page.setViewportSize(MOBILE);
  await editor.fill('');
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
  /* Desktop composers are a two-tier surface: a multiline draft switches
     tiers (the topic shell's roomy 128px idle tier compacts toward content,
     the chat shell grows from 68px), and collapsing back must restore the
     exact baseline. Tier switches animate (~340ms), so poll instead of
     snapshotting mid-flight. */
  await topicEditor.fill('one\ntwo\nthree');
  await expect(topicWrap).toHaveClass(/composer-multiline/);
  await expect.poll(() => heightOf(topicWrap)).not.toBe(topicBaseline);
  await topicEditor.fill('start chat');
  await expect(topicWrap).not.toHaveClass(/composer-multiline/);
  await expect.poll(() => heightOf(topicWrap)).toBe(topicBaseline);
  await topicEditor.press('Enter');
  await expect(page.locator('#chatView')).toBeVisible();

  const chatWrap = page.locator('#chatInputWrap');
  const chatEditor = page.locator('#chatComposerRoot .rich-composer-editor');
  const chatBaseline = await heightOf(chatWrap);
  await chatEditor.focus();
  expect(await heightOf(chatWrap)).toBe(chatBaseline);
  await chatEditor.fill('one\ntwo\nthree\nfour');
  await expect(chatWrap).toHaveClass(/composer-multiline/);
  await expect.poll(() => heightOf(chatWrap)).not.toBe(chatBaseline);
  await chatEditor.fill('one line');
  await expect(chatWrap).not.toHaveClass(/composer-multiline/);
  await expect.poll(() => heightOf(chatWrap)).toBe(chatBaseline);
  await chatEditor.fill('');
  await expect.poll(() => heightOf(chatWrap)).toBe(chatBaseline);
});
