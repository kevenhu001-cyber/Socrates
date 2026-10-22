import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Exercise the published static pages, not an SPA fixture or a copy of the CSS.
// Run with: npm run test:site (requires `npx playwright install chromium`).
let server;
let browser;
let baseURL;

before(async () => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  baseURL = `http://127.0.0.1:${port}`;

  server = spawn(process.execPath, [fileURLToPath(new URL('../serve.cjs', import.meta.url)), String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Marketing site server did not start')), 10_000);
    let output = '';
    server.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes(baseURL)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.once('error', (error) => { clearTimeout(timeout); reject(error); });
    server.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Marketing site server exited with code ${code}`));
    });
  });
  browser = await chromium.launch();
});

after(async () => {
  try {
    await browser?.close();
  } finally {
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
  }
});

async function home(t, path, width, javaScriptEnabled = true) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    reducedMotion: 'reduce',
    javaScriptEnabled,
  });
  t.after(() => context.close());
  const page = await context.newPage();
  const response = await page.goto(baseURL + path);
  assert.equal(response.status(), 200);
  await page.evaluate(() => document.fonts.ready);
  if (javaScriptEnabled) await page.locator('[data-consent-choice="essential"]').click();
  return page;
}

for (const path of ['/', '/zh/']) {
  for (const width of [320, 390, 560]) {
    test(`${path} at ${width}px: featured cards scroll in one row and news keeps a narrow index`, async (t) => {
      const page = await home(t, path, width);
      const geometry = await page.evaluate(() => {
        const rail = document.querySelector('.feature-rail');
        const cards = [...rail.querySelectorAll('.rail-card')].map((card) => {
          const box = card.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        });
        const news = document.querySelector('.news-item');
        return {
          cards,
          railWidth: rail.clientWidth,
          railHeight: rail.getBoundingClientRect().height,
          scrollWidth: rail.scrollWidth,
          indexWidth: parseFloat(getComputedStyle(news).gridTemplateColumns),
          titleOffset: news.querySelector('.news-body').getBoundingClientRect().x - news.getBoundingClientRect().x,
          pageWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
        };
      });
      assert.equal(geometry.cards.length, 3);
      assert.ok(Math.abs(geometry.cards[0].y - geometry.cards[1].y) < 1, 'cards must share a row');
      assert.ok(geometry.cards[1].x > geometry.cards[0].x + geometry.cards[0].width, 'next card sits to the right');
      assert.ok(geometry.cards[1].x < geometry.railWidth, 'the next card should peek into view');
      assert.ok(geometry.scrollWidth > geometry.railWidth, 'rail must scroll horizontally');
      assert.ok(geometry.railHeight < Math.max(...geometry.cards.map((card) => card.height)) + 12, 'rail is only one card tall');
      assert.ok(geometry.indexWidth <= 30, 'news index must not retain the old 120px thumbnail track');
      assert.ok(geometry.titleOffset <= 48, 'news title should use the available phone width');
      assert.equal(geometry.pageWidth, geometry.viewportWidth, 'horizontal overflow stays inside the rail');

      const demo = await page.evaluate(() => {
        const frame = document.querySelector('.feature-media').getBoundingClientRect();
        const followUp = document.querySelector('.demo-tutor-body p');
        return {
          questionSize: parseFloat(getComputedStyle(document.querySelector('.demo-msg--user')).fontSize),
          followUpSize: parseFloat(getComputedStyle(followUp).fontSize),
          sidebarVisible: document.querySelector('.demo-rail').checkVisibility(),
          followUpVisible: followUp.checkVisibility(),
          mapVisible: document.querySelector('.demo-map').checkVisibility(),
          mapBottom: document.querySelector('.demo-map').getBoundingClientRect().bottom,
          frameBottom: frame.bottom,
        };
      });
      assert.ok(demo.questionSize >= 14 && demo.followUpSize >= 14, 'demo copy must be readable, not a scaled desktop thumbnail');
      assert.ok(!demo.sidebarVisible && demo.followUpVisible && demo.mapVisible);
      assert.ok(demo.mapBottom <= demo.frameBottom + 1, 'the connection panel must not be cropped');

      // Links in clipped cards must remain reachable by keyboard, not just swiping.
      await page.locator('.rail-card').last().focus();
      await page.waitForFunction(() => document.querySelector('.feature-rail').scrollLeft > 0);
      const last = await page.locator('.rail-card').last().boundingBox();
      assert.ok(last.x >= -1 && last.x + last.width <= width + 1);
    });
  }

  test(`${path}: mobile footer is compact, keyboard-operable and keeps every destination`, async (t) => {
    const page = await home(t, path, 390);
    const groups = page.locator('details.site-footer-col');
    const summaries = page.locator('.site-footer-summary');
    assert.equal(await groups.count(), 5);
    assert.equal(await summaries.count(), 5);
    assert.equal(await page.locator('.site-footer-grid a').count(), 36, 'do not remove destinations to shorten the footer');
    assert.equal(await page.locator('details.site-footer-col[open]').count(), 0);
    const footer = await page.locator('.site-footer').boundingBox();
    assert.ok(footer.height < 720, `collapsed footer is ${footer.height}px tall`);

    await summaries.first().focus();
    await page.keyboard.press('Enter');
    assert.equal(await groups.first().getAttribute('open'), '');
    assert.ok(await groups.first().locator('a').first().isVisible());
    assert.equal(await groups.first().locator('a').first().getAttribute('href'), path === '/' ? '/guide' : '/zh/guide');
    await page.keyboard.press('Enter');
    assert.equal(await groups.first().getAttribute('open'), null);
    assert.ok(!(await groups.first().locator('a').first().isVisible()));

    await summaries.last().click();
    assert.ok(await groups.last().locator('a').first().isVisible());
    await groups.last().locator('a').first().focus();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(() => document.querySelectorAll('details.site-footer-col[open]').length === 5);
    assert.ok(!(await summaries.first().isVisible()));
    assert.equal(await page.locator('.site-footer-grid a').evaluateAll((links) => links.filter((link) => link.checkVisibility()).length), 36);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelectorAll('details.site-footer-col[open]').length === 0);
    assert.ok(await summaries.first().isVisible());
    assert.ok(await summaries.last().evaluate((summary) => document.activeElement === summary), 'resize returns focus to the summary instead of hiding the focused link');
  });

  test(`${path}: without JavaScript footer links remain available in a two-column mobile layout`, async (t) => {
    const page = await home(t, path, 390, false);
    const fallback = await page.locator('.site-footer-grid').evaluate((grid) => ({
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      links: [...grid.querySelectorAll('a')].filter((link) => link.checkVisibility()).length,
    }));
    assert.equal(fallback.columns, 2);
    assert.equal(fallback.links, 36);
  });

  test(`${path}: desktop balances the featured rail and keeps five open footer columns`, async (t) => {
    const page = await home(t, path, 1440);
    const main = await page.locator('.feature-main').boundingBox();
    const rail = await page.locator('.feature-rail').boundingBox();
    assert.ok(rail.x >= main.x + main.width);
    assert.equal(Math.round(rail.width), 326);
    assert.ok(Math.abs(main.height - rail.height) < 1, 'supporting stories must not leave a tall blank area below the main feature');
    assert.equal(Math.round((await page.locator('.rail-media').first().boundingBox()).width), 128);
    const lastCard = await page.locator('.rail-card').last().boundingBox();
    assert.ok(Math.abs(lastCard.y + lastCard.height - main.y - main.height) < 1, 'the last supporting story ends at the main caption baseline');
    assert.ok(await page.locator('.demo-rail').isVisible(), 'desktop retains the complete product preview');
    assert.equal(await page.locator('.site-footer-grid').evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length), 5);
    assert.equal(await page.locator('details.site-footer-col[open]').count(), 5);
    assert.ok(!(await page.locator('.site-footer-summary').first().isVisible()));
  });
}

for (const width of [561, 760, 761, 1180, 1181, 1920]) {
  test(`${width}px: responsive boundaries keep the page contained and footer destinations available`, async (t) => {
    const page = await home(t, '/', width);
    const layout = await page.evaluate(() => {
      const rail = document.querySelector('.feature-rail');
      const main = document.querySelector('.feature-main').getBoundingClientRect();
      const last = rail.lastElementChild.getBoundingClientRect();
      return {
        newsIndex: parseFloat(getComputedStyle(document.querySelector('.news-item')).gridTemplateColumns),
        railColumns: getComputedStyle(rail).gridTemplateColumns.split(' ').length,
        mainHeight: main.height,
        railHeight: rail.getBoundingClientRect().height,
        lastBottom: last.bottom,
        mainBottom: main.bottom,
        pageWidth: document.documentElement.scrollWidth,
        openGroups: document.querySelectorAll('details.site-footer-col[open]').length,
      };
    });
    assert.ok(layout.newsIndex <= 30);
    assert.equal(layout.pageWidth, width);
    assert.equal(layout.openGroups, width <= 760 ? 0 : 5);
    if (width <= 1180) {
      assert.equal(layout.railColumns, 3, 'mid-size layouts keep all supporting stories in one grid row');
    } else {
      assert.ok(Math.abs(layout.mainHeight - layout.railHeight) < 1);
      assert.ok(Math.abs(layout.lastBottom - layout.mainBottom) < 1);
    }
  });
}
