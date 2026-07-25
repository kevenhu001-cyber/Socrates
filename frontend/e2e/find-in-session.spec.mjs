// @ts-check
// P0.2 — In-session find (Ctrl-F). Verifies that opening the find bar,
// typing a query, highlights every literal match inside #msgList, that the
// counter + active highlight track navigation, and that closing the bar
// unwinds every <mark> cleanly.
//
// Like cmd-k.spec.mjs we drive the feature through the window bridge
// functions rather than OS-level keydown so the spec is deterministic and
// doesn't depend on browser find-shortcut interception.

import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('Ctrl-F find highlights matches, navigates, and clears on close', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.waitForTimeout(400);

  // Reveal the chat view and inject two messages containing the word
  // "photon" three times total so we have deterministic match counts.
  await page.evaluate(() => {
    const cv = document.getElementById('chatView');
    if (cv) cv.classList.remove('hidden');
    const list = document.getElementById('msgList');
    if (!list) throw new Error('msgList missing');
    list.innerHTML = [
      '<div class="msg user"><div class="msg-body">Tell me about the photon.</div></div>',
      '<div class="msg assistant"><div class="msg-body">' +
        'A <b>photon</b> is a quantum of light. Every photon is massless.' +
        '</div></div>',
    ].join('');
  });

  // Open the bar via the bridge (mirrors the Ctrl-F path in main.js).
  await page.evaluate(() => window.openFindInSession());
  const bar = page.locator('#findBar').first();
  await expect(bar).toBeVisible();

  const input = page.locator('#findInput');
  await input.fill('photon');
  // oninput fires on fill; give highlightMatches a tick.
  await page.waitForTimeout(100);

  // Three literal "photon" occurrences → three highlight marks.
  const marks = page.locator('#msgList mark.find-hl');
  await expect(marks).toHaveCount(3);

  // First match is active and the counter reads "1/3".
  await expect(page.locator('#msgList mark.find-hl.find-hl-active')).toHaveCount(1);
  await expect(page.locator('#findCount')).toHaveText('1/3');

  // findNext advances the active highlight to 2/3.
  await page.evaluate(() => window.findNext());
  await expect(page.locator('#findCount')).toHaveText('2/3');
  const activeText = await page.locator('#msgList mark.find-hl.find-hl-active').textContent();
  expect((activeText || '').toLowerCase()).toBe('photon');

  // Wrap-around: from 3/3 → next → back to 1/3.
  await page.evaluate(() => { window.findNext(); window.findNext(); });
  await expect(page.locator('#findCount')).toHaveText('1/3');

  // findPrev wraps to the last match.
  await page.evaluate(() => window.findPrev());
  await expect(page.locator('#findCount')).toHaveText('3/3');

  // Closing removes the bar and every highlight, restoring the text.
  await page.evaluate(() => window.closeFindInSession());
  await expect(bar).toBeHidden();
  await expect(page.locator('#msgList mark.find-hl')).toHaveCount(0);
  await expect(page.locator('#msgList')).toContainText('A photon is a quantum of light.');
});
