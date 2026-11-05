import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
});

test('starting a new chat from exam mode reveals the topic composer', async ({ page }) => {
  await page.evaluate(() => window.__socratesLegacy.navigation.openNav('exam'));
  await expect(page.locator('#examView')).toBeVisible();
  await expect(page.locator('#examViewReactRoot #examViewBody')).toBeVisible();

  await page.locator('#newChatBtn').click();
  await expect(page.locator('#confirmDialog')).toBeVisible();
  await page.locator('#confirmOkBtn').click();

  await expect(page.locator('#examView')).toBeHidden();
  await expect(page.locator('#mainInner')).not.toHaveClass(/hidden/);
  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect(page.locator('#composerRoot .rich-composer-editor')).toBeVisible();
});

test('exam UI follows language changes without losing form values or answers', async ({ page }) => {
  await page.evaluate(() => window.__socratesLegacy.navigation.openNav('exam'));
  expect(await page.evaluate(() => '__loadExamModule' in window)).toBe(false);
  await page.locator('#examTopic').fill('Linear algebra');
  await page.locator('#examInstructions').fill('Focus on eigenvalues');

  await page.evaluate(() => window.__socratesLegacy.profile.setLang('zh'));
  await expect(page.locator('[data-exam-hero]')).toContainText('创建一份专注的练习考卷');
  await expect(page.locator('#examTopic')).toHaveValue('Linear algebra');
  await expect(page.locator('#examInstructions')).toHaveValue('Focus on eigenvalues');

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "examQuestions", value: [
      { type: 'fill-blank', q: 'A matrix with a nonzero determinant is ____.' },
    ] });
    window.stateStore.dispatch({ type: "state/set", key: "examAnswers", value: { 0: 'invertible' } });
    window.stateStore.dispatch({ type: "state/set", key: "examTopic", value: 'Linear algebra' });
  });
  await expect(page.locator('[data-exam-hero]')).toHaveCount(0);

  await expect(page.locator('[data-exam-q-num]')).toContainText('题目 1 / 1');
  await expect(page.locator('[data-exam-q-type]')).toHaveText('填空题');
  await expect(page.locator('[data-exam-answer="0"]')).toHaveValue('invertible');
  await expect(page.locator('[data-exam-answer="0"]')).toHaveAttribute('placeholder', '输入你的答案…');
  await expect(page.locator('#examViewFooter')).toContainText('提交批改');
  await page.locator('[data-exam-answer="0"]').fill('nonsingular');
  await expect.poll(() => page.evaluate(() => window.stateStore.read('examAnswers')[0])).toBe('nonsingular');

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "examSubmitted", value: true });
  });
  await expect(page.locator('#examViewReactBody [data-exam-results]')).toBeVisible();
  await expect(page.locator('[data-exam-score]')).toBeVisible();
  await expect(page.locator('[data-exam-result-card]')).toHaveCount(1);
  await expect(page.locator('[data-exam-answer-display]')).toHaveText('nonsingular');
  await expect(page.getByRole('button', { name: '新考试', exact: true })).toBeVisible();
});

test('submitting with a missing answer scrolls to the first unanswered card', async ({ page }) => {
  await page.evaluate(() => window.__socratesLegacy.navigation.openNav('exam'));
  await page.evaluate(() => {
    const questions = Array.from({ length: 8 }, (_, index) => ({
      type: 'fill-blank',
      q: `Question ${index + 1} stem`,
    }));
    const answers = {};
    for (let index = 0; index < 5; index += 1) answers[index] = `answer ${index + 1}`;
    window.stateStore.dispatch({ type: 'state/set', key: 'examQuestions', value: questions });
    window.stateStore.dispatch({ type: 'state/set', key: 'examAnswers', value: answers });
    window.stateStore.dispatch({ type: 'state/set', key: 'examTopic', value: 'Scroll check' });
  });

  await expect(page.locator('[data-exam-q="7"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Submit for Grading' }).click();

  await expect.poll(() => page.evaluate(() => !!window.stateStore.read('examSubmitted'))).toBe(false);
  await expect(page.locator('[data-exam-q="5"]')).toBeInViewport();
});
