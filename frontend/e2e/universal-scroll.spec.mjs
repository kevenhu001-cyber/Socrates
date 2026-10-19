import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';
import { ensureSidebarOpen } from './_universal-helpers.mjs';

// Self-contained contract server: this exercises the exported client against
// local auth/session/SSE mocks only; it never reaches a production service.
test('universal transcript follows, pauses while reading, jumps latest and resets on session change', async ({ page }) => {
  const projectId = '33333333-3333-4333-8333-333333333333';
  const firstId = '11111111-1111-4111-8111-111111111111';
  const secondId = '22222222-2222-4222-8222-222222222222';
  const longHistory = Array.from({ length: 100 }, (_, index) => ({
    clientId: `history-${index}`,
    role: index % 2 ? 'assistant' : 'user',
    rawText: `${index % 2 ? 'Assistant' : 'User'} historical message ${String(index).padStart(3, '0')} — ${'A substantial transcript passage. '.repeat(5)}`,
  }));
  const sessions = new Map([
    [firstId, { id: firstId, title: 'Long conversation', topic: '', mode: 'chat', phase: 'chat', projectId, messages: longHistory }],
    [secondId, { id: secondId, title: 'Second conversation', topic: '', mode: 'chat', phase: 'chat', projectId, messages: [{ clientId: 'second-answer', role: 'assistant', rawText: 'Second session answer' }] }],
  ]);
  let streamResponse;
  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Accept');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url, 'http://127.0.0.1:4176');
    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = body ? JSON.parse(body) : {};
    const json = (value, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (url.pathname.endsWith('/auth/mobile/refresh')) {
      return json({ accessToken: 'rotated', refreshToken: 'next-refresh', expiresAt: new Date(Date.now() + 600_000).toISOString() });
    }
    if (req.headers.authorization !== 'Bearer rotated') return json({ message: 'Unauthorized' }, 401);
    if (url.pathname.endsWith('/auth/me')) return json({ user: { id: 'account', email: 'scroll@example.com', displayName: 'Scroll Test' } });
    if (url.pathname.endsWith('/projects')) return json({ projects: [{ id: projectId, name: 'Scroll project' }] });
    if (url.pathname.endsWith('/creations/items/assistants')) return json({ items: [] });
    if (url.pathname.endsWith('/sessions')) {
      if (req.method === 'GET') {
        const items = [...sessions.values()].map(({ messages, ...row }) => row);
        return json({ sessions: url.searchParams.get('archived') === 'true' ? [] : items, nextCursor: null });
      }
      const id = payload.id || firstId;
      sessions.set(id, { ...sessions.get(id), ...payload, id });
      return json({ id, title: payload.title || 'Long conversation' });
    }
    if (url.pathname.endsWith('/chat/stream')) {
      if (!sessions.has(payload.sessionId)) return json({ message: 'Unknown session' }, 400);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      streamResponse = res;
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Stream opening text.' } }] })}\n\n`);
      return;
    }
    const id = url.pathname.split('/').at(-1);
    if (sessions.has(id)) return json(sessions.get(id));
    return json({ message: 'Not found' }, 404);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(4176, '127.0.0.1', resolve);
  });

  try {
    await page.addInitScript(() => {
      try {
        if (!localStorage.getItem('socrates.auth.tokens')) {
          localStorage.setItem('socrates.auth.tokens', JSON.stringify({ accessToken: 'expired', refreshToken: 'old-refresh', expiresAt: '2000-01-01' }));
        }
      } catch { /* isolated embedded frames do not expose storage */ }
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Choose model' })).toBeVisible({ timeout: 20_000 });

    await ensureSidebarOpen(page);
    await page.getByRole('button', { name: 'Long conversation', exact: true }).click();
    const transcript = page.locator('#socrates-message-list');
    await expect(page.getByText('Assistant historical message 099', { exact: false })).toBeVisible();
    await expect.poll(async () => transcript.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThanOrEqual(4);

    await page.getByLabel('Ask Socrates', { exact: true }).fill('Continue this conversation');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Stream opening text.', { exact: true })).toBeVisible();
    await transcript.evaluate((node) => { node.scrollTop = 0; node.dispatchEvent(new Event('scroll', { bubbles: true })); });
    await expect(page.getByRole('button', { name: 'Jump to latest message' })).toBeVisible();
    const initialScrollTop = await transcript.evaluate((node) => node.scrollTop);

    // Push several independent SSE updates while the reader is deliberately
    // away from the bottom; the list must grow without pulling the reader down.
    for (let index = 0; index < 5; index += 1) {
      streamResponse.write(`data: ${JSON.stringify({ choices: [{ delta: { content: ` streamed segment ${index}. ${'More streamed material. '.repeat(8)}` } }] })}\n\n`);
    }
    streamResponse.end('data: [DONE]\n\n');
    streamResponse = null;
    // FlatList correctly unmounts the streamed row while it is far offscreen.
    // The final save proves the client applied every delta, without requiring
    // that virtualized row to stay in the DOM or scrolling it into view.
    await expect.poll(() => sessions.get(firstId)?.messages?.at(-1)?.rawText || '').toContain('streamed segment 4.');
    const scrolledMetrics = await transcript.evaluate((node) => ({ top: node.scrollTop, height: node.scrollHeight, client: node.clientHeight }));
    expect(scrolledMetrics.height).toBeGreaterThan(scrolledMetrics.client);
    expect(scrolledMetrics.top).toBeLessThan(initialScrollTop + 8);
    await expect(page.getByRole('button', { name: 'Jump to latest message' })).toBeVisible();

    await page.getByRole('button', { name: 'Jump to latest message' }).click();
    await expect.poll(async () => transcript.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThanOrEqual(8);
    await expect(page.getByText('streamed segment 4.', { exact: false })).toBeVisible();

    await ensureSidebarOpen(page);
    await page.getByRole('button', { name: 'Second conversation', exact: true }).click();
    await expect(page.getByText('Second session answer', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Jump to latest message' })).toHaveCount(0);
    await expect.poll(async () => transcript.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThanOrEqual(8);
  } finally {
    streamResponse?.end();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
