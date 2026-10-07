import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';

// Exam generation: the app asks the model once per question through
// /chat/stream, parses the JSON, then persists the exam as a session.
test('universal exam generation creates and persists an exam session', async ({ page }, testInfo) => {
  const questionFor = (index) => index % 2 === 0
    ? { q: `MCQ question ${index + 1}?`, type: 'multiple-choice', opts: [{ letter: 'A', text: 'Yes' }, { letter: 'B', text: 'No' }], answer: 'A', explanation: 'Because.' }
    : { q: `Fill question ${index + 1}`, type: 'fill-blank', answers: [`answer${index + 1}`], explanation: '' };
  const streams = [];
  const saves = [];
  const records = new Map();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Accept');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url, 'http://127.0.0.1:4176');
    let body = ''; for await (const chunk of req) body += chunk;
    const payload = body ? JSON.parse(body) : {};
    const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (url.pathname.endsWith('/auth/mobile/refresh')) return json({ accessToken: 'rotated', refreshToken: 'next-refresh', expiresAt: new Date(Date.now() + 600_000).toISOString() });
    if (req.headers.authorization !== 'Bearer rotated') return json({ message: 'Unauthorized' }, 401);
    if (url.pathname.endsWith('/auth/me')) return json({ user: { id: 'account', email: 'test@example.com', displayName: 'Test' } });
    if (url.pathname.endsWith('/projects')) return json({ projects: [] });
    if (url.pathname.endsWith('/files') && req.method === 'GET') return json({ files: [], nextCursor: null });
    if (url.pathname.endsWith('/chat/stream')) {
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      const user = messages.find((message) => typeof message.content === 'string' && message.content.startsWith('Generate question'));
      const match = /Generate question (\d+) now\./.exec(user ? user.content : '');
      const index = match ? Number(match[1]) - 1 : 0;
      streams.push({ index, system: String((messages.find((message) => message.role === 'system') || {}).content || '') });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(questionFor(index)) } }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    if (url.pathname.endsWith('/sessions') && req.method === 'POST') {
      saves.push(payload);
      const record = { ...payload, id: payload.id && !String(payload.id).startsWith('session-') ? payload.id : 'exam-row-1' };
      records.set(record.id, record);
      return json({ id: record.id, title: record.title, topic: record.topic, kind: record.kind, examData: record.examData, mode: record.mode, phase: record.phase });
    }
    if (url.pathname.endsWith('/sessions') && req.method === 'GET') return json({ sessions: [...records.values()].map(({ messages, examData, ...row }) => ({ ...row, kind: row.kind })), nextCursor: null });
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
    // Wait for the signed-in chat shell before touching the sidebar:
    // under full-suite load the restore/sync can still be in flight.
    await expect(page.getByRole('button', { name: 'Choose model' })).toBeVisible({ timeout: 20000 });
    // New exam lives in the sidebar's More menu (baseline chrome).
    async function openMore() {
      const more = page.getByRole('button', { name: 'More' });
      if (!(await more.isVisible())) await page.getByRole('button', { name: 'Toggle sidebar' }).click();
      await more.click();
    }

    await openMore();
    const newExam = page.getByRole('button', { name: 'New exam' });
    await expect(newExam).toBeVisible();
    await newExam.click();
    await expect(page.getByText('Generate exam')).toBeVisible();
    await page.getByLabel('Topic').fill('Cell biology');
    await page.getByRole('button', { name: '3 questions' }).click();
    await page.getByRole('button', { name: 'Generate' }).click();

    // Progress then the finished exam session.
    await expect(page.getByText('Question 1 / 3')).toBeVisible();
    await expect(page.getByText('MCQ question 1?')).toBeVisible();
    await expect(page.getByText('Fill question 2')).toBeVisible();
    await expect(page.getByText('MCQ question 3?')).toBeVisible();
    await expect.poll(() => streams.length).toBe(3);
    expect(streams.map((stream) => stream.index).sort()).toEqual([0, 1, 2]);
    expect(streams[1].system).toContain('Question type: fill-blank.');
    await expect.poll(() => saves.length).toBe(1);
    expect(saves[0].kind).toBe('exam');
    expect(saves[0].title).toBe('Cell biology');
    expect(saves[0].examData.questions.length).toBe(3);
    const freshRow = page.getByRole('button', { name: 'Cell biology', exact: true });
    if (!await freshRow.isVisible()) await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await expect(freshRow).toBeVisible();

    // Reload restores the exam from the server row.
    await page.reload();
    const row = page.getByRole('button', { name: 'Cell biology', exact: true });
    if (!await row.isVisible()) await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await row.click();
    await expect(page.getByText('Question 1 / 3')).toBeVisible();
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/universal-exam-generation-${encodeURIComponent(testInfo.project.name)}.png`, fullPage: false });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
