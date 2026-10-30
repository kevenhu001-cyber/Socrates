import { test, expect } from '@playwright/test';
import { gotoAndSettle, publishChatRuntime } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SOURCE = [
  '先看例题，再完成自测。',
  '<example><title>乘法示例</title><problem>2 × 3 = ?</problem><solution>2 × 3 = 6</solution></example>',
  '<quiz><q>2 + 2 = ?</q><o letter="A">4</o><o letter="B">5</o><correct>A</correct></quiz>',
  '<practice correct="42"><problem>6 × 7 = ?</problem><hint>可以分解为 6 × (5 + 2)。</hint></practice>',
].join('\n\n');

for (const { width, height, mode } of [{ width: 1440, height: 900, mode: 'light' }, { width: 390, height: 844, mode: 'dark' }]) {
  test(`inline tutor widgets retain feedback and reveal state at ${width} ${mode}`, async ({ page }) => {
    const errors = [], modelRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (/\/chat\/stream$/.test(new URL(request.url()).pathname)) modelRequests.push(request.url()); });
    await page.setViewportSize({ width, height });
    await page.addInitScript((mode) => localStorage.setItem('socrates-theme', mode), mode);
    await mockAuthedApp(page, { lang: 'zh' });
    await gotoAndSettle(page);
    await waitForAppShell(page);
    await page.evaluate((rawText) => {
      const message = { clientId: 'tutor-widgets-answer', role: 'assistant', type: 'assistant', _streamSettled: true, rawText };
      for (const [key, value] of Object.entries({ phase: 'chat', teachingStage: 'exercise', practiceAttempts: 2,
        currentSessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', messages: [message] })) {
        window.stateStore.dispatch({ type: 'state/set', key, value });
      }
      window.__testActivateMainView('chatView');
      document.body.dataset.conversationActive = 'true';
    }, SOURCE);
    await publishChatRuntime(page, { type: 'state-synced', reason: 'tutor-widget-regression' });

    const body = page.locator('.msg.assistant .msg-body');
    const example = body.locator('.inline-example');
    const quiz = body.locator('.inline-quiz');
    const practice = body.locator('.inline-practice');
    await expect(example).toHaveCount(1);
    await expect(quiz).toHaveCount(1);
    await expect(practice).toHaveCount(1);
    await expect(example.locator('.inline-example-solution')).toBeHidden();
    await example.locator('.inline-example-reveal').click();
    await expect(example.locator('.inline-example-solution')).toBeVisible();
    await quiz.locator('[data-letter="A"]').click();
    await expect(quiz.locator('.inline-quiz-feedback')).toHaveClass(/\bok\b/);
    await expect(quiz.locator('[data-letter="B"]')).toBeDisabled();
    await expect.poll(() => page.evaluate(() => [window.stateStore.read('teachingStage'), window.stateStore.read('practiceAttempts')])).toEqual(['check', 0]);
    await practice.locator('.inline-practice-hint-toggle').click();
    await expect(practice.locator('.inline-practice-hint')).toBeVisible();
    await practice.locator('.inline-practice-reveal').click();
    await expect(practice.locator('.inline-practice-feedback')).toHaveText('42');
    await expect(practice.locator('textarea')).toBeDisabled();
    await expect(practice.locator('.inline-practice-submit')).toBeDisabled();
    expect(modelRequests).toEqual([]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/warning-cleanup-2/${encodeURIComponent(width)}-${encodeURIComponent(mode)}-tutor.png` });
  });
}
