import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* RN-6: every piece of learning content comes from the model. The model is
   mocked here; what is asserted is that the UI shows exactly what the model
   wrote (and nothing fixed in its place), and that each request names its
   learning mode. Set RN6_SHOTS=1 to also write review screenshots
   (to test-results/rn6-shots/). */
const SHOTS = Boolean(process.env.RN6_SHOTS);

async function shot(locator, name, { tall = false } = {}) {
  if (!SHOTS) return;
  /* A tall reply would sit partly under the composer at 900px. */
  if (tall) await locator.page().setViewportSize({ width: 1440, height: 1800 });
  await locator.page().mouse.move(0, 0);
  await locator.page().waitForTimeout(450);
  await locator.screenshot({ path: `test-results/rn6-shots/${encodeURIComponent(name)}.png`, animations: 'disabled' });
  if (tall) await locator.page().setViewportSize({ width: 1440, height: 900 });
}

const NEXT = ['如果函数在这一点不连续，导数还存在吗？', '平均变化率和瞬时变化率差在哪一步？'];
const LESSON = [
  '导数描述的是函数在某一点附近的**瞬时变化率**：把区间不断缩小，平均变化率的极限就是导数。',
  '<quiz><q>$f(x)=x^2$ 在 $x=1$ 处的导数是？</q><o letter="A">2</o><o letter="B">1</o><correct>A</correct></quiz>',
  `<next-questions>${JSON.stringify(NEXT)}</next-questions>`,
].join('\n\n');
const RECALL = [
  '先别往回翻，试着回想：',
  '<flashcard><front>导数的定义是什么？</front><back>平均变化率在区间长度趋于 0 时的极限。</back></flashcard>',
  '<flashcard><front>为什么可导一定连续？</front><back>可导意味着增量比有极限，分子必须趋于 0。</back></flashcard>',
  '<flashcard><front>$x^2$ 在 1 处的切线斜率？</front><back>2。</back></flashcard>',
  '<next-questions>["连续但不可导的例子有哪些？","切线斜率和导数是一回事吗？"]</next-questions>',
].join('\n\n');
const PRACTICE = '针对「极限的定义」来一道：\n\n<practice correct="0"><problem>求 $\\lim_{x\\to 0} x\\sin(1/x)$。</problem></practice>\n\n<next-questions>["夹逼定理怎么用在这里？","为什么 sin(1/x) 本身没有极限？"]</next-questions>';
const NODES = ['极限的定义', '导数与变化率', '求导法则的应用', '可导与连续的误区', '微分的几何意义'];
const CONCEPTS = {
  nodes: [
    { name: '极限的定义', definition: '当自变量无限接近某点时，函数值无限接近的那个确定的数。' },
    { name: '导数与变化率', definition: '函数增量与自变量增量之比在增量趋于 0 时的极限。' },
    { name: '求导法则的应用', definition: '用和差积商与链式法则，把复杂函数的导数化成基本导数。' },
  ],
  links: [
    { from: '极限的定义', to: '导数与变化率', relation: '定义的基础', why: '导数本身就是一个极限，没有极限就无法说清“瞬时”。' },
    { from: '可导与连续的误区', to: '导数与变化率', relation: '辨析', why: '可导一定连续，反之不成立，这正是导数定义里分子趋于 0 的推论。' },
  ],
};
const REFRESHED = {
  nodes: [{ name: '可导与连续的误区', definition: '把“连续”误当成“可导”的充分条件；|x| 在 0 处就是反例。' }],
  links: [
    ...CONCEPTS.links,
    { from: '微分的几何意义', to: '导数与变化率', relation: '几何解释', why: '导数是切线斜率，微分是沿切线的近似增量。' },
  ],
};
const INSIGHT = {
  summary: '你对极限有直觉，但把“连续”和“可导”混为一谈。',
  nextStep: '先从导数的极限定义补起，用 |x| 在 0 处的例子检验“连续是否推出可导”。',
  gaps: [{ name: '可导与连续的误区', reason: '你选了“连续就可导”，说明还没区分这两个条件的方向。' }],
};
/* The mistake card is plain text, so the analysis prompt asks for plain math notation. */
const ANALYSIS = { whyWrong: '你把 x² 的导数当成了 x，漏掉了幂次带下来的系数 2。', correctApproach: '用幂函数求导 (xⁿ)′ = n·xⁿ⁻¹，得 2x，再代入 x = 1 得 2。' };
const MISTAKE_NEXT = '为什么幂次会被“带下来”，而不是直接去掉？';

