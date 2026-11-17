import { test, expect } from './_state-fixture.mjs';
import { prepareChatWorkbench, expectNoGlobalError } from './_chat-workbench.mjs';
const quiz = {
  id: 'quiz',
  type: 'learning',
  kind: 'quiz',
  q: 'Which expression equals $2^2$? “Choose one”.',
  options: [
    { letter: 'A', text: '$4$', explanation: 'Two squared is four.' },
    { letter: 'B', text: '$5$', explanation: 'One too many; “five” is incorrect.' },
  ],
  correct: 'A',
};
const message = (nodes) => ({
  clientId: 'native-learning',
  role: 'assistant',
  type: 'assistant',
  rawText: `Read the question.\n\n\`\`\`socrates-ui\n${nodes.map((node) => JSON.stringify(node)).join('\n')}\n\`\`\`\n\nThe surrounding explanation remains readable.`,
});

for (const theme of ['light', 'dark'])
  for (const mobile of [false, true]) {
    test(`native learning cards grade with hidden explanations and typeset math (${theme}, ${mobile ? 'phone' : 'desktop'})`, async ({
      page,
    }) => {
      await page.addInitScript((theme) => localStorage.setItem('socrates-theme', theme), theme);
      const definition = {
        id: 'definition',
        type: 'knowledge-card',
        title: '导数',
        content: '瞬时变化率为 $f\u2032(x)$。',
      };
      await prepareChatWorkbench(page, {
        lang: 'en',
        viewport: mobile ? { width: 390, height: 1000 } : { width: 1280, height: 1000 },
        messages: [message([definition, quiz])],
      });
      await expect(page.locator('[data-learning-kind="definition"]')).toContainText('导数');
      const card = page.locator('[data-learning-kind="quiz"]');
      await expect(card.locator('[data-letter]')).toHaveCount(2);
      await expect(card.locator('[data-part="quiz-q"] .katex')).toBeVisible();
      await expect(card.getByText('Two squared is four.', { exact: true })).toHaveCount(0);
      await card.locator('[data-letter="B"]').click();
      await card.getByTestId('quiz-submit').click();
      await expect(card.getByTestId('quiz-feedback')).toHaveAttribute('data-verdict', 'incorrect');
      await expect(card.getByTestId('quiz-option-explanation-B')).toContainText('five');
      await card.getByTestId('quiz-retry').click();
      await card.locator('[data-letter="A"]').click();
      await card.getByTestId('quiz-submit').click();
      await expect(card.getByTestId('quiz-feedback')).toHaveAttribute('data-verdict', 'correct');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });
      await card.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      await card.screenshot({
        path: `test-results/learning-${encodeURIComponent(theme)}-${encodeURIComponent(mobile ? 'phone' : 'desktop')}.png`,
      });
      await expectNoGlobalError(page);
    });
  }

test('question aliases with options become a multi-choice quiz, and ungraded questions stay recorded', async ({
  page,
}) => {
  const multi = {
    id: 'multi',
    type: 'question',
    question: 'Pick the odd numbers',
    choices: { A: '1', B: '2', C: '3' },
    answer: ['A', 'C'],
  };
  const survey = {
    ...quiz,
    id: 'survey',
    q: 'Your preference?',
    graded: false,
    correct: undefined,
  };
  await prepareChatWorkbench(page, { lang: 'en', messages: [message([multi, survey])] });
  const card = page.locator('[data-intui-id="multi"]');
  await expect(card.getByRole('checkbox')).toHaveCount(3);
  await card.locator('[data-letter="A"]').click();
  await card.locator('[data-letter="C"]').click();
  await card.getByTestId('quiz-submit').click();
  await expect(card.getByTestId('quiz-feedback')).toHaveAttribute('data-verdict', 'correct');
  const ungraded = page.locator('[data-intui-id="survey"]');
  await ungraded.locator('[data-letter="B"]').click();
  await ungraded.getByTestId('quiz-submit').click();
  await expect(ungraded.getByTestId('quiz-feedback')).toHaveAttribute('data-verdict', 'recorded');
  await expectNoGlobalError(page);
});

