import { test, expect } from './_state-fixture.mjs';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* The transcript question chain was retired on 2026-11-16. The learning-mode
   capsule next to the composer is still the live RN-4 surface. */

const NODES = ['Limits', 'Derivatives', 'Applications', 'Pitfalls', 'Connections'];

async function setupTutor(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('socrates-theme', 'light');
    localStorage.setItem('socrates-lang', 'zh');
    localStorage.removeItem('socrates-learning-mode');
  });
  const streams = [];
  await mockAuthedApp(page, { lang: 'zh' });
  await page.route(
    /\/api\/(?:v2\/)?(?:minimax\/v1\/chat\/completions|chat)(?:\?|$)/,
    async (route) => {
      const body = route.request().postDataJSON();
      const curriculum = body.messages.some((message) =>
        String(message.content).includes('curriculum designer'),
      );
      const content = curriculum
        ? JSON.stringify(NODES)
        : JSON.stringify({
            q: 'Which statement describes your understanding?',
            knowledgePoint: 'Rate of change',
            opts: [
              { text: 'New to me', level: 'blank' },
              { text: 'Some gaps', level: 'fuzzy' },
              { text: 'Can explain it', level: 'internalized' },
              { text: 'Need examples', level: 'blank' },
            ],
          });
      await route.fulfill({ json: { choices: [{ message: { content } }] } });
    },
  );
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    streams.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({
        choices: [{ delta: { content: '导数描述的是函数在某一点附近的瞬时变化率。' } }],
      })}\n\ndata: [DONE]\n\n`,
    });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => window.__socratesLegacy?.profile?.setLang?.('zh'));
  return streams;
}

async function startLesson(page) {
  await page.locator('#topModeTutor').click();
  await page.locator('#composerRoot .rich-composer-editor').fill('为什么导数能表示变化率？');
  await page.locator('#composerPrimaryBtn').click();
  await expect(page.locator('#tutorExplorationDialog')).toBeVisible();
  await page.locator('.tutor-explore-skip').click();
  await expect(page.locator('#chatView')).toBeVisible();
}

test('conversation learning-mode menu opens inline', async ({ page }) => {
  await setupTutor(page);
  await startLesson(page);
  const trigger = page.locator('[data-testid="learning-mode-trigger"]');
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#learningModeBar [role="radio"]')).toHaveCount(5);
  await expect(page.locator('#learningModeBar [data-testid="learning-mode-recall"]')).toContainText(
    '生成回忆卡',
  );
  await expect(
    page.locator('#learningModeBar [data-testid="learning-mode-diagnose"]'),
  ).toContainText('开始理解检查');
  await page.locator('#learningModeBar [data-testid="learning-mode-think"]').click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#composerRoot .rich-composer-editor')).toHaveText('');

  /* RN-6: "Find gaps" in a session runs a fresh formal diagnostic. */
  await trigger.click();
  await page.locator('#learningModeBar [data-testid="learning-mode-diagnose"]').click();
  await expect(page.locator('#diagnosticView [data-diag-command="select"]').first()).toBeVisible();
});
