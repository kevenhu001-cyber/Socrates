import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';
import { ensureSidebarOpen } from './_universal-helpers.mjs';

// Contract server for the file library: list, authenticated raw fetch, text
// preview and delete. No production backend or credentials are contacted.
test('universal files list stored uploads, preview, delete and open from the transcript', async ({ page }, testInfo) => {
  const a = '11111111-1111-4111-8111-111111111111';
  const img = '44444444-4444-4444-8444-444444444444';
  const txt = '55555555-5555-4555-8555-555555555555';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const rows = [
    { id: img, name: 'plot.png', mimeType: 'image/png', size: 2048, kind: 'image', sessionId: a, uploadedAt: '2026-10-07T00:00:00.000Z' },
    { id: txt, name: 'notes.txt', mimeType: 'text/plain', size: 13, kind: 'text', sessionId: a, uploadedAt: '2026-10-06T00:00:00.000Z' },
  ];
  const records = new Map([[a, {
    id: a, topic: '', title: 'File conversation', mode: 'chat', phase: 'chat', projectId: null,
    messages: [
      { clientId: 'user-1', role: 'user', rawText: 'Look at this', attachments: [{ id: 'attach-1', kind: 'image', name: 'plot.png', mime: 'image/png', size: 2048, fileId: img }] },
      { clientId: 'assistant-1', role: 'assistant', rawText: 'Here is the plot:\n\n![plot](/api/files/' + img + '/raw)\n\nAnd notes are attached.' },
    ],
  }]]);
  const deletes = []; let rawRequests = 0; const errors = [];
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
    if (url.pathname.endsWith('/files') && req.method === 'GET') return json({ files: rows, nextCursor: null });
    if (url.pathname.endsWith(`/files/${img}/raw`) && req.method === 'GET') {
      rawRequests += 1;
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      res.end(png);
      return;
    }
    if (url.pathname.endsWith(`/files/${txt}/content`) && req.method === 'GET') {
      return json({ ok: true, id: txt, name: 'notes.txt', mimeType: 'text/plain', kind: 'text', text: 'hello library', truncated: false });
    }
    if (url.pathname.endsWith(`/files/${txt}`) && req.method === 'DELETE') {
      deletes.push(txt);
      res.writeHead(204); res.end();
      return;
    }
    if (url.pathname.endsWith('/sessions') && req.method === 'GET') return json({ sessions: url.searchParams.get('archived') === 'true' ? [] : [...records.values()].map(({ messages, ...row }) => row), nextCursor: null });
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

    // The file library is the sidebar's Library nav row (baseline chrome).
    async function openLibrary() {
      await ensureSidebarOpen(page);
      const row = page.getByRole('button', { name: 'Library' });
      await row.click();
    }

    await openLibrary();
    await expect(page.getByText('plot.png')).toBeVisible();
    await expect(page.getByText('notes.txt')).toBeVisible();
    await page.getByRole('button', { name: 'notes.txt', exact: true }).click();
    await expect(page.getByText('hello library')).toBeVisible();
    await page.getByRole('button', { name: 'Close preview' }).click();
    await page.getByRole('button', { name: 'Delete notes.txt' }).click();
    await page.getByRole('button', { name: 'Confirm delete notes.txt' }).click();
    await expect(page.getByText('notes.txt')).toHaveCount(0);
    expect(deletes).toEqual([txt]);

    // Transcript: the file-backed attachment and markdown image resolve.
    await page.getByRole('button', { name: 'Back to chat' }).click();
    await ensureSidebarOpen(page);
    const target = page.getByRole('button', { name: 'File conversation', exact: true });
    await target.click();
    await expect(page.getByRole('button', { name: 'Open plot.png' })).toBeVisible();
    await expect.poll(() => rawRequests).toBeGreaterThan(0);
    await expect(page.getByLabel('plot', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Open plot.png' }).click();
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
    await expect(page.getByLabel('plot.png', { exact: true }).last()).toBeVisible();
    await page.getByRole('button', { name: 'Close preview' }).click();
    await expect(page.getByRole('button', { name: 'Download' })).toHaveCount(0);
    await expect(page.getByLabel('plot', { exact: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/universal-files-${encodeURIComponent(testInfo.project.name)}.png`, fullPage: false });
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      // The mobile browser may keep an API keep-alive socket open after the
      // final screenshot; close it so a completed test cannot time out in teardown.
      server.closeAllConnections();
    });
  }
});