test('a malformed historical card stays isolated and never exposes hidden answers', async ({
  page,
}) => {
  const document = {
    version: 1,
    nodes: [
      { id: 'invalid', type: 'learning', kind: 'flashcard', front: 'Question with no answer yet' },
      {
        id: 'bad-key',
        type: 'learning',
        kind: 'quiz',
        q: 'Incomplete quiz',
        options: quiz.options,
        correct: 'E',
        explanation: 'SECRET ANSWER',
      },
      {
        id: 'healthy',
        type: 'definition',
        term: 'Still readable',
        body: 'This valid card survives.',
      },
    ],
  };
  await prepareChatWorkbench(page, {
    messages: [
      { ...message([]), rawText: '```socrates-ui\n' + JSON.stringify(document) + '\n```' },
    ],
  });
  await expect(page.locator('[data-learning-fallback]')).toHaveCount(2);
  await expect(page.getByText('This valid card survives.', { exact: true })).toBeVisible();
  await expect(page.getByText('SECRET ANSWER', { exact: true })).toHaveCount(0);
  /* A broken quiz keeps its choices readable; the key and the explanations stay hidden. */
  const broken = page.locator('[data-learning-fallback="bad-key"]');
  await expect(broken.locator('[data-learning-option]')).toHaveCount(2);
  await expect(broken.locator('[data-learning-option="A"]')).toContainText('4');
  await expect(broken.locator('[data-learning-option="B"]')).toContainText('5');
  await expect(broken).not.toContainText('Two squared is four.');
  await expect(page.locator('.error-boundary-fallback')).toHaveCount(0);
  await expectNoGlobalError(page);
});

test('flashcard and written question use existing learning controls', async ({ page }) => {
  const flash = {
    id: 'flash',
    type: 'learning',
    kind: 'flashcard',
    front: 'What is inertia?',
    back: 'Resistance to a change of velocity.',
  };
  const practice = {
    id: 'practice',
    type: 'learning',
    kind: 'practice',
    problem: 'Explain conservation of energy.',
    hint: 'Consider a closed system.',
  };
  await prepareChatWorkbench(page, { lang: 'en', messages: [message([flash, practice])] });
  const card = page.locator('[data-intui-id="flash"]');
  await expect(card.getByText(flash.back, { exact: true })).toHaveCount(0);
  await card.getByTestId('flashcard-flip').click();
  await expect(card.getByText(flash.back, { exact: true })).toBeVisible();
  await expect(page.getByTestId('practice-input')).toBeVisible();
  await page.getByTestId('practice-input').fill('Energy is transferred between forms.');
  await expect(page.getByTestId('practice-input')).toHaveValue(
    'Energy is transferred between forms.',
  );
  await expectNoGlobalError(page);
});

test('native tool commits and patches enable grading after streaming completes', async ({
  page,
}) => {
  await prepareChatWorkbench(page, { lang: 'en' });
  await page.evaluate(async (node) => {
    const ctl = await window.addStreamingMessage({ userPrompt: 'Give me a question' });
    window.__learningCtl = ctl;
    let seq = 0;
    window.__learningEvent = (payload) =>
      ctl.recordTurnEvent({
        version: 1,
        turnId: 'learning-turn',
        seq: ++seq,
        at: Date.now(),
        ...payload,
      });
    window.__learningEvent({
      type: 'ui.begin',
      surfaceId: 'learning-tool',
      toolCallId: 'learning-tool',
      textOffset: 0,
    });
    window.__learningEvent({ type: 'ui.add', surfaceId: 'learning-tool', node });
    ctl.recordToolUse({
      id: 'learning-tool',
      name: 'render_intelligent_ui',
      input: { version: 1, nodes: [node] },
    });
    ctl.append('Select an answer.');
  }, quiz);
  const card = page.locator('[data-learning-kind="quiz"]');
  await expect(card.locator('[data-letter="A"]')).toHaveAttribute('aria-disabled', 'true');
  await page.evaluate(() =>
    window.__learningEvent({
      type: 'ui.patch',
      surfaceId: 'learning-tool',
      nodeId: 'quiz',
      props: { q: 'Updated question: which expression equals $2^2$?' },
    }),
  );
  await expect(card).toContainText('Updated question');
  await page.evaluate((node) => {
    window.__learningEvent({
      type: 'ui.commit',
      surfaceId: 'learning-tool',
      nodes: [{ ...node, q: 'Updated question: which expression equals $2^2$?' }],
    });
    window.__learningCtl.recordToolResult({
      id: 'learning-tool',
      name: 'render_intelligent_ui',
      ok: true,
      status: 'completed',
      output: 'Question rendered',
    });
    window.__learningCtl.finish();
  }, quiz);
  await card.locator('[data-letter="A"]').click();
  await card.getByTestId('quiz-submit').click();
  await expect(card.getByTestId('quiz-feedback')).toHaveAttribute('data-verdict', 'correct');
  const saved = await page.evaluate(() =>
    JSON.parse(JSON.stringify(window.__socratesTestState.session().messages)),
  );
  await prepareChatWorkbench(page, { lang: 'en', messages: saved });
  await expect(page.locator('[data-learning-kind="quiz"]')).toHaveCount(1);
  await expect(page.locator('[data-learning-kind="quiz"] [data-letter]')).toHaveCount(2);
  await expectNoGlobalError(page);
});

