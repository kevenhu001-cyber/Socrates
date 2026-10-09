import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';
import { ensureSidebarOpen } from './_universal-helpers.mjs';

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
    if (url.pathname.endsWith('/auth/me')) return json({ user: { id: 'account', email: 'test@example.com', displayName: 'Test' } });
    if (url.pathname.endsWith('/auth/csrf-token')) return json({ csrfToken: 'test-csrf' });
    if (url.pathname.endsWith('/config')) return json({ hasBeagleKey: true, beagleModel: 'test-model' });
    if (url.pathname.endsWith('/api-key') && req.method === 'GET') return json({ providers: [] });
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
    async function dismissCookieConsent() {
      const consent = page.getByRole('button', { name: 'Essential only' });
      if (await consent.isVisible().catch(() => false)) await consent.click();
    }
    await page.addInitScript(() => localStorage.setItem('socrates-lang-app', 'en'));
    await page.goto('/');
    // Wait for the signed-in chat shell before touching the sidebar:
    // under full-suite load the restore/sync can still be in flight.
    await expect(page.getByRole('button', { name: 'Model and reasoning' })).toBeVisible({ timeout: 20000 });
    await dismissCookieConsent();
    // Exam lives in the sidebar's More menu.
    async function openMore() {
      await ensureSidebarOpen(page);
      const more = page.getByRole('button', { name: 'More' });
      await more.click();
    }

    await openMore();
    await page.getByRole('menuitem', { name: 'Exam', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Build a focused practice exam' })).toBeVisible();
    await page.locator('#examTopic').fill('Cell biology');
    await page.getByRole('button', { name: 'Fewer' }).click();
    await page.getByRole('button', { name: 'Fewer' }).click();
    await page.getByRole('button', { name: 'Generate Exam', exact: true }).click();

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
    const freshRow = page.getByRole('complementary').getByText('Cell biology', { exact: true });
    await ensureSidebarOpen(page);
    await expect(freshRow).toBeVisible();

    // Reload restores the exam from the server row.
    await page.reload();
    await dismissCookieConsent();
    const row = page.getByRole('complementary').getByText('Cell biology', { exact: true });
    // Wait for rehydration, then open the sidebar only when this viewport
    // starts collapsed.
    await ensureSidebarOpen(page);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(page.getByText('Question 1 / 3')).toBeVisible();
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/universal-exam-generation-${encodeURIComponent(testInfo.project.name)}.png`, fullPage: false });
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      // The mobile browser can keep an API keep-alive socket open after the
      // final screenshot; force-close it so teardown cannot consume the test
      // timeout after all assertions have passed.
      server.closeAllConnections();
    });
  }
});
