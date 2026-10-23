import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { sitePage, startSite, stopSite } from './helpers/site-browser.mjs';

// Browser geometry for the editorial homepage and unchanged shared chrome.
// Run with npm run test:site:home (requires Playwright Chromium).
let site;
before(async () => { site = await startSite(); });
after(async () => { await stopSite(site); });

for (const path of ['/', '/zh/']) {
  for (const width of [320, 390, 560]) {
    test(`${path} at ${width}px: artwork and the complete learning example reflow without clipping`, async (t) => {
      const page = await sitePage(site, t, path, width);
      const layout = await page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
        const map = rect('.demo-map-canvas');
        const nodes = [...document.querySelectorAll('.demo-node')].map((node) => node.getBoundingClientRect());
        return {
          viewport: innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          title: rect('h1'),
          art: rect('.hero-art'),
          copy: rect('.home-hero-inner'),
          action: rect('.hero-actions .home-button'),
          frame: rect('.feature-media'),
          map: rect('.demo-map'),
          nodesFit: nodes.every((node) => node.left >= map.left - 1 && node.right <= map.right + 1),
          messages: [...document.querySelectorAll('.demo-msg')].filter((node) => node.checkVisibility()).length,
          indexWidth: parseFloat(getComputedStyle(document.querySelector('.news-item')).gridTemplateColumns),
        };
      });
      assert.equal(layout.pageWidth, layout.viewport);
      assert.ok(layout.art.y >= layout.copy.y + layout.copy.height, 'phone art follows the proposition, not beside an unreadably narrow title');
      assert.ok(layout.art.x >= 0 && layout.art.right <= width);
      assert.ok(layout.action.bottom < 500, 'the primary action remains above the artwork on phones');
      assert.equal(layout.messages, 4, 'the learner correction remains visible');
      assert.ok(layout.nodesFit);
      assert.ok(layout.map.bottom <= layout.frame.bottom + 1);
      assert.ok(layout.indexWidth <= 30);

      await page.locator('.hero-actions .home-text-link').click();
      await page.waitForFunction(() => {
        const top = document.querySelector('#learning-session').getBoundingClientRect().top;
        return top >= 64 && top < 150;
      });
      await page.locator('[data-ask-chip]').last().focus();
      assert.ok(await page.locator('[data-ask-chip]').last().evaluate((node) => document.activeElement === node));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    });
  }

  test(`${path}: desktop has one dominant illustration and a readable product sheet`, async (t) => {
    const page = await sitePage(site, t, path, 1440);
    const geometry = await page.evaluate(() => {
      const copy = document.querySelector('.home-hero-inner').getBoundingClientRect();
      const art = document.querySelector('.hero-art').getBoundingClientRect();
      const intro = document.querySelector('.feature-intro').getBoundingClientRect();
      const preview = document.querySelector('.feature-main').getBoundingClientRect();
      return {
        sideBySide: art.left >= copy.right,
        artWidth: art.width,
        actionBottom: document.querySelector('.hero-actions').getBoundingClientRect().bottom,
        titleSize: parseFloat(getComputedStyle(document.querySelector('h1')).fontSize),
        previewBesideIntro: preview.left >= intro.right,
        previewWidth: preview.width,
        sheetColour: getComputedStyle(document.querySelector('.feature-media')).backgroundColor,
        groundColour: getComputedStyle(document.querySelector('.home-feature')).backgroundColor,
        tutorSize: parseFloat(getComputedStyle(document.querySelector('.demo-tutor-body p')).fontSize),
      };
    });
    assert.ok(geometry.sideBySide);
    assert.ok(geometry.artWidth >= 500 && geometry.artWidth <= 650);
    assert.ok(geometry.actionBottom < 800);
    assert.ok(geometry.titleSize >= 60);
    assert.ok(geometry.previewBesideIntro && geometry.previewWidth >= 650);
    assert.notEqual(geometry.sheetColour, geometry.groundColour, 'depth comes from a foreground sheet on a distinct ground');
    assert.ok(geometry.tutorSize >= 16);
    assert.equal(await page.locator('canvas, [data-art], .feature-rail').count(), 0);
    assert.equal(await page.locator('.site-footer-grid').evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length), 5);
    assert.equal(await page.locator('details.site-footer-col[open]').count(), 5);
    assert.ok(!(await page.locator('.site-footer-summary').first().isVisible()));
  });

  test(`${path}: mobile footer is compact, keyboard-operable and keeps every destination`, async (t) => {
    const page = await sitePage(site, t, path, 390);
    const groups = page.locator('details.site-footer-col');
    const summaries = page.locator('.site-footer-summary');
    assert.equal(await groups.count(), 5);
    assert.equal(await summaries.count(), 5);
    assert.equal(await page.locator('.site-footer-grid a').count(), 36);
    assert.equal(await page.locator('details.site-footer-col[open]').count(), 0);
    assert.ok((await page.locator('.site-footer').boundingBox()).height < 720);

    await summaries.first().focus();
    await page.keyboard.press('Enter');
    assert.equal(await groups.first().getAttribute('open'), '');
    assert.ok(await groups.first().locator('a').first().isVisible());
    assert.equal(await groups.first().locator('a').first().getAttribute('href'), path === '/' ? '/guide' : '/zh/guide');
    await page.keyboard.press('Enter');
    assert.equal(await groups.first().getAttribute('open'), null);
    assert.ok(!(await groups.first().locator('a').first().isVisible()));

    await summaries.last().click();
    await groups.last().locator('a').first().focus();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(() => document.querySelectorAll('details.site-footer-col[open]').length === 5);
    assert.ok(!(await summaries.first().isVisible()));
    assert.equal(await page.locator('.site-footer-grid a').evaluateAll((links) => links.filter((link) => link.checkVisibility()).length), 36);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelectorAll('details.site-footer-col[open]').length === 0);
    assert.ok(await summaries.last().evaluate((summary) => document.activeElement === summary));
  });

  test(`${path}: no-JS footer links remain available in a two-column phone layout`, async (t) => {
    const page = await sitePage(site, t, path, 390, false);
    const fallback = await page.locator('.site-footer-grid').evaluate((grid) => ({
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      links: [...grid.querySelectorAll('a')].filter((link) => link.checkVisibility()).length,
    }));
    assert.equal(fallback.columns, 2);
    assert.equal(fallback.links, 36);
    assert.ok(await page.locator('.hero-actions .home-button').isVisible());
  });
}

for (const width of [561, 760, 761, 900, 1180, 1181, 1920]) {
  test(`${width}px: breakpoint boundaries contain the composition and preserve footer links`, async (t) => {
    const page = await sitePage(site, t, '/', width);
    const layout = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      newsIndex: parseFloat(getComputedStyle(document.querySelector('.news-item')).gridTemplateColumns),
      heroColumns: getComputedStyle(document.querySelector('.home-hero')).gridTemplateColumns.split(' ').length,
      openGroups: document.querySelectorAll('details.site-footer-col[open]').length,
    }));
    assert.equal(layout.pageWidth, width);
    assert.ok(layout.newsIndex <= 30);
    assert.equal(layout.heroColumns, width <= 760 ? 1 : 2);
    assert.equal(layout.openGroups, width <= 760 ? 0 : 5);
  });
}
