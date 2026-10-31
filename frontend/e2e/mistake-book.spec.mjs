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
  await page.locator('#topModeTutor').click();
  await expect(page.locator('#topModeTutor')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#tabMistakes').click();
  await expect(page.locator('#mistakesPanel')).toBeVisible();
  await page.evaluate((list) => {
    window.stateStore.dispatch({ type: 'state/set', key: 'mistakes', value: list });
  }, mistakes);
  await expect(page.locator('#mistakesTabBadge')).toHaveText(mistakes.length ? String(mistakes.length) : '');
}

async function activateTranscript(page) {
  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
    document.body.dataset.conversationActive = 'true';
  });
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

  await page.locator('#mistakeFilterBar [data-v="unresolved"]').click();
  await expect(first).toHaveCount(0);
  await expect(second).toHaveCount(1);
  await page.locator('#mistakeFilterBar [data-v="all"]').click();
  await expect(first).toHaveCount(1);
});

test('practice redo appends a React-owned assistant widget', async ({ page }) => {
  await openMistakeBook(page, [{
    id: 'redo-practice', type: 'practice', topic: '代数', q: '解释为什么 x = 4。',
    options: [], correct: '因为两边同时减去 2。', userAnswer: null,
    timestamp: Date.now(), redoCount: 0,
  }]);
  await activateTranscript(page);

  await page.locator('[data-redo="redo-practice"]').click();
  const message = page.locator('#msgList > .msg.assistant').last();
  await expect(message).toHaveAttribute('data-react-owned', '1');
  await expect(message).toContainText('重做做错的题目');
  const widget = message.locator('.inline-practice');
  await expect(widget).toHaveCount(1);
  await expect(widget.locator('.inline-practice-problem')).toContainText('解释为什么 x = 4。');

  await widget.locator('.inline-practice-reveal').click();
  await expect(widget.locator('.inline-practice-feedback')).toHaveText('因为两边同时减去 2。');
});

test('quiz redo appends a React-owned widget and resolves the current mistake slot', async ({ page }) => {
  await openMistakeBook(page, [{
    id: 'redo-quiz', type: 'quiz', topic: '算术', q: '2 + 2 = ?',
    options: [{ letter: 'A', text: '4' }, { letter: 'B', text: '5' }],
    correct: 'A', userAnswer: 'B', quizSlotId: 'original-quiz-slot',
    timestamp: Date.now(), redoCount: 0,
  }]);
  await activateTranscript(page);

  await page.locator('[data-redo="redo-quiz"]').click();
  const message = page.locator('#msgList > .msg.assistant').last();
  await expect(message).toHaveAttribute('data-react-owned', '1');
  const widget = message.locator('.inline-quiz');
  await expect(widget).toHaveCount(1);
  await expect(widget.locator('.inline-quiz-q')).toContainText('2 + 2 = ?');
  const redoSlotId = await page.evaluate(() => window.stateStore.read('mistakes')[0].quizSlotId);
  expect(redoSlotId).toMatch(/^redo-quiz-/);
  const rawText = await page.evaluate(() => window.stateStore.read('messages').at(-1).rawText);
  expect(rawText).toContain(`data-quiz-id="${redoSlotId}"`);

  await widget.locator('[data-letter="A"]').click();
  await expect(widget.locator('.inline-quiz-feedback')).toHaveClass(/\bok\b/);
  await expect(page.locator('#mistakesList .mistake-card[data-mistake-id="redo-quiz"]')).toHaveCount(0);
});
