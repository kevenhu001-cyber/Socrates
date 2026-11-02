import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* RN-4: question chain + learning modes (packages/ui/src/think).
   Set RN4_SHOTS=<dir> to also write the review screenshots. */
const SHOTS = process.env.RN4_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

async function shot(locator, name) {
  if (!SHOTS) return;
  await locator.page().mouse.move(0, 0);
  await locator.page().waitForTimeout(450);
  await locator.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' });
}

const NODES = ['Limits', 'Derivatives', 'Applications', 'Pitfalls', 'Connections'];
const LESSON = '导数描述的是函数在某一点附近的瞬时变化率。你觉得「瞬时」这个词在这里意味着什么？';

async function setupTutor(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('socrates-theme', 'light');
    localStorage.setItem('socrates-lang', 'zh');
    localStorage.removeItem('socrates-learning-mode');
  });
  const streams = [];
  await mockAuthedApp(page, { lang: 'zh' });
  await page.route(/\/api\/(?:v2\/)?(?:minimax\/v1\/chat\/completions|chat)(?:\?|$)/, async (route) => {
    const body = route.request().postDataJSON();
    const curriculum = body.messages.some((message) => String(message.content).includes('curriculum designer'));
    const content = curriculum ? JSON.stringify(NODES) : JSON.stringify({
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
  });
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    streams.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ choices: [{ delta: { content: LESSON } }] })}\n\ndata: [DONE]\n\n`,
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

const chain = (page) => page.locator('[data-testid="question-chain"]');
const nextQuestions = (page) => page.locator('[data-testid^="question-chain-next-"]');

test('home learning modes: nothing selected in chat, choosing one switches to tutor and pre-fills', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setupTutor(page, 1440);
  const modes = page.locator('[data-testid="home-learning-modes"]');
  await expect(modes).toBeVisible();
  await expect(page.locator('[data-testid^="learning-mode-"][role="radio"]')).toHaveCount(5);
  await expect(page.locator('[data-testid^="learning-mode-"][aria-checked="true"]')).toHaveCount(0);
  /* Header Chat / Tutor switch is unchanged. */
  await expect(page.locator('#topModeChat')).toBeVisible();

  const editor = page.locator('#composerRoot .rich-composer-editor');
  await page.locator('[data-testid="learning-mode-recall"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'tutor');
  await expect(page.locator('[data-testid="learning-mode-recall"]')).toHaveAttribute('aria-checked', 'true');
  await expect(editor).toContainText('知识卡片');
  await expect(page.locator('[data-testid="learning-mode-hint"]')).toContainText('知识卡片');
  const setup = page.locator('#topicSetup');
  await shot(setup, 'home-mode-recall');

  /* Arrow keys move focus only; selection (and its action) waits for Enter. */
  await page.locator('[data-testid="learning-mode-recall"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-testid="learning-mode-connect"]')).toBeFocused();
  await expect(page.locator('[data-testid="learning-mode-recall"]')).toHaveAttribute('aria-checked', 'true');

  await editor.fill('');
  await page.locator('[data-testid="learning-mode-connect"]').click();
  await expect(editor).toContainText('联系');
  await shot(setup, 'home-mode-connect');

  await editor.fill('');
  await page.locator('[data-testid="learning-mode-diagnose"]').click();
  await expect(editor).toContainText('诊断');
  await shot(setup, 'home-mode-diagnose');

  await editor.fill('');
  await page.locator('[data-testid="learning-mode-think"]').click();
  await expect(editor).toHaveText('');
  await shot(setup, 'home-mode-think');

  await page.locator('[data-testid="learning-mode-mistakes"]').click();
  await expect(page.locator('#mistakesPanel')).toBeVisible();
  await shot(page.locator('#appShell'), 'home-mode-mistakes');
  expect(errors).toEqual([]);
});

for (const width of [1440, 390]) {
  test(`question chain grows as the learner follows questions at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const streams = await setupTutor(page, width);
    await startLesson(page);
    await expect(chain(page)).toBeVisible();
    await expect(page.locator('[data-testid="question-chain-current"]')).toContainText('为什么导数能表示变化率');
    await expect(nextQuestions(page)).toHaveCount(3);
    const bar = page.locator('#chatInputBar');
    if (width === 1440) await shot(bar, 'chain-initial');

    const first = await nextQuestions(page).first().innerText();
    const before = streams.length;
    await nextQuestions(page).first().click();
    await expect.poll(() => streams.length).toBe(before + 1);
    await expect(chain(page)).toHaveAttribute('data-steps', '2');
    await expect(page.locator('[data-testid="question-chain-current"]')).toContainText(first.replace('→', '').trim());
    /* A question already on the chain is not offered again. */
    await expect(nextQuestions(page)).toHaveCount(2);

    await nextQuestions(page).nth(1).click();
    await expect.poll(() => streams.length).toBe(before + 2);
    await expect(chain(page)).toHaveAttribute('data-steps', '3');
    await expect(page.locator('[data-testid="question-chain-walked-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="question-chain-walked-2"]')).toBeVisible();
    await expect(nextQuestions(page)).toHaveCount(1);
    await shot(bar, width === 1440 ? 'chain-two-steps' : 'mobile-390-chain-two-steps');
    expect(errors).toEqual([]);
  });
}

test('conversation learning-mode menu opens inline and keeps the chain', async ({ page }) => {
  await setupTutor(page, 1440);
  await startLesson(page);
  const trigger = page.locator('[data-testid="learning-mode-trigger"]');
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#learningModeBar [role="radio"]')).toHaveCount(5);
  await shot(page.locator('#chatInputBar'), 'session-modes-open');
  await page.locator('#learningModeBar [data-testid="learning-mode-diagnose"]').click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#composerRoot .rich-composer-editor')).toContainText('诊断题');
  await expect(chain(page)).toBeVisible();
});

test('reduced motion: a new step joins the chain in place', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setupTutor(page, 1440);
  await startLesson(page);
  await nextQuestions(page).first().click();
  await expect(chain(page)).toHaveAttribute('data-steps', '2');
  const opacity = await page.locator('[data-testid="question-chain-current"]').evaluate((node) => getComputedStyle(node).opacity);
  expect(opacity).toBe('1');
});

test('home learning modes at 390px scroll sideways above the composer', async ({ page }) => {
  await setupTutor(page, 390);
  await page.locator('#topModeTutor').click();
  const modes = page.locator('[data-testid="home-learning-modes"]');
  await expect(modes).toBeVisible();
  await page.locator('[data-testid="learning-mode-think"]').click();
  await expect(page.locator('[data-testid="learning-mode-think"]')).toHaveAttribute('aria-checked', 'true');
  await shot(page.locator('#topicSetup'), 'mobile-390-home-modes');
});
