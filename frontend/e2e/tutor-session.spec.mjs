import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const NODES = ['Limits', 'Derivatives', 'Applications', 'Pitfalls', 'Connections'];
const LESSON = 'A derivative describes the instantaneous rate of change.';

async function setupTutor(page, { failDiagnostic = false, failCurriculum = false } = {}) {
  const streams = [];
  await mockAuthedApp(page, { lang: 'zh' });
  await page.route(/\/api\/(?:v2\/)?(?:minimax\/v1\/chat\/completions|chat)(?:\?|$)/, async (route) => {
    const body = route.request().postDataJSON();
    const curriculum = body.messages.some((message) => String(message.content).includes('curriculum designer'));
    const explaining = body.messages.some((message) => String(message.content).includes('RE-EXPLAIN'));
    const content = curriculum ? (failCurriculum ? 'invalid curriculum' : JSON.stringify(NODES)) : explaining ? 'A focused explanation of the derivative.' : failDiagnostic ? 'invalid question' : JSON.stringify({
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
  return streams;
}

async function openTutor(page) {
  await page.locator('#topModeTutor').click();
  await page.locator('#composerRoot .rich-composer-editor').fill('Explain derivatives');
  await page.locator('#composerPrimaryBtn').click();
  await expect(page.locator('#tutorExplorationDialog')).toBeVisible();
}

for (const width of [1440, 390]) {
  test(`tutor starts without diagnostics and accepts Chinese follow-ups at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const streams = await setupTutor(page);
    // A new lesson must not inherit the previous lesson's active node or counters.
    await page.evaluate(() => {
      window.stateStore.dispatch({ type: 'state/batch', patch: {
        currentNode: 4, totalQ: 80, practiceAttempts: 3, teachingStage: 'check',
      } });
    });
    await openTutor(page);
    await page.locator('.tutor-explore-skip').click();
    await expect(page.locator('#chatView')).toBeVisible();
    await expect(page.locator('#msgList .msg.assistant .msg-body').last()).toContainText(LESSON);
    const snapshot = await page.evaluate(() => ({
      nodes: window.stateStore.read('kbNodes'),
      plan: window.stateStore.read('teachingPlan'),
      currentNode: window.stateStore.read('currentNode'),
      totalQ: window.stateStore.read('totalQ'),
    }));
    expect(snapshot.nodes.map((node) => node.name)).toEqual(NODES);
    expect(snapshot.plan.subtopics).toHaveLength(5);
    expect(snapshot.currentNode).toBe(0);
    expect(snapshot.totalQ).toBe(1);
    expect(streams[0].mode).toBe('tutor');
    await page.locator('#composerRoot .rich-composer-editor').fill(
      '导数表示函数在某一点附近的瞬时变化率，可以通过割线斜率的极限来理解，它不是简单地把函数值除以自变量。',
    );
    await page.locator('#composerPrimaryBtn').click();
    await expect.poll(() => streams.length).toBe(2);
    await expect.poll(() => page.evaluate(() => window.stateStore.read('teachingStage'))).toBe('define');
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/tutor-session-${encodeURIComponent(width)}.png`, fullPage: true });
  });
}

test('seven-question diagnostics retain four choices and build a teaching plan', async ({ page }) => {
  const streams = await setupTutor(page);
  await openTutor(page);
  await page.locator('#tutorExploreCount').fill('7');
  await page.locator('.tutor-explore-start').click();
  await expect(page.locator('#diagnosticView [role="radio"]')).toHaveCount(4);
  expect(await page.evaluate(() => window.stateStore.read('diagQuestions').map((q) => q.nodeIdx)))
    .toEqual([0, 1, 2, 3, 4, 0, 1]);
  for (let index = 0; index < 7; index += 1) {
    await page.locator('#diagnosticView [data-diag-index="2"]').click();
    await page.locator(`[data-diag-command="${index === 6 ? 'finish' : 'next'}"]`).click();
  }
  expect(await page.evaluate(() => window.stateStore.read('kbNodes').map((node) => node.status)))
    .toEqual(['fuzzy', 'fuzzy', 'fuzzy', 'fuzzy', 'fuzzy']);
  await expect(page.locator('#diagnosticView')).toContainText('5 个维度有一定基础');
  await page.locator('[data-diag-command="proceed"]').click();
  await expect(page.locator('#msgList .msg.assistant .msg-body').last()).toContainText(LESSON);
  expect(streams).toHaveLength(1);
});

test('failed diagnostics can use built-in questions and continue teaching', async ({ page }) => {
  await setupTutor(page, { failDiagnostic: true });
  await openTutor(page);
  await page.locator('#tutorExploreCount').fill('1');
  await page.locator('.tutor-explore-start').click();
  await page.locator('[data-diag-command="builtin"]').click();
  await expect(page.locator('#diagnosticView [role="radio"]')).toHaveCount(4);
  await page.locator('[data-diag-command="skip"]').click();
  await page.locator('[data-diag-command="proceed"]').click();
  await expect(page.locator('#msgList .msg.assistant .msg-body').last()).toContainText(LESSON);
});

test('curriculum generation failure keeps a complete fallback plan instead of an empty lesson', async ({ page }) => {
  const streams = await setupTutor(page, { failCurriculum: true });
  await openTutor(page);
  await page.locator('.tutor-explore-skip').click();
  await expect(page.locator('#msgList .msg.assistant .msg-body').last()).toContainText(LESSON);
  expect(await page.evaluate(() => window.stateStore.read('kbNodes').length)).toBe(5);
  expect(await page.evaluate(() => window.stateStore.read('teachingPlan').subtopics.length)).toBe(5);
  expect(streams).toHaveLength(1);
});

test('late curriculum results from a cancelled lesson cannot overwrite a new lesson', async ({ page }) => {
  const streams = await setupTutor(page);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let firstRequest;
  await page.route(/\/api\/(?:v2\/)?minimax\/v1\/chat\/completions(?:\?|$)/, async (route) => {
    if (firstRequest) return route.fallback();
    firstRequest = route.request();
    await gate;
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(NODES.map((name) => `Old ${name}`)) } }] } });
  });
  await openTutor(page);
  await page.locator('.tutor-explore-skip').click();
  await expect.poll(() => Boolean(firstRequest)).toBe(true);
  await page.locator('[data-diag-command="cancel"]').click();
  await expect(page.locator('#topicSetup')).toBeVisible();
  await openTutor(page);
  await page.locator('.tutor-explore-skip').click();
  await expect(page.locator('#msgList .msg.assistant .msg-body').last()).toContainText(LESSON);
  const response = page.waitForResponse((value) => value.request() === firstRequest);
  release();
  await (await response).finished();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => window.stateStore.read('kbNodes').map((node) => node.name))).toEqual(NODES);
  await expect(page.locator('#chatView')).toBeVisible();
  expect(streams).toHaveLength(1);
});