function streamBody(text) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
}

async function setupTutor(page, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('socrates-theme', 'light');
    localStorage.setItem('socrates-lang', 'zh');
    localStorage.removeItem('socrates-learning-mode');
  });
  const seen = { streams: [], calls: [], reply: null };
  await mockAuthedApp(page, { lang: 'zh' });
  await page.route(/\/api\/(?:v2\/)?(?:minimax\/v1\/chat\/completions|chat)(?:\?|$)/, async (route) => {
    const body = route.request().postDataJSON();
    const system = String(body.messages.find((message) => message.role === 'system' && /You are|You maintain|You turn/.test(String(message.content)))?.content ?? '');
    seen.calls.push({ system, body });
    let content;
    if (system.includes('curriculum designer')) content = JSON.stringify({ nodes: NODES.map((name) => ({ name })).map((node, i) => CONCEPTS.nodes[i] ?? node), links: CONCEPTS.links });
    else if (system.includes("maintain a learner's knowledge map")) content = JSON.stringify(REFRESHED);
    else if (system.includes("reading a learner's answers")) content = JSON.stringify(INSIGHT);
    else if (system.includes('mistake-book entry')) content = JSON.stringify(ANALYSIS);
    else if (system.includes("past mistake into the next question")) content = `<next-questions>["${MISTAKE_NEXT}"]</next-questions>`;
    else content = JSON.stringify({
      q: '下面哪种说法最接近你的理解？', knowledgePoint: '可导与连续',
      opts: [
        { letter: 'A', text: '连续就一定可导', level: 'blank' },
        { letter: 'B', text: '可导一定连续，反之不一定', level: 'internalized' },
        { letter: 'C', text: '两者没有关系', level: 'blank' },
      ],
    });
    await route.fulfill({ json: { choices: [{ message: { content } }] } });
  });
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    const body = route.request().postDataJSON();
    seen.streams.push(body);
    const text = seen.reply ?? (body.learningMode === 'recall' ? RECALL : body.learningMode === 'practice' ? PRACTICE : LESSON);
    seen.reply = null;
    await route.fulfill({ contentType: 'text/event-stream', body: streamBody(text) });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => window.__socratesLegacy?.profile?.setLang?.('zh'));
  return seen;
}

async function startLesson(page) {
  await page.locator('#topModeTutor').click();
  await page.locator('#composerRoot .rich-composer-editor').fill('为什么导数能表示变化率？');
  await page.locator('#composerPrimaryBtn').click();
  await expect(page.locator('#tutorExplorationDialog')).toBeVisible();
  await page.locator('.tutor-explore-skip').click();
  await expect(page.locator('#chatView')).toBeVisible();
  await expect(page.locator('.msg.assistant').last()).toContainText('瞬时变化率');
}

async function chooseSessionMode(page, id) {
  await page.locator('[data-testid="learning-mode-trigger"]').click();
  await page.locator(`#learningModeBar [data-testid="learning-mode-${id}"]`).click();
}

const nextQuestions = (page) => page.locator('[data-testid^="question-chain-next-"]');
const lastUserText = (body) => {
  const users = body.messages.filter((message) => message.role === 'user');
  const last = users[users.length - 1];
  return typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
};

