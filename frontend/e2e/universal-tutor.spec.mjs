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

// Tutor cold start: setup generates a per-question diagnostic over the
// stream, answering folds into the KB baseline, and teaching continues
// in the tutor voice. No LLM, production backend or credentials used.
test('universal tutor generates a diagnostic, grades the baseline and teaches', async ({ page }, testInfo) => {
  const records = new Map();
  let idCounter = 0;
  const uuid = () => `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa${idCounter++}`;
  let genCalls = 0;
  const streams = [];
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
    if (url.pathname.endsWith('/sessions')) {
      if (req.method === 'GET') return json({ sessions: url.searchParams.get('archived') === 'true' ? [] : [...records.values()].map(({ messages, ...row }) => row), nextCursor: null });
      const id = records.has(payload.id) ? payload.id : uuid();
      records.set(id, { ...payload, id });
      return json({ id, title: records.get(id).title });
    }
    if (url.pathname.endsWith('/chat/stream')) {
      const system = payload.messages?.[0]?.content || '';
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      streams.push({ system, mode: payload.mode });
      if (system.includes('diagnostic tutor')) {
        const i = genCalls++;
        res.end(`data: {"choices":[{"delta":{"content":${JSON.stringify(diagJson(i))}}}]}\n\ndata: [DONE]\n\n`);
        return;
      }
      res.end('data: {"choices":[{"delta":{"content":"Taught reply"}}]}\n\ndata: [DONE]\n\n');
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

    // Tutor setup: topic + 3 diagnostic questions. New tutor lives in the
    // sidebar's More menu (baseline chrome).
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

    // Answer the diagnostic, then start learning.
    await expect(page.getByText('Quick diagnostic', { exact: true })).toBeVisible();
    for (let i = 1; i <= 3; i++) {
      await page.getByRole('button', { name: `Answer A for Diag Q${i}?` }).click();
    }
    await expect(page.getByText('3 / 3 answered', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Start learning' }).click();

    // The diagnostic view yields to the transcript; teaching continues.
    await expect(page.getByText('Quick diagnostic', { exact: true })).toHaveCount(0);
    expect(genCalls).toBe(3);
    await ensureSidebarOpen(page);
    if (testInfo.project.name === 'mobile') {
      await expect(page.locator('#socrates-sidebar-backdrop')).toBeVisible();
      const mainBox = await page.locator('#socrates-main').boundingBox();
      expect(mainBox?.x).toBe(0);
      expect(mainBox?.width).toBeGreaterThan(380);
      await page.locator('#socrates-sidebar-backdrop').click({ position: { x: 370, y: 400 } });
      await expect(page.getByRole('button', { name: 'Toggle sidebar', exact: true })).toBeVisible();
      await ensureSidebarOpen(page);
    }
    await openKnowledgeView(page);
    await expect(page.getByText('Teaching plan', { exact: true })).toBeVisible();
    await expect(page.getByText('0 / 5 (0%)', { exact: true })).toBeVisible();
    await expect(page.getByText('0/3', { exact: true })).toBeVisible();
    await expect(page.getByText('Knowledge Boundary', { exact: true })).toBeVisible();
    await openKnowledgeView(page);
    if (testInfo.project.name === 'mobile') await closeSidebarIfOpen(page);
    await page.getByLabel('Ask Socrates', { exact: true }).fill('Teach me please, this is a long enough free-form answer.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Taught reply', { exact: true })).toBeVisible();
    if (testInfo.project.name === 'mobile') await ensureSidebarOpen(page);
    await openKnowledgeView(page);
    await expect(page.getByText('1/3', { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/universal-tutor-knowledge-${encodeURIComponent(testInfo.project.name)}.png`, fullPage: false });
    await openKnowledgeView(page);
    if (testInfo.project.name === 'mobile') await closeSidebarIfOpen(page);
    const substantiveAnswers = [
      'I can explain the concept, connect it with earlier definitions, justify each step, and apply it to another example.',
      'My reasoning follows from the definition, and I can show how each assumption leads to the result in context.',
      'This approach works because the key properties remain true across the example, so the conclusion follows clearly.',
    ];
    let replyCount = 1;
    for (const answer of substantiveAnswers) {
      await page.getByLabel('Ask Socrates', { exact: true }).fill(answer);
      await page.getByRole('button', { name: 'Send message' }).click();
      await expect(page.getByText('Taught reply', { exact: true })).toHaveCount(++replyCount);
    }
    if (testInfo.project.name === 'mobile') await ensureSidebarOpen(page);
    await openKnowledgeView(page);
    await expect(page.getByText('1 / 5 (20%)', { exact: true })).toBeVisible();
    await expect(page.getByText('0/3', { exact: true })).toBeVisible();
    await expect(page.getByText('Internalized', { exact: true }).first()).toBeVisible();
    await expect(page.locator('[data-testid="socrates-teaching-plan-stage"]')).toHaveText('Intuition');
    await openKnowledgeView(page);
    if (testInfo.project.name === 'mobile') await closeSidebarIfOpen(page);
    const teaching = streams.find((s) => !s.system.includes('diagnostic tutor'));
    expect(teaching?.mode).toBe('tutor');
    expect(teaching?.system).toMatch(/Socratic tutor/);

    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/universal-tutor-${encodeURIComponent(testInfo.project.name)}.png`, fullPage: false });
    if (testInfo.project.name === 'mobile') await ensureSidebarOpen(page);
    await openKnowledgeView(page);
    await page.getByRole('button', { name: 'Basic concepts of Algebra', exact: true }).first().click();
    await expect(page.getByRole('textbox', { name: 'Your note' })).toBeVisible();
    await page.getByRole('button', { name: 'Set confidence to 3' }).click();
    await page.getByRole('textbox', { name: 'Your note' }).fill('Remember this foundation.');
    await expect.poll(() => [...records.values()].some((session) => session.kbNodes?.[0]?.user_note === 'Remember this foundation.')).toBe(true);
    await page.getByRole('button', { name: 'Save snapshot', exact: true }).click();
    await expect(page.getByText('Snapshot history', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: `test-results/universal-tutor-detail-${encodeURIComponent(testInfo.project.name)}.png`, fullPage: false });
    await page.getByRole('button', { name: 'Practical applications of Algebra', exact: true }).first().click();
    await page.getByRole('button', { name: 'Jump the chat to this knowledge point' }).click();
    await expect(page.getByText('Taught reply', { exact: true })).toHaveCount(++replyCount);
    expect(streams.at(-1)?.mode).toBe('tutor');
    expect([...records.values()].some((session) => session.currentNode === 2)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  }
});