test('stopping a tutor follow-up before content arrives does not create an error or count a question', async ({ page }) => {
  await setupTutor(page);
  await openTutor(page);
  await page.locator('.tutor-explore-skip').click();
  await expect(page.locator('#msgList .msg.assistant .msg-body').last()).toContainText(LESSON);
  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input, options = {}) => {
      if (!String(input).includes('/chat/stream')) return original(input, options);
      return Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          options.signal.addEventListener('abort', () => {
            window.__tutorStreamAborts = (window.__tutorStreamAborts || 0) + 1;
            controller.error(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        },
      }), { headers: { 'Content-Type': 'text/event-stream' } }));
    };
  });
  await page.locator('#composerRoot .rich-composer-editor').fill('Please explain that step again.');
  await page.locator('#composerPrimaryBtn').click();
  await expect(page.locator('#composerPrimaryBtn')).toHaveAttribute('data-stop', '1');
  await page.locator('#composerPrimaryBtn').click();
  await expect.poll(() => page.evaluate(() => window.__tutorStreamAborts || 0)).toBe(1);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(await page.evaluate(() => ({ error: window.stateStore.read('lastCallError'), total: window.stateStore.read('totalQ') })))
    .toEqual({ error: null, total: 1 });
  await expect(page.locator('#msgList')).not.toContainText('Stream returned no content');
});

test('stuck learners see actionable help and can choose to keep thinking without another model call', async ({ page }) => {
  const streams = await setupTutor(page);
  await openTutor(page);
  await page.locator('.tutor-explore-skip').click();
  await expect(page.locator('#msgList .msg.assistant .msg-body').last()).toContainText(LESSON);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.locator('#composerRoot .rich-composer-editor').fill('不知道');
    await page.locator('#composerPrimaryBtn').click();
    if (attempt < 2) await expect.poll(() => streams.length).toBe(attempt + 2);
    await expect(page.locator('#composerPrimaryBtn')).not.toHaveAttribute('data-stop', '1');
  }
  await expect(page.locator('[data-tutor-action]')).toHaveCount(2);
  await page.locator('[data-tutor-action="retry"]').click();
  await expect(page.locator('[data-tutor-action]')).toHaveCount(0);
  expect(streams).toHaveLength(3);
});

test('tutor help supports mistake saving, hints, explanations and another question', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const streams = await setupTutor(page);
  await openTutor(page);
  await page.locator('.tutor-explore-skip').click();
  await expect(page.locator('#msgList .msg.assistant .msg-body').last()).toContainText(LESSON);
  await page.evaluate(() => window.tutorSocratic.showFourOptionDialog());
  await expect(page.locator('[data-tutor-action]')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/tutor-help-actions.png', fullPage: true });
  const saved = page.waitForRequest((request) => /\/api\/(?:v2\/)?mistakes$/.test(new URL(request.url()).pathname) && request.method() === 'POST');
  await page.locator('[data-tutor-action="mistake"]').click();
  expect((await saved).postDataJSON()).toMatchObject({ questionContent: LESSON, source: 'practice' });
  await expect.poll(() => page.evaluate(() => window.stateStore.read('mistakes').length)).toBe(1);
  await expect(page.locator('[data-tutor-action]')).toHaveCount(0);
  await page.evaluate(() => window.tutorSocratic.showFourOptionDialog());
  await page.locator('[data-tutor-action="hint"]').click();
  await expect.poll(() => streams.length).toBe(2);
  await expect(page.locator('#composerPrimaryBtn')).not.toHaveAttribute('data-stop', '1');
  expect(await page.evaluate(() => window.stateStore.read('teachingStage'))).toBe('motivate');
  await page.evaluate(() => window.tutorSocratic.showExplainPrompt());
  await page.locator('[data-tutor-action="explain"]').click();
  await expect(page.locator('#msgList .msg.assistant .msg-body').last()).toContainText('A focused explanation');
  await expect.poll(() => page.evaluate(() => window.stateStore.read('explaining'))).toBe(false);
  await page.evaluate(() => window.tutorSocratic.showFourOptionDialog());
  await page.locator('[data-tutor-action="skip"]').click();
  await expect.poll(() => streams.length).toBe(3);
  expect(errors).toEqual([]);
});
