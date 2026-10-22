import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export async function startSite() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  const baseURL = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [fileURLToPath(new URL('../../serve.cjs', import.meta.url)), String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Marketing site server did not start')), 10_000);
      let output = '';
      server.stdout.on('data', (chunk) => {
        output += chunk;
        if (output.includes(baseURL)) { clearTimeout(timeout); resolve(); }
      });
      server.once('error', (error) => { clearTimeout(timeout); reject(error); });
      server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Marketing site server exited: ${code}`)); });
    });
    browser = await chromium.launch();
    return { browser, server, baseURL };
  } catch (error) {
    await stopSite({ browser, server });
    throw error;
  }
}

export async function stopSite({ browser, server } = {}) {
  try { await browser?.close(); } finally {
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
  }
}

export async function sitePage(site, t, path, width, javaScriptEnabled = true) {
  const context = await site.browser.newContext({
    viewport: { width, height: 900 }, reducedMotion: 'reduce', javaScriptEnabled,
  });
  t.after(() => context.close());
  // Keep static UI checks deterministic and independent of third-party fonts.
  await context.route('https://**/*', (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().startsWith(site.baseURL) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  const response = await page.goto(site.baseURL + path);
  assert.equal(response.status(), 200);
  await page.evaluate(() => document.fonts.ready);
  if (javaScriptEnabled) {
    await page.locator('[data-consent-choice="essential"]').click();
    await page.locator('.site-header[data-chrome-ready]').waitFor();
  }
  t.after(() => assert.deepEqual(errors, [], `Browser/resource errors on ${path}`));
  return page;
}
