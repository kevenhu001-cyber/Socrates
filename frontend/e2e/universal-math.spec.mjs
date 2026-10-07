import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';

// Math / citation / footnote / long-code rendering over real HTTP + SSE.
// No LLM, production backend or credentials are contacted.
test('universal math renders formula cards, strips citations, notes footnotes and collapses long code', async ({ page }, testInfo) => {
  const a = '11111111-1111-4111-8111-111111111111';
  const records = new Map();
  const lines = Array.from({ length: 50 }, (_, i) => `line-${String(i).padStart(2, '0')}`);
  const answer = [
    'Einstein [7] showed $$E = mc^2$$ and noted $E_k$ for kinetics.[^a]',
    '',
    '```python',
    ...lines,
    '```',
    '',
    '[^a]: Newton, 1687.',
  ].join('\n');
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
      if (req.method === 'GET') return json({ sessions: [...records.values()].map(({ messages, ...row }) => row), nextCursor: null });
      const id = records.has(payload.id) ? payload.id : a;
      records.set(id, { ...payload, id });
      return json({ id, title: records.get(id).title });
    }
    if (url.pathname.endsWith('/chat/stream')) {
      if (!records.has(payload.sessionId)) return json({ message: 'Invalid or unowned session ID' }, 400);
      if (payload.messages?.[0]?.role !== 'system') return json({ message: 'Missing tone system prompt' }, 400);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
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
    await expect(page.getByRole('button', { name: 'Open projects' })).toBeVisible();
    const target = page.getByRole('button', { name: 'New chat', exact: true }).first();
    if (!await target.isVisible()) await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await target.click();
    await page.getByLabel('Message Socrates', { exact: true }).fill('Math please');
    await page.getByRole('button', { name: 'Send message' }).click();

    // Display math becomes a card showing the TeX source with an island opener.
    await expect(page.getByText('E = mc^2', { exact: true })).toBeVisible();
    // Inline math stays in the sentence flow as readable source.
    await expect(page.getByText('E_k', { exact: true })).toBeVisible();
    // Citation noise strips (sources live in tool cards); prose survives.
    await expect(page.getByText('Einstein', { exact: false })).toBeVisible();
    await expect(page.getByText('[7]', { exact: false })).toHaveCount(0);
    // Footnote definitions lift into Notes; the raw def line never shows.
    await expect(page.getByText('[^a]:', { exact: true })).toHaveCount(0);
    await expect(page.getByText('[1] Newton, 1687.', { exact: true })).toBeVisible();

    // Long code collapses to the first screenful with an expander.
    await expect(page.getByRole('button', { name: 'Show 20 more lines' })).toBeVisible();
    await expect(page.getByText('line-49', { exact: false })).toHaveCount(0);
    await page.getByRole('button', { name: 'Show 20 more lines' }).click();
    await expect(page.getByText('line-49', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show less' })).toBeVisible();

    // The formula card opens the typeset island (or the source fallback
    // offline); closing returns to the transcript.
    await page.getByRole('button', { name: 'Open Formula in the artifact island' }).click();
    await expect(page.getByRole('button', { name: 'Close preview' })).toBeVisible();
    const island = page.frameLocator('iframe[title^="Artifact"]');
    await expect(island.locator('body')).toContainText(/E = mc|KaTeX/);
    await page.getByRole('button', { name: 'Close preview' }).click();
    await expect(page.getByRole('button', { name: 'Close preview' })).toHaveCount(0);

    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/universal-math-${encodeURIComponent(testInfo.project.name)}.png`, fullPage: false });
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  }
});
