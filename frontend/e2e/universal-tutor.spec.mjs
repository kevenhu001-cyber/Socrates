import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';

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
      if (req.method === 'GET') return json({ sessions: [...records.values()].map(({ messages, ...row }) => row), nextCursor: null });
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
    await expect(page.getByRole('button', { name: 'Open projects' })).toBeVisible({ timeout: 20000 });

    // Tutor setup: topic + 3 diagnostic questions.
    const newTutor = page.getByRole('button', { name: 'New tutor', exact: true });
    if (!await newTutor.isVisible()) await page.getByRole('button', { name: 'Toggle sidebar' }).click();
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
    await page.getByLabel('Message Socrates', { exact: true }).fill('Teach me please, this is a long enough free-form answer.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Taught reply', { exact: true })).toBeVisible();
    const teaching = streams.find((s) => !s.system.includes('diagnostic tutor'));
    expect(teaching?.mode).toBe('tutor');
    expect(teaching?.system).toMatch(/Socratic tutor/);

    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/universal-tutor-${encodeURIComponent(testInfo.project.name)}.png`, fullPage: false });
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  }
});
