import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';
import { ensureSidebarOpen } from './_universal-helpers.mjs';

// Edit / regenerate / branch / retry over real HTTP + SSE. The contract
// server owns sessions, message PATCH/DELETE and scripted streams; no LLM,
// production backend or credentials are contacted.
test('universal edit rewrites a turn, regenerates, branches and retries a failed stream', async ({ page }, testInfo) => {
  const records = new Map();
  const patchCalls = [];
  const deleteCalls = [];
  let counter = 0;
  const uuid = () => `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa0${counter++}`;
  const streams = [];
  const answers = ['First answer', 'Edited answer', 'Regenerated answer', 'Flaky-ignored', 'Retried answer'];
  let streamCount = 0;
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
    const messageMatch = url.pathname.match(/\/messages\/([^/]+)$/);
    if (messageMatch) {
      const mid = decodeURIComponent(messageMatch[1]);
      if (req.method === 'PATCH') {
        patchCalls.push({ id: mid, sessionId: url.searchParams.get('sessionId'), body: payload });
        for (const session of records.values()) {
          const row = (session.messages || []).find((m) => m.clientId === mid || m.id === mid);
          if (row) row.rawText = payload.content;
        }
        return json({ ok: true });
      }
      if (req.method === 'DELETE') {
        deleteCalls.push({ id: mid, sessionId: url.searchParams.get('sessionId') });
        for (const session of records.values()) {
          session.messages = (session.messages || []).filter((m) => m.clientId !== mid && m.id !== mid);
        }
        return json({ ok: true });
      }
    }
    if (url.pathname.endsWith('/chat/stream')) {
      if (!records.has(payload.sessionId)) return json({ message: 'Invalid or unowned session ID' }, 400);
      if (payload.messages?.[0]?.role !== 'system') return json({ message: 'Missing tone system prompt' }, 400);
      const n = streamCount++;
      const answer = answers[n];
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      streams.push(res);
      if (n === 3) {
        // Mid-stream kill: the first byte is already on the wire, so the
        // transport cannot silently replay the POST — the turn must fail
        // and offer Retry. (Killing before the first byte lets Chromium
        // replay small uploads invisibly; covered by unit tests instead.)
        res.write(`data: {"choices":[{"delta":{"content":"Flaky part"}}]}\n\n`);
        return;
      }
      res.end(`data: {"choices":[{"delta":{"content":${JSON.stringify(answer)}}}]}\n\ndata: [DONE]\n\n`);
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
    async function row(name) {
      await ensureSidebarOpen(page);
      // Session rows can share their name with the sidebar action (a fresh
      // session keeps the 'New chat' title): the row always sorts last.
      const target = page.getByRole('button', { name, exact: true }).last();
      await target.click();
    }
    const composer = page.getByLabel('Ask Socrates', { exact: true });
    const send = page.getByRole('button', { name: 'Send message' });
    // The composer swaps Send/Stop with the turn: Send visible means idle.
    const idle = () => expect(send).toBeVisible();

    // Fresh turn.
    await row('New chat');
    await composer.fill('First question');
    await send.click();
    await expect(page.getByText('First answer', { exact: true })).toBeVisible();
    await idle();

    // Edit: the turn text lands in the composer; Send rewrites + re-asks.
    await page.getByRole('button', { name: 'Edit message' }).first().click();
    await expect(composer).toHaveValue('First question');
    await composer.fill('Edited question');
    await send.click();
    await expect(page.getByText('Edited answer', { exact: true })).toBeVisible();
    await expect(page.getByText('First answer', { exact: true })).toHaveCount(0);
    await idle();
    expect(patchCalls.length).toBe(1);
    expect(patchCalls[0].body.content).toBe('Edited question');
    expect(patchCalls[0].body.discardFollowing).toBe(true);

    // Regenerate: same text, stale tail cleaned server-side, fresh reply.
    await page.getByRole('button', { name: 'Regenerate' }).first().click();
    await expect(page.getByText('Regenerated answer', { exact: true })).toBeVisible();
    await expect(page.getByText('Edited answer', { exact: true })).toHaveCount(0);
    await idle();
    expect(patchCalls.length).toBe(2);
    expect(patchCalls[1].body.content).toBe('Edited question');

    // Branch: fork at the first turn into a new session. The fresh
    // session keeps its 'New chat' title, so the fork is unambiguous.
    await page.getByRole('button', { name: 'Branch from here' }).first().click();
    await row('New chat (branch)');
    await expect(page.getByText('Edited question', { exact: true }).first()).toBeVisible();
    // Branching at the assistant reply keeps that anchor and its preceding
    // user turn in the forked transcript.
    await expect(page.getByText('Regenerated answer', { exact: true })).toBeVisible();

    // Back in the main session, a stream that dies without [DONE] surfaces
    // the error row with Retry; retrying replays the last user turn.
    await row('New chat');
    await composer.fill('Flaky question');
    await send.click();
    await expect.poll(() => streams.length).toBe(4);
    await expect(page.getByText('Flaky part', { exact: true })).toBeVisible();
    streams[3].destroy();
    const retry = page.getByRole('button', { name: 'Retry', exact: true });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(page.getByText('Retried answer', { exact: true })).toBeVisible();
    await expect(page.getByText('Flaky part', { exact: true })).toHaveCount(0);
    await expect(retry).toHaveCount(0);

    expect(deleteCalls.length).toBe(0);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/universal-edit-${encodeURIComponent(testInfo.project.name)}.png`, fullPage: false });
  } finally {
    for (const stream of streams) { try { stream.destroy(); } catch { /* already closed */ } }
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  }
});
