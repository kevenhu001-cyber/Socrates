import { test, expect } from '@playwright/test';
import { gotoAndSettle, publishChatRuntime } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SOURCE = [
  '先看例题，再完成自测。',
  '<definition><term>函数定义</term><body>输入对应唯一输出。</body></definition>',
  '<step n="1">整理条件</step><step n="2">写出关系式</step>',
  '<proof><title>证明</title><body>由定义直接得出。</body></proof>',
  '<derivation><title>推导</title><body>\n  x + 1\n= 2\n</body></derivation>',
  '<key-point>核心结论：**答案为 2**。</key-point>',
  '<example><title>乘法示例</title><problem>2 × 3 = ?</problem><solution>2 × 3 = 6</solution></example>',
  '<quiz><q>2 + 2 = ?</q><o letter="A">4</o><o letter="B">5</o><correct>A</correct></quiz>',
  '<practice correct="42"><problem>6 × 7 = ?</problem><hint>可以分解为 6 × (5 + 2)。</hint></practice>',
].join('\n\n');

/** One streamed assistant turn, as the chat endpoint delivers it. */
function streamBody(text) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
}

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
    const card = (kind) => body.locator(`.sc-host[data-scaffold="${kind}"]`);
    const example = card('example');
    const definition = card('definition');
    const steps = card('step');
    const proof = card('proof');
    const derivation = card('derivation');
    const keyPoint = card('key-point');
    const quiz = card('quiz');
    const practice = card('practice');

    await expect(definition.locator('[data-part="definition-term"]')).toHaveText('函数定义');
    await expect(definition.locator('[data-part="definition-body"]')).toContainText('输入对应唯一输出');
    await expect(steps.locator('[data-part="step-step"]')).toHaveCount(2);
    await steps.getByTestId('step-step-mode').click();
    await expect(steps.locator('[data-part="step-step"]')).toHaveCount(1);
    await steps.getByTestId('step-next').click();
    await expect(steps.locator('[data-part="step-step"]')).toHaveCount(2);
    await expect(proof.locator('[data-part="proof-body"]')).toContainText('由定义直接得出');
    await expect(proof.getByTestId('proof-qed')).toBeVisible();
    await expect(derivation.locator('[data-part="derivation-step"]')).toHaveCount(2);
    await expect(derivation.locator('[data-part="derivation-step"]').first()).toContainText('x + 1');
    await expect(keyPoint.getByText('要点', { exact: true })).toBeVisible();
    await expect(keyPoint.locator('[data-part="key-point-body"]')).toContainText('答案为 2');
    await expect(body.locator('.sc-live')).toHaveCount(0);

    await expect(example.locator('[data-part="example-solution"]')).toHaveCount(0);
    await example.getByTestId('example-solution-toggle').click();
    await expect(example.locator('[data-part="example-solution"]')).toBeVisible();
    await quiz.locator('[data-letter="A"]').click();
    await quiz.getByTestId('quiz-submit').click();
    await expect(quiz.getByTestId('quiz-feedback')).toHaveAttribute('data-verdict', 'correct');
    await expect(quiz.locator('[data-letter="B"]')).toBeDisabled();

    await practice.getByTestId('hint-next').click();
    await expect(practice.locator('[data-part="hint"]')).toBeVisible();
    await practice.getByTestId('practice-reveal').click();
    await expect(practice.getByTestId('practice-feedback')).toHaveText('42');
    await expect(practice.locator('textarea')).not.toBeEditable();
    await expect(practice.getByTestId('practice-submit')).toBeDisabled();
    expect(modelRequests).toEqual([]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/warning-cleanup-2/${encodeURIComponent(width)}-${encodeURIComponent(mode)}-tutor.png` });
  });
}

test('an unsupported algebraic form is sent for tutor review, not locally marked wrong', async ({ page }) => {
  const streams = [];
  page.on('request', (request) => {
    if (/\/chat\/stream$/.test(new URL(request.url()).pathname)) streams.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('socrates-theme', 'light'));
  await mockAuthedApp(page, { lang: 'zh' });
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    await route.fulfill({ contentType: 'text/event-stream', body: streamBody('我们再检查方程的解集。') });
  });
  await gotoAndSettle(page);
  await waitForAppShell(page);
  await page.locator('#topModeTutor').click();
  await page.evaluate(() => {
    const message = {
      clientId: 'ambiguous-practice-answer', role: 'assistant', type: 'assistant', _streamSettled: true,
      rawText: '<practice correct="x=2"><problem>方程 $x^2=4$ 的解集是什么？</problem></practice>',
    };
    window.stateStore.dispatch({ type: 'state/batch', patch: {
      phase: 'chat', currentSessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      teachingStage: 'exercise', currentNode: 0, kbNodes: [{ name: 'Quadratic equations', status: 'fuzzy' }],
      messages: [message], mistakes: [],
    } });
    window.__testActivateMainView('chatView');
    document.body.dataset.conversationActive = 'true';
  });
  await publishChatRuntime(page, { type: 'state-synced', reason: 'practice-unverified-fixture' });
  const practice = page.locator('.msg.assistant .sc-host[data-scaffold="practice"]');
  await practice.locator('textarea').fill('x^2=4');
  await practice.getByTestId('practice-submit').click();
  await expect(practice.getByTestId('practice-feedback')).toHaveAttribute('data-state', 'recorded');
  await expect(practice.getByTestId('practice-feedback')).toContainText('已发送，等待 AI 点评。');
  await expect.poll(() => streams.length).toBe(1);
  expect(await page.evaluate(() => window.stateStore.read('mistakes'))).toEqual([]);
});


test('widget scheduling retains a late slot without remounting an earlier quiz', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page);
  await waitForAppShell(page);
  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
    const host = document.createElement('div');
    host.id = 'late-widget-fixture';
    const source = '<quiz><q>First question</q><o letter="A">Yes</o><o letter="B">No</o><correct>A</correct></quiz>\n\n<example><problem>Late problem</problem><solution>Late solution</solution></example>';
    host.innerHTML = window.renderAssistantHTML(source);
    const late = host.querySelector('.example-slot');
    late.remove();
    document.getElementById('chatView').appendChild(host);
    window.__lateWidgetFixture = { host, late };
  });
  const host = page.locator('#late-widget-fixture');
  await expect(host.locator('[data-part="quiz-q"]')).toHaveText('First question');
  await host.locator('[data-letter="A"]').click();
  // The choice mutates the first card while the second slot is still absent.
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const { host, late } = window.__lateWidgetFixture;
    host.appendChild(late);
  });
  await expect(host.locator('[data-part="example-problem"]')).toHaveText('Late problem');
  await host.getByTestId('quiz-submit').click();
  await expect(host.getByTestId('quiz-feedback')).toHaveAttribute('data-verdict', 'correct');
});
