import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';
import { ensureSidebarOpen } from './_universal-helpers.mjs';

// Assistant (persona) binding: picker sheet + session-level assistantId on
// save/stream/PATCH, plus the Assistants screen behind Manage (create, use
// with starter, delete). All state is mocked — no LLM or real backend.
test('universal assistant binds a persona to the session', async ({ page }, testInfo) => {
  const records = new Map();
  let idCounter = 0;
  const uuid = () => `bbbbbbbb-bbbb-4bbb-8bbb-${String(idCounter++).padStart(12, '0')}`;
  const assistants = new Map([
    ['a1', { id: 'a1', title: 'Coach', source: JSON.stringify({ description: 'Strict but kind', instructions: 'Be brief', starter: 'Warm up!' }) }],
  ]);
  const savePayloads = [];
  const patchPayloads = [];
  const streamPayloads = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const savedSessionId = uuid();
  records.set(savedSessionId, {
    id: savedSessionId, title: 'Saved chat', topic: '', mode: 'chat', phase: 'chat',
    messages: [], updatedAt: new Date().toISOString(),
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
    if (url.pathname.endsWith('/creations/items/assistants')) {
      if (req.method === 'GET') return json({ items: [...assistants.values()] });
      const created = { id: `a${assistants.size + 1}`, title: payload.title, source: payload.source };
      assistants.set(created.id, created);
      return json(created, 201);
    }
    if (url.pathname.includes('/creations/items/assistants/')) {
      const id = url.pathname.split('/').at(-1);
      if (req.method === 'DELETE') { assistants.delete(id); res.writeHead(204); res.end(); return; }
      const row = assistants.get(id);
      const updated = { ...row, ...payload, id };
      assistants.set(id, updated);
      return json(updated);
    }
    if (url.pathname.endsWith('/sessions')) {
      if (req.method === 'GET') return json({ sessions: url.searchParams.get('archived') === 'true' ? [] : [...records.values()].map(({ messages, ...row }) => row), nextCursor: null });
      savePayloads.push(payload);
      const id = /^[0-9a-f-]{36}$/.test(payload.id || '') ? payload.id : uuid();
      records.set(id, { ...payload, id });
      return json({ id, title: payload.title });
    }
    if (url.pathname.endsWith('/chat/stream')) {
      streamPayloads.push(payload);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.end('data: {"choices":[{"delta":{"content":"Assistant reply"}}]}\n\ndata: [DONE]\n\n');
      return;
    }
    const patchMatch = /\/sessions\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (patchMatch && req.method === 'PATCH') {
      patchPayloads.push({ id: patchMatch[1], payload });
      records.set(patchMatch[1], { ...records.get(patchMatch[1]), ...payload });
      return json(records.get(patchMatch[1]));
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

    const openPicker = async () => {
      await ensureSidebarOpen(page);
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByRole('button', { name: 'Choose assistant', exact: true }).click();
    };
    await ensureSidebarOpen(page);

    // Server-owned session: binding PATCHes the row, then mirrors locally.
    await page.getByRole('button', { name: 'Saved chat', exact: true }).click();
    await openPicker();
    await expect(page.getByRole('button', { name: 'Use Coach' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use No assistant' })).toBeVisible();
    await page.getByRole('button', { name: 'Use Coach' }).click();
    await expect.poll(() => patchPayloads.length).toBe(1);
    expect(patchPayloads[0]).toMatchObject({ id: savedSessionId, payload: { assistantId: 'a1' } });

    // A fresh chat starts unbound (session-level binding, parity with the web
    // baseline clearing the active assistant on reset).
    await ensureSidebarOpen(page);
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    await openPicker();
    await page.getByRole('button', { name: 'Use Coach' }).click();
    await page.getByLabel('Ask Socrates', { exact: true }).fill('Hello persona');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Assistant reply', { exact: true }).first()).toBeVisible();
    expect(savePayloads.at(-1)?.assistantId).toBe('a1');
    expect(streamPayloads.at(-1)?.assistantId).toBe('a1');

    // Manage → create → use (starter lands in the composer) → delete.
    await openPicker();
    await page.getByRole('button', { name: 'Manage assistants' }).click();
    await expect(page.getByRole('button', { name: 'Start chat with Coach' })).toBeVisible();
    await page.getByRole('button', { name: 'Create assistant' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Tutor');
    await page.getByLabel('Instructions', { exact: true }).fill('Go slow');
    await page.getByLabel('Conversation starter', { exact: true }).fill('Let us begin!');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start chat with Tutor' })).toBeVisible();
    await page.getByRole('button', { name: 'Start chat with Tutor' }).click();
    await expect(page.getByLabel('Ask Socrates', { exact: true })).toHaveValue('Let us begin!');
    await openPicker();
    await page.getByRole('button', { name: 'Manage assistants' }).click();
    await page.getByRole('button', { name: 'Delete Tutor' }).click();
    await page.getByRole('button', { name: 'Confirm delete Tutor' }).click();
    await expect(page.getByRole('button', { name: 'Start chat with Tutor' })).toHaveCount(0);
    await expect(page.getByText('🎭 Tutor ▾')).toHaveCount(0);

    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/universal-assistant-${encodeURIComponent(testInfo.project.name)}.png`, fullPage: false });
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  }
});
