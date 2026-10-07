import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';

// Exam surface contract server: a client-generated exam stored on the
// session (kind=exam + examData). Answers persist through PATCH and grading
// is local; no LLM call is involved.
test('universal exam renders questions, saves answers and grades locally', async ({ page }, testInfo) => {
  const a = '11111111-1111-4111-8111-111111111111';
  const record = {
    id: a, topic: 'Arithmetic and biology', title: 'Exam conversation', mode: 'chat', phase: 'chat', kind: 'exam', projectId: null,
    messages: [],
    examData: {
      topic: 'Arithmetic and biology', difficulty: 'intermediate', count: 3, lang: 'English', types: ['multiple-choice', 'fill-blank', 'short-answer'],
      questions: [
        { q: 'What is 2 + 2?', type: 'multiple-choice', opts: [{ letter: 'A', text: '4' }, { letter: 'B', text: '3' }], answer: 'A', explanation: 'Basic addition.' },
        { q: 'The capital of France is ____.', type: 'fill-blank', answers: ['Paris'], explanation: '' },
        { q: 'Explain photosynthesis.', type: 'short-answer', answer: 'chlorophyll, sunlight', explanation: 'Plants convert light.' },
      ],
      answers: {},
      submitted: false,
      generatedAt: 1,
    },
  };
  const patches = [];
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
    if (url.pathname.endsWith(`/sessions/${a}`) && req.method === 'PATCH') {
      patches.push(payload);
      Object.assign(record, payload);
      return json(record);
    }
    if (url.pathname.endsWith('/sessions') && req.method === 'GET') return json({ sessions: [{ id: record.id, title: record.title, topic: record.topic, mode: record.mode, phase: record.phase, kind: record.kind, projectId: null }], nextCursor: null });
    const id = url.pathname.split('/').at(-1);
    if (id === a) return json(record);
    return json({ message: 'Not found' }, 404);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4176, '127.0.0.1', resolve); });
  const openExam = async () => {
    const target = page.getByRole('button', { name: 'Exam conversation', exact: true });
    if (!await target.isVisible()) await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await target.click();
  };
  try {
    await page.addInitScript(() => {
      try {
        if (!localStorage.getItem('socrates.auth.tokens')) localStorage.setItem('socrates.auth.tokens', JSON.stringify({ accessToken: 'expired', refreshToken: 'old-refresh', expiresAt: '2000-01-01' }));
      } catch { /* sandboxed frame */ }
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Open projects' })).toBeVisible({ timeout: 20000 });
    await openExam();

    // Questions render in place of the transcript/composer.
    await expect(page.getByText('Question 1 / 3')).toBeVisible();
    await expect(page.getByRole('button', { name: 'A. 4' })).toBeVisible();
    await expect(page.getByLabel('Answer for question 2')).toBeVisible();
    await expect(page.getByLabel('Answer for question 3')).toBeVisible();
    await expect(page.getByPlaceholder('Message Socrates')).toHaveCount(0);

    // Submit gate, then answer all three (one wrong on purpose).
    await page.getByRole('button', { name: 'Submit exam' }).click();
    await expect(page.getByText('Answer every question before submitting.')).toBeVisible();
    await page.getByRole('button', { name: 'B. 3' }).click();
    await page.getByLabel('Answer for question 2').fill('paris');
    await page.getByLabel('Answer for question 3').fill('Chlorophyll captures light');
    await expect(page.getByText('3 / 3 answered')).toBeVisible();
    await expect.poll(() => patches.length).toBeGreaterThan(0);
    await expect.poll(() => patches.at(-1)?.examData?.answers?.['1']).toBe('paris');
    await expect.poll(() => patches.at(-1)?.examData?.submitted).toBe(false);

    // Local grading: 2/3 correct, wrong MCQ marked, explanation rendered.
    await page.getByRole('button', { name: 'Submit exam' }).click();
    await expect(page.getByText('2 / 3 · 67% correct')).toBeVisible();
    await expect(page.getByText('Incorrect', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Correct', { exact: true })).toHaveCount(2);
    await expect(page.getByText(/Basic addition/)).toBeVisible();
    await expect.poll(() => patches.at(-1)?.examData?.submitted).toBe(true);
    expect(patches.at(-1)?.examData?.answers?.['0']).toBe(1);

    // Reload restores the graded exam from the server row.
    await page.reload();
    await openExam();
    await expect(page.getByText('2 / 3 · 67% correct')).toBeVisible();
    await expect(page.getByPlaceholder('Message Socrates')).toHaveCount(0);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/universal-exam-${encodeURIComponent(testInfo.project.name)}.png`, fullPage: false });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
