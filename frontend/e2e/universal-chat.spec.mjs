import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';

// Real HTTP chunks exercise fetch/SSE, UUID adoption and persistence. No LLM,
// production backend or credentials are contacted by this contract server.
test('universal chat refreshes, saves, isolates streams and restores server history', async ({ page }, testInfo) => {
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  const p = '33333333-3333-4333-8333-333333333333';
  const records = new Map([[b, { id: b, topic: '', title: 'Other conversation', mode: 'chat', phase: 'chat', projectId: p, messages: [{ role: 'assistant', rawText: 'Other answer', clientId: 'other' }] }]]);
  const ending = ' and last chunk\n\n## Structured answer\n\n**Bold text**\n\n```js\nconst answer = 42;\n```\n\n> Quoted explanation\n\n| Key | Value |\n| - | - |\n| answer | 42 |';
  let stream; let refreshes = 0; const saved = []; const errors = [];
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
    if (url.pathname.endsWith('/auth/mobile/refresh')) { refreshes++; return json({ accessToken: 'rotated', refreshToken: 'next-refresh', expiresAt: new Date(Date.now() + 600_000).toISOString() }); }
    if (req.headers.authorization !== 'Bearer rotated') return json({ message: 'Unauthorized' }, 401);
    if (url.pathname.endsWith('/auth/me')) return json({ user: { id: 'account', email: 'test@example.com', displayName: 'Test' } });
    if (url.pathname.endsWith('/projects')) return json({ projects: [{ id: p, name: 'Owned project' }] });
    if (url.pathname.endsWith('/creations/items/assistants')) return json({ items: [] });
    if (url.pathname.endsWith(`/projects/${p}`) && req.method === 'DELETE') {
      for (const [id, session] of records) if (session.projectId === p) records.delete(id);
      res.writeHead(204); res.end(); return;
    }
    if (url.pathname.endsWith('/sessions')) {
      if (req.method === 'GET') {
        const sessions = url.searchParams.get('archived') === 'true' ? [] : [...records.values()].map(({ messages, ...row }) => row);
        return json({ sessions, nextCursor: null });
      }
      const id = records.has(payload.id) ? payload.id : a;
      records.set(id, { ...payload, id, title: id === a ? 'Saved conversation' : payload.title });
      saved.push(structuredClone(records.get(id))); return json({ id, title: records.get(id).title });
    }
    if (url.pathname.endsWith('/chat/stream')) {
      if (!records.has(payload.sessionId) || payload.sessionId !== a) return json({ message: 'Invalid or unowned session ID' }, 400);
      // Tone parity: the default scholar voice leads as the system message.
      if (payload.messages?.[0]?.role !== 'system' || !String(payload.messages[0].content).includes('scholar')) {
        return json({ message: 'Missing tone system prompt' }, 400);
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      stream = res;
      res.write('data: {"choices":[{"delta":{"reasoning_content":"Reasoning only"}}]}\n\n');
      res.write('event: tool_use\ndata: [{"id":"tool-1","name":"web_search","input":{"query":"algebra"}}]\n\n');
      res.write('event: tool_result\ndata: {"id":"tool-1","ok":true,"output":"Found result"}\n\n');
      res.write('event: tool_use\ndata: [{"id":"viz-1","name":"render_visualization","input":{"version":1,"template":"bar","title":"Bar demo","accessibilitySummary":"Two bars","payload":{"categories":["A","B"],"series":[{"data":[1,2]}]}}}]\n\n');
      res.write('event: tool_result\ndata: {"id":"viz-1","ok":true,"output":"Visualization ready","visualization":{"version":1,"template":"bar","title":"Bar demo","accessibilitySummary":"Two bars","payload":{"categories":["A","B"],"series":[{"data":[1,2]}]}}}\n\n');
      res.write('data: {"choices":[{"delta":{"content":"First chunk"}}]}\n\n');
      return;
    }
    const id = url.pathname.split('/').at(-1);
    if (records.has(id)) return json(records.get(id));
    return json({ message: 'Not found' }, 404);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4176, '127.0.0.1', resolve); });
  try {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      // Runs in every frame, including the sandboxed artifact island where
      // storage is intentionally unreachable.
      try {
        if (!localStorage.getItem('socrates.auth.tokens')) localStorage.setItem('socrates.auth.tokens', JSON.stringify({ accessToken: 'expired', refreshToken: 'old-refresh', expiresAt: '2000-01-01' }));
      } catch { /* sandboxed frame */ }
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Choose model' })).toBeVisible({ timeout: 20000 });
    async function row(name) {
      const target = page.getByRole('button', { name, exact: true });
      if (!await target.isVisible()) await page.getByRole('button', { name: 'Toggle sidebar' }).click();
      await target.click();
    }
    await row('New chat');
    await page.getByLabel('Ask Socrates', { exact: true }).fill('Question');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('First chunk', { exact: true })).toBeVisible();
    expect(refreshes).toBe(1); expect(saved[0].id).toBe(a);
    await row('Other conversation');
    await expect(page.getByText('Other answer', { exact: true })).toBeVisible();
    stream.write(`data: ${JSON.stringify({ choices: [{ delta: { content: ending } }] })}\n\n`);
    stream.end('data: [DONE]\n\n');
    await expect.poll(() => saved.length).toBe(2);
    await expect(page.getByText('Other answer', { exact: true })).toBeVisible();
    await expect(page.getByText('First chunk and last chunk', { exact: true })).toHaveCount(0);
    const assistant = records.get(a).messages.at(-1);
    expect(assistant.rawText).toBe(`First chunk${ending}`); expect(assistant.reasoningContent).toBe('Reasoning only'); expect(assistant.toolCalls[0].output).toBe('Found result');
    await page.reload(); await row('Saved conversation');
    await expect(page.getByText('First chunk and last chunk', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Structured answer' })).toBeVisible();
    await expect(page.getByText('const answer = 42;', { exact: true })).toBeVisible();
    await expect(page.getByText('Reasoning only', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Toggle reasoning' }).click();
    await expect(page.getByText('Reasoning only', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Toggle web_search details' }).click();
    await expect(page.getByText('Found result', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Copy code' }).click();
    await expect(page.getByText('Copied', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('const answer = 42;');
    // Visualization tool results render a card; the heavy document lives in
    // the sandboxed island and posts back over the artifact bridge.
    const artifactButton = page.getByRole('button', { name: 'Open Bar demo in the artifact island' });
    await expect(artifactButton).toBeVisible();
    await artifactButton.click();
    const island = page.frameLocator('iframe[title^="Artifact"]');
    await expect(island.getByRole('heading', { name: 'Bar demo' })).toBeVisible();
    await expect(island.locator('.artifact-summary')).toHaveText('Two bars');
    await expect(island.locator('svg')).toBeVisible();
    await page.getByRole('button', { name: 'Close preview' }).click();
    await expect(page.getByRole('button', { name: 'Close preview' })).toHaveCount(0);
    // Read-aloud renders per assistant message and never throws page-side.
    await page.getByRole('button', { name: 'Listen to this message' }).first().click();
    await expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/universal-chat-restored-${encodeURIComponent(testInfo.project.name)}.png`, fullPage: false });
    // Projects live behind the sidebar nav row (baseline chrome).
    const navProjects = page.getByRole('button', { name: 'Open projects' });
    if (!(await navProjects.isVisible())) {
      await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    }
    await navProjects.click();
    await page.getByRole('button', { name: 'Delete Owned project' }).click();
    await expect(page.getByText('Permanently delete this project and its conversations, files and artifacts?')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm delete Owned project' }).click();
    await expect(page.getByRole('button', { name: 'Project Owned project' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to chat' }).click();
    await expect(page.getByRole('button', { name: 'Other conversation', exact: true })).toHaveCount(0);
    expect(records.has(b)).toBe(false); expect(errors).toEqual([]);
  } finally {
    stream?.end(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  }
});