test('learning content follows prose size and native tables typeset every field', async ({
  page,
}) => {
  const nodes = [
    {
      id: 'definition-size',
      type: 'learning',
      kind: 'definition',
      term: 'Derivative $f\u2032(x)$',
      body: 'The rate is $x^2$.',
    },
    {
      id: 'formula-table',
      type: 'table',
      caption: 'Values $x^2$',
      columns: [
        { key: 'x', label: '$x$' },
        { key: 'y', label: '$y$' },
      ],
      rows: [
        { x: '$1$', y: '$\\frac{1}{2}$' },
        { x: '$x$', y: '$a_1+a_2+a_3+a_4+a_5+a_6+a_7+a_8+a_9+a_{10}+a_{11}+a_{12}$' },
      ],
    },
  ];
  await prepareChatWorkbench(page, { lang: 'en', messages: [message(nodes)] });
  const table = page.locator('[data-intui-id="formula-table"]');
  await expect(table.locator('caption .katex')).toBeVisible();
  await expect(table.locator('th .katex')).toHaveCount(2);
  await expect(table.locator('td .katex')).toHaveCount(4);
  expect(
    await table
      .locator('td')
      .last()
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  const sizes = await page.locator('[data-part="definition-term"]').evaluate((el) => ({
    term: getComputedStyle(el).fontSize,
    body: getComputedStyle(el.closest('.msg-body')).fontSize,
    content: getComputedStyle(
      el.closest('[data-scaffold]').querySelector('[data-part="definition-body"]'),
    ).fontSize,
  }));
  expect(sizes.term).toBe(sizes.body);
  expect(sizes.content).toBe(sizes.body);
  await table.screenshot({ path: 'test-results/compact-formula-table.png' });
  await expectNoGlobalError(page);
});

test('streaming table keeps rows and DOM through completion', async ({ page }) => {
  await prepareChatWorkbench(page, { lang: 'en' });
  await page.evaluate(async () => {
    window.__compactTableCtl = await window.addStreamingMessage({ userPrompt: 'Show a table' });
    window.__compactTableCtl.append(
      'Values:\n\n| Symbol | Value |\n| :--- | ---: |\n| $x$ | $1$ |\n',
    );
  });
  const table = page.locator('.msg.assistant .ds-table');
  await expect(table).toHaveCount(1);
  await expect(table.locator('td')).toHaveCount(2);
  await table.evaluate((el) => {
    window.__retainedTable = el;
    window.__retainedCell = el.querySelector('td');
  });
  await page.evaluate(() => window.__compactTableCtl.append('| $y$ | $2$ |\n'));
  await expect(table.locator('td')).toHaveCount(4);
  await page.evaluate(() => {
    window.__compactTableCtl.append('\nDone.');
    window.__compactTableCtl.finish();
  });
  await expect(table.locator('td .katex')).toHaveCount(4);
  expect(
    await table.evaluate(
      (el) => el === window.__retainedTable && el.querySelector('td') === window.__retainedCell,
    ),
  ).toBe(true);
  await expect(page.locator('.table-stream-placeholder')).toHaveCount(0);
  await table.screenshot({ path: 'test-results/streaming-formula-table.png' });
  await expectNoGlobalError(page);
});

test('native formula choices stay readable when selected', async ({ page }) => {
  await prepareChatWorkbench(page, {
    lang: 'en',
    messages: [
      message([
        {
          id: 'formula-choice',
          type: 'choice',
          bind: 'answer',
          label: 'Choose $x$',
          options: [
            { value: 'a', label: '$x^2$' },
            { value: 'b', label: '$x^3$' },
          ],
        },
      ]),
    ],
  });
  const choice = page.locator('[data-intui-id="formula-choice"]');
  await expect(choice.locator('.katex')).toHaveCount(3);
  await choice.getByRole('button').first().click();
  const selected = choice.locator('[aria-pressed="true"]');
  expect(
    await selected.evaluate(
      (el) =>
        getComputedStyle(el.querySelector('.katex .mord')).color === getComputedStyle(el).color,
    ),
  ).toBe(true);
});
