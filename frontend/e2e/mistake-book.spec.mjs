// mistake-book.spec.mjs — the mistake book is one of the four structural
// moat features in docs/plans/product-roadmap.md (苏格拉底教学 / 知识图谱
// / 错题本 / 诊断评估), so it ships in the default zh locale like the rest
// of the app.
//
// It previously rendered raw English literals ("Redo", "conquered",
// "Redone 3 times", the empty states) and echoed the internal
// mistake.type enum ("quiz" / "practice") straight into the card meta.
// Nothing asserted on the rendered copy, so a locale switch left the
// whole panel half-translated.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const MISTAKES = [
  {
    id: 'm1', type: 'quiz', topic: '导数', q: 'd/dx (x²) = ?',
    options: [{ letter: 'A', text: '2x' }, { letter: 'B', text: 'x' }],
    correct: 'A', userAnswer: 'B', timestamp: Date.now() - 60_000,
    redoCount: 3, resolved: true,
  },
  {
    id: 'm2', type: 'practice', topic: '积分', q: '∫x dx = ?',
    options: [], correct: 'x²/2', userAnswer: 'x', timestamp: Date.now() - 120_000,
    redoCount: 1,
  },
];

async function openMistakeBook(page, mistakes) {
  await mockAuthedApp(page, { lang: 'zh' });
  await page.setViewportSize({ width: 1280, height: 1200 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  /* After the top-bar Chat/Tutor pill was removed (see frontend/index.html),
     enter tutor mode programmatically via the same entry point the deleted
     pill used to drive. */
  await page.evaluate(() => window.toggleAppMode?.('tutor'));
  await expect.poll(() => page.evaluate(() => window.appMode)).toBe('tutor');
  await page.locator('#tabMistakes').click();
  await expect(page.locator('#mistakesPanel')).toBeVisible();
  await page.evaluate((list) => {
    window.stateStore.dispatch({ type: 'state/set', key: 'mistakes', value: list });
    window.updateMistakesBadge?.();
    window.renderMistakes?.();
  }, mistakes);
  /* Fall back to whatever the app exposes if the badge/redraw helpers are
     not on window; the render is idempotent either way. */
  await page.evaluate(() => {
    const tab = document.getElementById('tabMistakes');
    if (tab) tab.click();
  });
  await page.waitForTimeout(200);
}

test('the empty state is localized', async ({ page }) => {
  await openMistakeBook(page, []);
  const empty = page.locator('#mistakesList .recents-empty');
  await expect(empty).toContainText('还没有错题');
  await expect(empty).not.toContainText('No mistakes yet');
});

test('cards localize the type, redo count and conquered tag', async ({ page }) => {
  await openMistakeBook(page, MISTAKES);

  const first = page.locator('#mistakesList .mistake-card[data-mistake-id="m1"]');
  await expect(first).toHaveCount(1);
  /* The internal enum must not reach the learner. */
  await expect(first.locator('.mistake-type')).toHaveText('测验');
  await expect(first.locator('.mistake-resolved-tag')).toHaveText('已攻克');
  await expect(first.locator('.mistake-redo-count')).toHaveText('已重做 3 次');
  await expect(first.locator('.mistake-redo-btn')).toHaveText('重做');

  const second = page.locator('#mistakesList .mistake-card[data-mistake-id="m2"]');
  await expect(second.locator('.mistake-type')).toHaveText('练习');
  /* Singular is a separate key — an "s" appended to a Chinese string, or
     a "1 times", both read as broken. */
  await expect(second.locator('.mistake-redo-count')).toHaveText('已重做 1 次');
  await expect(second.locator('.mistake-resolved-tag')).toHaveCount(0);
});
