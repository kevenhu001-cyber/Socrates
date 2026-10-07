import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';

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
      if (req.method === 'GET') return json({ sessions: [...records.values()].map(({ messages, ...row }) => row), nextCursor: null });
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
    await expect(page.getByRole('button', { name: 'Open projects' })).toBeVisible({ timeout: 20000 });

    const newTutor = page.getByRole('button', { name: 'New tutor', exact: true });
    if (!await newTutor.isVisible()) await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await newTutor.click();
    await page.getByLabel('Topic', { exact: true }).fill('Algebra');
    await page.getByRole('button', { name: '3 questions' }).click();
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect(page.getByText('Quick diagnostic', { exact: true })).toBeVisible();
    for (let i = 1; i <= 3; i++) await page.getByRole('button', { name: `Answer A for Diag Q${i}?` }).click();
    await page.getByRole('button', { name: 'Start learning' }).click();
    await expect(page.getByText('Quick diagnostic', { exact: true })).toHaveCount(0);

    // Stage chip: starts at Intuition, ramps to Practice after four
    // substantive answers (motivate → define → develop → illustrate → exercise).
    await expect(page.getByText('🎓 Intuition')).toBeVisible();
    for (let i = 1; i <= 4; i++) {
      await page.getByLabel('Message Socrates', { exact: true }).fill(`ramp-${i} this is a sufficiently long free-form answer for the stage machine.`);
      await page.getByRole('button', { name: 'Send message' }).click();
      await expect(page.getByText(i === 4 ? 'What is 2+2?' : `Stage reply ${i}`, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('🎓 Practice')).toBeVisible();

    // Quiz proxy: a wrong pick with a declared answer locks the card, shows
    // the baseline feedback and sends the synthetic "I chose …" turn.
    await page.getByRole('button', { name: 'Answer A for What is 2+2?' }).click();
    await expect(page.getByText('Not quite. The correct answer is B.')).toBeVisible();
    await expect(page.getByText('I chose A. 3 (Result: incorrect, correct is B.)')).toBeVisible();
    await expect(page.getByText('What is 3+3?', { exact: true })).toBeVisible();
    expect(chatStreams.at(-1)).toContain('I chose A. 3');

    // Practice proxy: hint toggle, submit sends the "[Practice attempt]"
    // turn and a self-check hit shows the local feedback line.
    await page.getByRole('button', { name: 'Show hint' }).click();
    await expect(page.getByText('Subtract 1.')).toBeVisible();
    await page.getByLabel('Type your answer…').fill('x=5');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByText('Correct!')).toBeVisible();
    await expect(page.getByText('Practice feedback', { exact: true })).toBeVisible();
    expect(chatStreams.at(-1)).toContain('[Practice attempt]');
    expect(chatStreams.at(-1)).toContain('x=5');

    // A correct pick is terminal: feedback shows, the card locks, the
    // exercise→check transition lands on the chip and no model turn goes out.
    const streamCount = chatStreams.length;
    await page.getByRole('button', { name: 'Answer A for What is 3+3?' }).click();
    await expect(page.getByText('Correct (A).')).toBeVisible();
    await expect(page.getByText('🎓 Check')).toBeVisible();
    expect(chatStreams.length).toBe(streamCount);

    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/universal-tutor-widgets-${encodeURIComponent(testInfo.project.name)}.png`, fullPage: false });
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  }
});
