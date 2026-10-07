import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';

// Tool-card fidelity contract server: persisted search results, interpreter
// output/stderr, stored-file artifacts (image stays inline, HTML opens in the
// island, generic files open in the viewer) and failed tools.
test('universal tool cards render search results, output and stored artifacts', async ({ page }, testInfo) => {
  const a = '11111111-1111-4111-8111-111111111111';
  const img = '66666666-6666-4666-8666-666666666666';
  const html = '77777777-7777-4777-8777-777777777777';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const htmlDoc = '<!DOCTYPE html><html><body><h1>Artifact report</h1></body></html>';
  const fetched = [];
  const records = new Map([[a, {
    id: a, topic: '', title: 'Tool conversation', mode: 'chat', phase: 'chat', projectId: null,
    messages: [{
      clientId: 'assistant-1', role: 'assistant', rawText: 'Tools ran.',
      toolCalls: [
        {
          id: 'search-1', name: 'web_search', input: { query: 'linear algebra' },
          output: 'Long raw search output that is not duplicated above the cards.',
          progressPhase: 'completed', durationMs: 820,
          results: [
            { title: 'Linear algebra - Wikipedia', url: 'https://en.wikipedia.org/wiki/Linear_algebra', snippet: 'Linear algebra is the branch of mathematics concerning linear equations.', source: 'duckduckgo' },
            { title: 'Khan Academy', url: 'https://www.khanacademy.org/math/linear-algebra', snippet: 'Vectors, matrices, and linear transformations.' },
          ],
        },
        {
          id: 'code-1', name: 'code_interpreter', input: { language: 'python', code: 'import matplotlib\nprint(42)' },
          output: '42', stderr: 'warning: deprecated', progressPhase: 'completed', durationMs: 1500,
          artifacts: [
            { id: img, mimeType: 'image/png', name: 'figure.png' },
            { id: html, mimeType: 'text/html', name: 'report.html' },
          ],
        },
        {
          id: 'fail-1', name: 'web_fetch', input: { url: 'https://bad.example' },
          isError: true, progressPhase: 'failed', errorText: 'timeout', retryable: true,
          userMessage: '抓取失败，请稍后重试。',
        },
      ],
    }],
  }]]);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Accept');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url, 'http://127.0.0.1:4176');
    const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (url.pathname.endsWith('/auth/mobile/refresh')) return json({ accessToken: 'rotated', refreshToken: 'next-refresh', expiresAt: new Date(Date.now() + 600_000).toISOString() });
    if (req.headers.authorization !== 'Bearer rotated') return json({ message: 'Unauthorized' }, 401);
    if (url.pathname.endsWith('/auth/me')) return json({ user: { id: 'account', email: 'test@example.com', displayName: 'Test' } });
    if (url.pathname.endsWith('/projects')) return json({ projects: [] });
    if (url.pathname.endsWith('/files') && req.method === 'GET') return json({ files: [], nextCursor: null });
    if (url.pathname.endsWith(`/files/${img}/raw`)) {
      fetched.push('img');
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      res.end(png);
      return;
    }
    if (url.pathname.endsWith(`/files/${html}/raw`)) {
      fetched.push('html');
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      res.end(htmlDoc);
      return;
    }
    if (url.pathname.endsWith('/sessions') && req.method === 'GET') return json({ sessions: [...records.values()].map(({ messages, ...row }) => row), nextCursor: null });
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
    const target = page.getByRole('button', { name: 'Tool conversation', exact: true });
    if (!await target.isVisible()) await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await target.click();

    // Search card: label, preview, status + duration, results when expanded.
    await expect(page.getByText('Search', { exact: true })).toBeVisible();
    await expect(page.getByText('linear algebra', { exact: true })).toBeVisible();
    await expect(page.getByText('Completed · 820 ms')).toBeVisible();
    await page.getByRole('button', { name: 'Toggle web_search details' }).click();
    await expect(page.getByText('Linear algebra - Wikipedia', { exact: true })).toBeVisible();
    await expect(page.getByText('en.wikipedia.org')).toBeVisible();
    await expect(page.getByText(/branch of mathematics/)).toBeVisible();

    // Interpreter card: output + stderr, image artifact inline, HTML in island.
    await expect(page.getByText('Code', { exact: true })).toBeVisible();
    await expect(page.getByText('python · import matplotlib')).toBeVisible();
    await expect(page.getByText('Completed · 1.5 s')).toBeVisible();
    await page.getByRole('button', { name: 'Toggle code_interpreter details' }).click();
    await expect(page.getByText(/warning: deprecated/)).toBeVisible();
    await expect.poll(() => fetched.includes('img')).toBe(true);
    await expect(page.getByLabel('figure.png', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open figure.png' })).toBeVisible();
    await page.getByRole('button', { name: 'Open report.html in the artifact island' }).click();
    const island = page.frameLocator('iframe[title^="Artifact"]');
    await expect(island.getByRole('heading', { name: 'Artifact report' })).toBeVisible();
    expect(fetched).toContain('html');
    await page.getByRole('button', { name: 'Close preview' }).click();
    await expect(page.getByRole('button', { name: 'Open report.html in the artifact island' })).toBeVisible();

    // Failed card: state + localized message.
    await expect(page.getByText(/Failed/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Toggle web_fetch details' }).click();
    await expect(page.getByText('抓取失败，请稍后重试。', { exact: true })).toBeVisible();

    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/universal-tools-${encodeURIComponent(testInfo.project.name)}.png`, fullPage: false });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