test('next questions are the ones the reply wrote; none without a block', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const seen = await setupTutor(page);
  await startLesson(page);
  expect(seen.streams.at(-1).learningMode).toBe('think');
  await expect(nextQuestions(page)).toHaveCount(2);
  await expect(nextQuestions(page).nth(0)).toContainText(NEXT[0]);
  await expect(nextQuestions(page).nth(1)).toContainText(NEXT[1]);
  await expect(page.locator('.msg.assistant').last()).not.toContainText('next-questions');
  await expect(page.locator('.msg.assistant').last()).not.toContainText(NEXT[0]);
  await shot(page.locator('#chatInputBar'), 'next-questions');

  /* A reply without the block offers no questions: no fixed fallback. */
  seen.reply = '好问题。先看定义里的分子。';
  await nextQuestions(page).first().click();
  await expect.poll(() => seen.streams.length).toBe(2);
  await expect(page.locator('[data-testid="question-chain"]')).toHaveAttribute('data-steps', '2');
  await expect(nextQuestions(page)).toHaveCount(0);
  /* A block cut off mid-stream is hidden and offers nothing either. */
  seen.reply = '继续推下去。\n\n<next-questions>["半截的问题';
  await page.locator('#composerRoot .rich-composer-editor').fill('我明白了');
  await page.locator('#composerPrimaryBtn').click();
  await expect.poll(() => seen.streams.length).toBe(3);
  await expect(page.locator('.msg.assistant').last()).toContainText('继续推下去');
  await expect(page.locator('.msg.assistant').last()).not.toContainText('半截');
  await expect(nextQuestions(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('recall mode asks the tutor for cards and sends the self-ratings back', async ({ page }) => {
  const seen = await setupTutor(page);
  await startLesson(page);
  await chooseSessionMode(page, 'recall');
  await expect.poll(() => seen.streams.length).toBe(2);
  expect(seen.streams[1].learningMode).toBe('recall');
  expect(lastUserText(seen.streams[1])).toBe('[Learning mode: recall]');
  await expect(page.locator('#composerRoot .rich-composer-editor')).toHaveText('');
  const reply = page.locator('.msg.assistant').last();
  const cards = reply.locator('.sc-host[data-scaffold="flashcard"]');
  await expect(cards).toHaveCount(3);
  await expect(nextQuestions(page)).toHaveCount(2);
  await shot(reply, 'recall-cards', { tall: true });
  await cards.first().getByTestId('flashcard-flip').click();
  await cards.first().getByTestId('flashcard-rate-forgot').click();
  await nextQuestions(page).first().click();
  await expect.poll(() => seen.streams.length).toBe(3);
  expect(seen.streams[2].learningMode).toBe('recall');
  /* The ratings ride as a turn-scoped system context, handed over once. */
  const recallContext = (body) => body.messages.filter((m) => m.role === 'system' && String(m.content).includes('Recall self-assessment'));
  expect(recallContext(seen.streams[2]).map((m) => m.content).join('\n')).toContain('- forgot: 导数的定义是什么？');
  expect(recallContext(seen.streams[1])).toHaveLength(0);
});

test('knowledge map: AI definitions and relations, refreshed on See connections; Practice asks the tutor', async ({ page }) => {
  const seen = await setupTutor(page);
  await startLesson(page);
  await chooseSessionMode(page, 'connect');
  await expect(page.locator('#knowledgePanel')).toBeVisible();
  await expect.poll(() => seen.calls.filter((call) => call.system.includes("maintain a learner's knowledge map")).length).toBe(1);
  const refresh = seen.calls.find((call) => call.system.includes("maintain a learner's knowledge map"));
  expect(refresh.body.messages.at(-1).content).toContain('瞬时变化率');
  const caption = page.locator('#kbContent [data-kb-edge-kind]');
  await expect(caption).toHaveAttribute('data-kb-edge-kind', 'concept');
  await expect(page.locator('#kbContent [data-kb-graph-edge]')).toHaveCount(3);
  await shot(page.locator('#knowledgePanel'), 'kb-concept-graph');

  await page.locator('#kbContent [data-kb-graph-node="1"]').click();
  const drawer = page.locator('[data-kb-node-detail="1"]');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('[data-kb-definition]')).toHaveText(CONCEPTS.nodes[1].definition);
  await expect(drawer.locator('[data-kb-relation="concept"]')).toHaveCount(3);
  await expect(drawer.locator('[data-kb-relation-why]').first()).toContainText('导数本身就是一个极限');
  await shot(drawer, 'kb-node-definition');

  /* The refresh wrote a definition the first pass lacked. */
  await drawer.locator('[data-kb-detail-close]').click();
  await page.locator('#kbContent [data-kb-graph-node="3"]').click();
  await expect(page.locator('[data-kb-node-detail="3"] [data-kb-definition]')).toContainText('|x| 在 0 处就是反例');
  await page.locator('[data-kb-node-detail="3"] [data-kb-detail-close]').click();

  await page.locator('#kbContent [data-kb-graph-node="0"]').click();
  await page.locator('[data-kb-node-detail="0"] [data-kb-practice]').click();
  await expect.poll(() => seen.streams.length).toBe(2);
  expect(seen.streams[1].learningMode).toBe('practice');
  expect(seen.streams[1].learningFocus).toBe(`极限的定义 (${CONCEPTS.nodes[0].definition})`);
});

test('older sessions without AI fields keep the learning-path map', async ({ page }) => {
  await setupTutor(page);
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/set', key: 'kbNodes', value: [{ name: 'A', status: 'fuzzy', questions: 1, system_note: '旧的系统笔记' }, { name: 'B', status: 'blank', questions: 0 }] });
    document.getElementById('sidebar')?.classList.remove('collapsed');
    const panel = document.getElementById('knowledgePanel');
    if (panel) { panel.classList.remove('hidden'); panel.style.setProperty('display', 'flex', 'important'); }
    document.getElementById('recentsPanel')?.classList.add('hidden');
  });
  await expect(page.locator('#kbContent [data-kb-edge-kind]')).toHaveAttribute('data-kb-edge-kind', 'path');
  await page.locator('#kbContent [data-kb-graph-node="0"]').click();
  const drawer = page.locator('[data-kb-node-detail="0"]');
  await expect(drawer.locator('[data-kb-definition]')).toHaveCount(0);
  await expect(drawer.locator('[data-kb-system-note]')).toHaveText('旧的系统笔记');
  await expect(drawer.locator('[data-kb-relation="after"]')).toBeVisible();
});

