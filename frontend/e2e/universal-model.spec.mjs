import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';

// Chat-header model switcher: the chip mirrors the active provider,
// picking another one PATCHes /api-key, Manage leads to providers.
test('universal model switches the active provider from the chat header', async ({ page }, testInfo) => {
  const a = '11111111-1111-4111-8111-111111111111';
  const providers = [
    { id: 'built-in', label: 'Beagle', url: '', model: 'beagle-1', isActive: true, isBuiltIn: true, hasKey: true },
    { id: 'custom', label: 'Custom', url: 'https://custom.example', model: 'custom-1', isActive: false, isBuiltIn: false, hasKey: true },
  ];
  const records = new Map();
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
    if (url.pathname.endsWith('/auth/mobile/refresh')) {
      return json({ accessToken: 'rotated', refreshToken: 'next-refresh', expiresAt: new Date(Date.now() + 600_000).toISOString() });
    }
    if (req.headers.authorization !== 'Bearer rotated') return json({ message: 'Unauthorized' }, 401);
    if (url.pathname.endsWith('/auth/me')) return json({ user: { id: 'account', email: 'test@example.com', displayName: 'Test' } });
    if (url.pathname.endsWith('/projects')) return json({ projects: [] });
    if (url.pathname.endsWith('/api-key')) {
      if (req.method === 'GET') return json({ providers });
      return json({ message: 'Not found' }, 404);
    }
    const keyMatch = url.pathname.match(/\/api-key\/([^/]+)$/);
    if (keyMatch && req.method === 'PATCH') {
      const id = decodeURIComponent(keyMatch[1]);
      patches.push({ id, body: payload });
      for (const row of providers) row.isActive = row.id === id ? !!payload.isActive : (payload.isActive ? false : row.isActive);
      const row = providers.find((r) => r.id === id);
      return json(row || { message: 'Not found' }, row ? 200 : 404);
    }
    if (url.pathname.endsWith('/sessions')) {
      if (req.method === 'GET') return json({ sessions: [...records.values()].map(({ messages, ...row }) => row), nextCursor: null });
      const id = records.has(payload.id) ? payload.id : a;
      records.set(id, { ...payload, id });
      return json({ id, title: records.get(id).title });
    }
    if (url.pathname.endsWith('/chat/stream')) {
      if (!records.has(payload.sessionId)) return json({ message: 'Invalid or unowned session ID' }, 400);
      if (payload.messages?.[0]?.role !== 'system') return json({ message: 'Missing tone system prompt' }, 400);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.end('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n');
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

    // The header chip opens the picker; the server list drives it.
    await page.getByRole('button', { name: 'Choose model' }).click();
    await expect(page.getByText('Beagle', { exact: true })).toBeVisible();
    await expect(page.getByText('Custom', { exact: true })).toBeVisible();

    // Picking Custom activates it server-side and mirrors locally.
    await page.getByRole('button', { name: 'Use Custom' }).click();
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]).toEqual({ id: 'custom', body: { isActive: true } });
    await expect(page.getByText('🤖 Custom ▾', { exact: true })).toBeVisible();

    // Manage leads to the full providers screen.
    await page.getByRole('button', { name: 'Choose model' }).click();
    await page.getByRole('button', { name: 'Manage models & keys' }).click();
    await expect(page.getByText('Models & keys', { exact: true })).toBeVisible();

    // Chat still streams after the switch.
    await page.getByRole('button', { name: 'Back to chat' }).click();
    const newChat = page.getByRole('button', { name: 'New chat', exact: true }).first();
    if (!await newChat.isVisible()) await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await newChat.click();
    await page.getByLabel('Message Socrates', { exact: true }).fill('Hi');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Hello', { exact: true })).toBeVisible();

    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/universal-model-${encodeURIComponent(testInfo.project.name)}.png`, fullPage: false });
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  }
});
