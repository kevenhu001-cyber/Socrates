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
  await expect(page.locator('.exam-form-hero')).toContainText('创建一份专注的练习考卷');
  await expect(page.locator('#examTopic')).toHaveValue('Linear algebra');
  await expect(page.locator('#examInstructions')).toHaveValue('Focus on eigenvalues');

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "examQuestions", value: [
      { type: 'fill-blank', q: 'A matrix with a nonzero determinant is ____.' },
    ] });
    window.stateStore.dispatch({ type: "state/set", key: "examAnswers", value: { 0: 'invertible' } });
    window.stateStore.dispatch({ type: "state/set", key: "examTopic", value: 'Linear algebra' });
  });
  await expect(page.locator('.exam-form-container')).toHaveCount(0);

  await expect(page.locator('.exam-q-num')).toContainText('题目 1 / 1');
  await expect(page.locator('.exam-q-type')).toHaveText('填空题');
  await expect(page.locator('.exam-q-fill-input')).toHaveValue('invertible');
  await expect(page.locator('.exam-q-fill-input')).toHaveAttribute('placeholder', '输入你的答案…');
  await expect(page.locator('#examViewFooter')).toContainText('提交批改');
  await page.locator('.exam-q-fill-input').fill('nonsingular');
  await expect.poll(() => page.evaluate(() => window.stateStore.read('examAnswers')[0])).toBe('nonsingular');

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "examSubmitted", value: true });
  });
  await expect(page.locator('#examViewReactBody .exam-results')).toBeVisible();
  await expect(page.locator('#examViewReactBody .exam-results [data-slot="card"]')).toHaveCount(2);
  await expect(page.locator('#examViewReactBody .exam-results [data-slot="input"]')).toHaveValue('nonsingular');
  await expect(page.locator('#examViewReactBody .exam-results [data-slot="input"]')).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: '新考试', exact: true })).toBeVisible();
});