test('find gaps reruns a formal diagnostic with AI-written reasons and next step', async ({ page }) => {
  const seen = await setupTutor(page);
  await startLesson(page);
  await chooseSessionMode(page, 'diagnose');
  const view = page.locator('#diagnosticView');
  await expect(view.locator('[data-diag-command="select"]').first()).toBeVisible();
  for (let i = 0; i < 5; i += 1) {
    await view.locator('[data-diag-command="select"]').first().click();
    await view.locator('[data-diag-command="next"], [data-diag-command="finish"]').click();
  }
  await expect(view.locator('[data-diag-ai-next]')).toHaveText(INSIGHT.nextStep);
  await expect(view.locator('[data-diag-ai-summary]')).toHaveText(INSIGHT.summary);
  await expect(view.locator('[data-diag-reason="3"]')).toHaveText(INSIGHT.gaps[0].reason);
  const insightCall = seen.calls.find((call) => call.system.includes("reading a learner's answers"));
  expect(insightCall.body.messages.at(-1).content).toContain('answered A 「连续就一定可导」');
  await shot(view, 'diag-insight');
  await view.locator('[data-diag-command="proceed"]').click();
  await expect(page.locator('#chatView')).toBeVisible();
});

test('a wrong answer gets an AI analysis, and the mistake becomes the next question', async ({ page }) => {
  const seen = await setupTutor(page);
  await startLesson(page);
  const quiz = page.locator('.msg.assistant').last().locator('.sc-host[data-scaffold="quiz"]');
  await quiz.locator('[data-letter="B"]').click();
  await quiz.getByTestId('quiz-submit').click();
  await expect.poll(() => seen.calls.filter((call) => call.system.includes('mistake-book entry')).length).toBe(1);
  const analysisCall = seen.calls.find((call) => call.system.includes('mistake-book entry'));
  expect(analysisCall.body.messages.at(-1).content).toContain("Learner's answer: B");

  await chooseSessionMode(page, 'mistakes');
  await expect(page.locator('#mistakesPanel')).toBeVisible();
  const card = page.locator('#mistakesList [data-mistake-id]').first();
  await card.locator('[data-mistake-toggle]').click();
  await expect(card.locator('[data-mistake-cause][data-mistake-ai]')).toContainText('漏掉了幂次带下来的系数 2');
  await expect(card.locator('[data-mistake-right][data-mistake-ai]')).toContainText('再代入');
  await shot(card, 'mistake-analysis');

  const before = seen.streams.length;
  await card.locator('[data-mistake-next]').click();
  await expect.poll(() => seen.streams.length).toBeGreaterThan(before);
  expect(lastUserText(seen.streams.at(-1))).toContain(MISTAKE_NEXT);
  await expect(page.locator('[data-testid="question-chain-current"]')).toContainText('为什么幂次会被');
  await shot(page.locator('#mainContent'), 'mistake-next-question');
});
