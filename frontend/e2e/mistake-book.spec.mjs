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
  const empty = page.locator('#mistakesList [data-mistake-empty="empty"]');
  await expect(empty).toContainText('还没有错题');
  await expect(empty).not.toContainText('No mistakes yet');
});

test('cards localize the type, redo count and conquered tag', async ({ page }) => {
  await openMistakeBook(page, MISTAKES);

  const first = page.locator('#mistakesList [data-mistake-id="m1"]');
  await expect(first).toHaveCount(1);
  /* The internal enum must not reach the learner. */
  await expect(first.locator('[data-mistake-type]')).toHaveText('测验');
  await expect(first.locator('[data-mistake-resolved-tag]')).toHaveText('已攻克');
  await expect(first.locator('[data-mistake-redo-count]')).toHaveText('已重做 3 次');
  await expect(first.locator('[data-redo]')).toHaveText('重做');

  const second = page.locator('#mistakesList [data-mistake-id="m2"]');
  await expect(second.locator('[data-mistake-type]')).toHaveText('练习');
  /* Singular is a separate key. */
  await expect(second.locator('[data-mistake-redo-count]')).toHaveText('已重做 1 次');
  await expect(second.locator('[data-mistake-resolved-tag]')).toHaveCount(0);

  await page.locator('#mistakesList [data-v="unresolved"]').click();
  await expect(first).toHaveCount(0);
  await expect(second).toHaveCount(1);
  await page.locator('#mistakesList [data-v="all"]').click();
  await expect(first).toHaveCount(1);
});

test('expanding a card shows where it went wrong and the right way', async ({ page }) => {
  await openMistakeBook(page, MISTAKES);
  const first = page.locator('#mistakesList [data-mistake-id="m1"]');
  const toggle = first.locator('[data-mistake-toggle]');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(first.locator('[data-mistake-cause]')).toContainText('B · x');
  await expect(first.locator('[data-mistake-right]')).toContainText('A · 2x');
  await expect(first.locator('[data-mistake-tag="correct"]')).toHaveAttribute('data-mistake-opt', 'A');
  await expect(first.locator('[data-mistake-tag="wrong"]')).toHaveAttribute('data-mistake-opt', 'B');
  /* Two topics → two groups. */
  await expect(page.locator('#mistakesList [data-mistake-group]')).toHaveCount(2);
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
  const widget = message.locator('.sc-host[data-scaffold="practice"]');
  await expect(widget).toHaveCount(1);
  await expect(widget.locator('[data-part="practice-problem"]')).toContainText('解释为什么 x = 4。');

  await widget.getByTestId('practice-reveal').click();
  await expect(widget.getByTestId('practice-feedback')).toHaveText('因为两边同时减去 2。');
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
  const widget = message.locator('.sc-host[data-scaffold="quiz"]');
  await expect(widget).toHaveCount(1);
  await expect(widget.locator('[data-part="quiz-q"]')).toContainText('2 + 2 = ?');
  const redoSlotId = await page.evaluate(() => window.stateStore.read('mistakes')[0].quizSlotId);
  expect(redoSlotId).toMatch(/^redo-quiz-/);
  const rawText = await page.evaluate(() => window.stateStore.read('messages').at(-1).rawText);
  expect(rawText).toContain(`data-quiz-id="${redoSlotId}"`);

  await widget.locator('[data-letter="A"]').click();
  await widget.getByTestId('quiz-submit').click();
  await expect(widget.getByTestId('quiz-feedback')).toHaveAttribute('data-verdict', 'correct');
  await expect(page.locator('#mistakesList [data-mistake-id="redo-quiz"]')).toHaveCount(0);
});

/* RN-14: the book gathers every session's mistakes, so the home page's
   "mistakes into next questions" never opens onto an empty book when an
   earlier session left mistakes behind. */
test('home mistakes mode shows mistakes from earlier sessions', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('socrates-mistake-archive-v1:u-test-1', JSON.stringify({ v: 1, sessions: {
      's-calculus': { label: '导数入门', at: Date.now() - 60_000, mistakes: [
        { id: 'arch-1', type: 'quiz', topic: '导数', q: 'd/dx (x³) = ?', options: [{ letter: 'A', text: '3x²' }, { letter: 'B', text: 'x²' }], correct: 'A', userAnswer: 'B', timestamp: Date.now() - 60_000 },
      ] },
      's-integral': { label: '积分', at: Date.now() - 120_000, mistakes: [
        { id: 'arch-2', type: 'practice', topic: '', q: '∫2x dx = ?', options: [], correct: 'x² + C', userAnswer: '2', timestamp: Date.now() - 120_000 },
      ] },
    } }));
  });
  await mockAuthedApp(page, { lang: 'zh' });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.locator('[data-testid="learning-mode-mistakes"]').click();
  await expect(page.locator('#mistakesPanel')).toBeVisible();
  await expect(page.locator('#mistakesList [data-mistake-empty]')).toHaveCount(0);
  await expect(page.locator('#mistakesList [data-mistake-id="arch-1"]')).toHaveCount(1);
  await expect(page.locator('#mistakesList [data-mistake-id="arch-2"]')).toHaveCount(1);
  /* A row without a topic groups under its session's title. */
  await expect(page.locator('#mistakesList [data-mistake-group]')).toHaveCount(2);
  await expect(page.locator('#mistakesList')).toContainText('积分');
  /* The sidebar badge counts the same cross-session list, not only the open session's. */
  await expect(page.locator('#mistakesTabBadge')).toHaveText('2');
});
