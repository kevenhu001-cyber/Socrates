import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';
import { closeSidebarIfOpen, ensureSidebarOpen } from './_universal-helpers.mjs';

async function openKnowledgeView(page) {
  const knowledge = page.getByRole('button', { name: 'Knowledge', exact: true });
  const compact = await page.evaluate(() => window.innerWidth <= 768);
  let openedSearch = false;
  if (compact && !(await knowledge.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Search chats', exact: true }).first().click();
    openedSearch = true;
  }
  await knowledge.click();
  if (openedSearch) await page.getByRole('button', { name: 'Search chats', exact: true }).first().click();
}

async function openMistakesView(page) {
  const mistakes = page.getByRole('button', { name: 'Mistakes', exact: true });
  const compact = await page.evaluate(() => window.innerWidth <= 768);
  let openedSearch = false;
  if (compact && !(await mistakes.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Search chats', exact: true }).first().click();
    openedSearch = true;
  }
  await mistakes.click();
  if (openedSearch) await page.getByRole('button', { name: 'Search chats', exact: true }).first().click();
}

// The Mistakes toolbar button (and its badge) sits behind the search toggle
// on the phone drawer; open it just long enough to read the badge.
async function expectMistakesBadge(page, text) {
  const badge = page.locator('[data-testid="socrates-mistakes-badge"]');
  const compact = await page.evaluate(() => window.innerWidth <= 768);
  let openedSearch = false;
  if (compact && !(await page.getByRole('button', { name: 'Mistakes', exact: true }).isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Search chats', exact: true }).first().click();
    openedSearch = true;
  }
  await expect(badge).toHaveText(text);
  if (openedSearch) await page.getByRole('button', { name: 'Search chats', exact: true }).first().click();
}

// Tutor teaching UI: the stage chip tracks the stage machine, and the
// quiz/practice scaffold proxies lock on pick, show baseline feedback,
// send the synthetic turns (quiz wrong / practice submit) and apply the
// exercise→check transition on a correct pick. Mock LLM only.
test('universal tutor renders quiz and practice widgets', async ({ page }, testInfo) => {
  const records = new Map();
  let idCounter = 0;
  const uuid = () => `cccccccc-cccc-4ccc-8ccc-cccccccccc${idCounter++}`;
  let genCalls = 0;
  const chatStreams = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const diagJson = (i) => JSON.stringify({
    q: `Diag Q${i + 1}?`,
    knowledgePoint: `kp${i + 1}`,
    opts: [
      { letter: 'A', text: `Know ${i + 1}`, level: 'internalized' },
      { letter: 'B', text: `Heard ${i + 1}`, level: 'fuzzy' },
      { letter: 'C', text: `Lost ${i + 1}`, level: 'blank' },
    ],
  });
  const quiz1 = '<quiz><q>What is 2+2?</q><o letter="A">3</o><o letter="B">4</o><correct>B</correct></quiz>';
  const quiz2 = '<quiz><q>What is 3+3?</q><o letter="A">6</o><o letter="B">5</o><correct>A</correct></quiz>';
  const practice = '<practice correct="x=5"><title>Try it</title><problem>Solve $x+1=6$.</problem><hint>Subtract 1.</hint></practice>';
  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Accept');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url, 'http://127.0.0.1:4176');
    let body = ''; for await (const chunk of req) body += chunk;
    const payload = body ? JSON.parse(body) : {};
    const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (url.pathname.endsWith('/auth/mobile/refresh')) {
      return json({ accessToken: 'rotated', refreshToken: 'next-refresh', expiresAt: new Date(Date.now() + 600_000).toISOString() });
    }
    if (req.headers.authorization !== 'Bearer rotated') return json({ message: 'Unauthorized' }, 401);
    if (url.pathname.endsWith('/auth/me')) return json({ user: { id: 'account', email: 'test@example.com', displayName: 'Test' } });
    if (url.pathname.endsWith('/projects')) return json({ projects: [] });
    if (url.pathname.endsWith('/creations/items/assistants')) return json({ items: [] });
    if (url.pathname.endsWith('/sessions')) {
      if (req.method === 'GET') return json({ sessions: url.searchParams.get('archived') === 'true' ? [] : [...records.values()].map(({ messages, ...row }) => row), nextCursor: null });
      const id = records.has(payload.id) ? payload.id : uuid();
      records.set(id, { ...payload, id });
      return json({ id, title: records.get(id).title });
    }
    if (url.pathname.endsWith('/chat/stream')) {
      const system = payload.messages?.[0]?.content || '';
      const lastUser = [...(payload.messages || [])].reverse().find((m) => m.role === 'user')?.content || '';
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      if (system.includes('diagnostic tutor')) {
        res.end(`data: {"choices":[{"delta":{"content":${JSON.stringify(diagJson(genCalls++))}}}]}\n\ndata: [DONE]\n\n`);
        return;
      }
      chatStreams.push(lastUser);
      let reply = `Stage reply ${chatStreams.length}`;
      if (lastUser.includes('ramp-4')) reply = quiz1 + '\n' + practice;
      else if (lastUser.startsWith('I chose')) reply = quiz2;
      else if (lastUser.includes('[Practice attempt]')) reply = 'Practice feedback';
      res.end(`data: {"choices":[{"delta":{"content":${JSON.stringify(reply)}}}]}\n\ndata: [DONE]\n\n`);
      return;
    }
    const id = url.pathname.split('/').at(-1);
    if (records.has(id)) return json(records.get(id));
    return json({ message: 'Not found' }, 404);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4176, '127.0.0.1', resolve); });
  try {
    await page.addInitScript(() => {
      try {
        if (!localStorage.getItem('socrates.auth.tokens')) localStorage.setItem('socrates.auth.tokens', JSON.stringify({ accessToken: 'expired', refreshToken: 'old-refresh', expiresAt: '2000-01-01' }));
      } catch { /* sandboxed frame */ }
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Choose model' })).toBeVisible({ timeout: 20000 });

    // New tutor lives in the sidebar's More menu (baseline chrome).
    async function openMore() {
      await ensureSidebarOpen(page);
      const more = page.getByRole('button', { name: 'More' });
      await more.click();
    }

    await openMore();
    const newTutor = page.getByRole('button', { name: 'New tutor', exact: true });
    await expect(newTutor).toBeVisible();
    await newTutor.click();
    await page.getByLabel('Topic', { exact: true }).fill('Algebra');
    await page.getByRole('button', { name: '3 questions' }).click();
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect(page.getByText('Quick diagnostic', { exact: true })).toBeVisible();
    for (let i = 1; i <= 3; i++) await page.getByRole('button', { name: `Answer A for Diag Q${i}?` }).click();
    await page.getByRole('button', { name: 'Start learning' }).click();
    await expect(page.getByText('Quick diagnostic', { exact: true })).toHaveCount(0);

    // Stage chip: starts at Intuition, ramps through motivate → define →
    // develop → illustrate → exercise and the second node cycle lands back
    // at motivate (node internalization resets the stage when a sub-topic
    // is mastered). The chip lives in the sidebar's teaching-plan panel;
    // the tutor test opens the Knowledge view first because the chip is
    // sidebar-scoped.
    await ensureSidebarOpen(page);
    await openKnowledgeView(page);
    await expect(page.locator('[data-testid="socrates-teaching-plan-stage"]')).toHaveText('Intuition');
    // Mistake book starts empty; it shares the tutor toolbar with Knowledge.
    await openMistakesView(page);
    const emptyPanel = page.locator('[data-testid="socrates-mistakes-panel"]');
    await expect(emptyPanel.getByText('Mistake Book', { exact: true })).toBeVisible();
    await expect(emptyPanel.getByText('No mistakes yet.', { exact: true })).toBeVisible();
    await openKnowledgeView(page);
    await expect(page.locator('[data-testid="socrates-teaching-plan-stage"]')).toHaveText('Intuition');
    // Closing and reopening the phone drawer keeps the Knowledge view
    // (baseline sidebar DOM stays mounted; the view is not reset to Recents).
    if (testInfo.project.name === 'mobile') {
      await closeSidebarIfOpen(page);
      await ensureSidebarOpen(page);
      await expect(page.locator('[data-testid="socrates-teaching-plan-stage"]')).toHaveText('Intuition');
      await expect(page.locator('#socrates-sidebar-recents-title')).toHaveCount(0);
    }
    await openKnowledgeView(page);
    if (testInfo.project.name === 'mobile') await closeSidebarIfOpen(page);
    for (let i = 1; i <= 4; i++) {
      await page.getByLabel('Ask Socrates', { exact: true }).fill(`ramp-${i} this is a sufficiently long free-form answer for the stage machine.`);
      await page.getByRole('button', { name: 'Send message' }).click();
      await expect(page.getByText(i === 4 ? 'What is 2+2?' : `Stage reply ${i}`, { exact: true })).toBeVisible();
    }
    if (testInfo.project.name === 'mobile') await ensureSidebarOpen(page);
    await openKnowledgeView(page);
    await expect(page.locator('[data-testid="socrates-teaching-plan-stage"]')).toHaveText('Intuition');
    await openKnowledgeView(page);
    if (testInfo.project.name === 'mobile') await closeSidebarIfOpen(page);

    // Quiz proxy: a wrong pick with a declared answer locks the card, shows
    // the baseline feedback and sends the synthetic "I chose …" turn.
    await page.getByRole('button', { name: 'Answer A for What is 2+2?' }).click();
    await expect(page.getByText('Not quite. The correct answer is B.')).toBeVisible();
    await expect(page.getByText('I chose A. 3 (Result: incorrect, correct is B.)')).toBeVisible();
    await expect(page.getByText('What is 3+3?', { exact: true })).toBeVisible();
    expect(chatStreams.at(-1)).toContain('I chose A. 3');

    // Mistake book: the wrong pick above lands as a quiz row.
    if (testInfo.project.name === 'mobile') await ensureSidebarOpen(page);
    await openMistakesView(page);
    const mistakesPanel = page.locator('[data-testid="socrates-mistakes-panel"]');
    await expect(mistakesPanel.getByText('Mistake Book', { exact: true })).toBeVisible();
    await expect(mistakesPanel.getByText('What is 2+2?', { exact: true })).toBeVisible();
    await openMistakesView(page);
    if (testInfo.project.name === 'mobile') await closeSidebarIfOpen(page);

    // Practice proxy: hint toggle, submit sends the "[Practice attempt]"
    // turn and a self-check miss shows the local feedback line (and lands
    // in the mistake book; the redo below covers the self-check hit). The
    // parsed <title> is never rendered, matching the baseline card.
    await expect(page.getByText('Try it', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Show hint' }).click();
    await expect(page.getByText('Subtract 1.')).toBeVisible();
    await page.getByLabel('Type your answer…').fill('x=4');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByText('Not quite. The correct answer is: x=5')).toBeVisible();
    await expect(page.getByText('Practice feedback', { exact: true })).toBeVisible();
    expect(chatStreams.at(-1)).toContain('[Practice attempt]');
    expect(chatStreams.at(-1)).toContain('x=4');

    // A correct pick is terminal: feedback shows, the card locks and no
    // model turn goes out. The chip cannot reach the "Check" stage here:
    // after the first node is internalized the stage machine resets to
    // motivate, and the wrong/practice-origin turns below do not advance
    // it back to exercise before the second quiz pick fires.
    const streamCount = chatStreams.length;
    await page.getByRole('button', { name: 'Answer A for What is 3+3?' }).click();
    await expect(page.getByText('Correct (A).')).toBeVisible();
    expect(chatStreams.length).toBe(streamCount);

    // Mistake book actions: the badge counts unresolved rows, the filters
    // split resolved/unresolved, Redo bumps "Redone once" and hands back a
    // fresh card (appended for practice, remounted in place for a quiz whose
    // card is still in the transcript), and a right pick on the redone quiz
    // conquers it, removing the row.
    const mistakesPanelNow = () => page.locator('[data-testid="socrates-mistakes-panel"]');
    const quizRow = () => mistakesPanelNow().locator('[data-testid^="socrates-mistake-card-"]').filter({ hasText: 'What is 2+2?' });
    const practiceRow = () => mistakesPanelNow().locator('[data-testid^="socrates-mistake-card-"]').filter({ hasText: 'x+1=6' });
    // Baseline keeps the sidebar DOM mounted, so closing and reopening the
    // phone drawer comes back on the same view (Mistakes), not Recents.
    const reopenMistakes = async () => {
      if (testInfo.project.name !== 'mobile') return;
      await ensureSidebarOpen(page);
      await expect(mistakesPanelNow()).toBeVisible();
      await expect(page.locator('#socrates-sidebar-recents-title')).toHaveCount(0);
    };
    if (testInfo.project.name === 'mobile') await ensureSidebarOpen(page);
    await openMistakesView(page);
    await expectMistakesBadge(page, '2');
    await expect(mistakesPanelNow().locator('[data-testid^="socrates-mistake-card-"]')).toHaveCount(2);
    await page.locator('[data-testid="socrates-mistakes-filter-resolved"]').click();
    await expect(page.locator('[data-testid="socrates-mistakes-filter-empty"]')).toBeVisible();
    await expect(mistakesPanelNow().locator('[data-testid^="socrates-mistake-card-"]')).toHaveCount(0);
    await page.locator('[data-testid="socrates-mistakes-filter-unresolved"]').click();
    await expect(mistakesPanelNow().locator('[data-testid^="socrates-mistake-card-"]')).toHaveCount(2);
    await page.locator('[data-testid="socrates-mistakes-filter-all"]').click();
    await expect(mistakesPanelNow().locator('[data-testid^="socrates-mistake-card-"]')).toHaveCount(2);

    // Practice redo: count line + an appended fresh practice card.
    await expect(practiceRow().getByText('Redone once', { exact: true })).toHaveCount(0);
    await practiceRow().getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(practiceRow().getByText('Redone once', { exact: true })).toBeVisible();
    await expectMistakesBadge(page, '2');
    if (testInfo.project.name === 'mobile') await closeSidebarIfOpen(page);
    const redoCard = page.locator('[data-testid^="socrates-mistake-redo-card-"]');
    await expect(redoCard).toHaveCount(1);
    await expect(redoCard.getByText('— Redoing a question you got wrong —', { exact: true })).toBeVisible();
    await redoCard.getByLabel('Type your answer…').fill('x=5');
    await redoCard.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(redoCard.getByText('Correct!', { exact: true })).toBeVisible();
    await expect(page.getByText('Practice feedback', { exact: true })).toHaveCount(2);

    // Quiz redo: the original card remounts unlocked; a right pick conquers.
    await reopenMistakes();
    await quizRow().getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(quizRow().getByText('Redone once', { exact: true })).toBeVisible();
    if (testInfo.project.name === 'mobile') await closeSidebarIfOpen(page);
    await expect(page.getByText('Not quite. The correct answer is B.')).toHaveCount(0);
    const conquerStreams = chatStreams.length;
    await page.getByRole('button', { name: 'Answer B for What is 2+2?' }).click();
    await expect(page.getByText('Correct (B).')).toBeVisible();
    expect(chatStreams.length).toBe(conquerStreams);
    await reopenMistakes();
    await expect(quizRow()).toHaveCount(0);
    await expect(practiceRow()).toHaveCount(1);
    await expectMistakesBadge(page, '1');
    if (testInfo.project.name === 'mobile') await closeSidebarIfOpen(page);

    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/universal-tutor-widgets-${encodeURIComponent(testInfo.project.name)}.png`, fullPage: false });
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  }
});
