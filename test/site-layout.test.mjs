import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { sitePage, startSite, stopSite } from './helpers/site-browser.mjs';

// Browser geometry for the reference-style question homepage and shared chrome.
// Run with npm run test:site:home (requires Playwright Chromium).
let site;
before(async () => { site = await startSite(); });
after(async () => { await stopSite(site); });

for (const path of ['/', '/zh/']) {
  for (const width of [320, 390, 560]) {
    test(`${path} at ${width}px: question, pills and learning cards reflow without clipping`, async (t) => {
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
          composer: rect('.hero-ask .ask-box'),
          suggestions: rect('.hero-ask .ask-suggestions'),
          frame: rect('.feature-media'),
          map: rect('.demo-map'),
          nodesFit: nodes.every((node) => node.left >= map.left - 1 && node.right <= map.right + 1),
          messages: [...document.querySelectorAll('.demo-msg')].filter((node) => node.checkVisibility()).length,
          newsColumns: getComputedStyle(document.querySelector('.news-grid')).gridTemplateColumns.split(' ').length,
        };
      });
      assert.equal(layout.pageWidth, layout.viewport);
      assert.ok(layout.frame.y > layout.suggestions.bottom, 'cards follow the complete question entry');
      assert.ok(layout.art.y > layout.frame.y, 'the supporting art stacks after the preview on phones');
      assert.ok(layout.art.x >= 0 && layout.art.right <= width);
      assert.ok(layout.composer.bottom < 400, 'the composer stays in the first viewport on phones');
      assert.ok(layout.composer.height <= 100, 'the mobile composer matches the compact reference');
      assert.ok(Math.abs(layout.composer.x + layout.composer.width / 2 - width / 2) < 1);
      assert.equal(layout.messages, 4, 'the learner correction remains visible');
      assert.ok(layout.nodesFit);
      assert.ok(layout.map.bottom <= layout.frame.bottom + 1);
      assert.equal(layout.newsColumns, 1);

      await page.locator('.hero-ask .ask-chip--link').click();
      await page.waitForURL(`${site.baseURL}${path === '/' ? '/' : '/zh/'}product`);
      await page.goBack();
      await page.locator('[data-ask-chip]').last().focus();
      assert.ok(await page.locator('[data-ask-chip]').last().evaluate((node) => document.activeElement === node));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    });
  }

  test(`${path}: desktop centers the question above a wide preview and supporting card`, async (t) => {
    const page = await sitePage(site, t, path, 1440);
    const geometry = await page.evaluate(() => {
      const composer = document.querySelector('.hero-ask .ask-box').getBoundingClientRect();
      const art = document.querySelector('.hero-art').getBoundingClientRect();
      const intro = document.querySelector('.feature-intro').getBoundingClientRect();
      const preview = document.querySelector('.feature-main').getBoundingClientRect();
      return {
        centered: Math.abs(composer.x + composer.width / 2 - innerWidth / 2) < 1,
        composerWidth: composer.width,
        composerBottom: composer.bottom,
        artBelowQuestion: art.top > composer.bottom,
        artBesidePreview: art.left > preview.right,
        previewBeforeIntro: preview.bottom <= intro.top,
        titleSize: parseFloat(getComputedStyle(document.querySelector('h1')).fontSize),
        previewRatio: preview.width / art.width,
        previewWidth: preview.width,
        sheetColour: getComputedStyle(document.querySelector('.feature-media')).backgroundColor,
        groundColour: getComputedStyle(document.querySelector('.home-feature')).backgroundColor,
        tutorSize: parseFloat(getComputedStyle(document.querySelector('.demo-tutor-body p')).fontSize),
      };
    });
    assert.ok(geometry.centered);
    // OpenAI-style hero: a 768px composer under a medium 40px question.
    assert.ok(geometry.composerWidth >= 720 && geometry.composerWidth <= 800);
    assert.ok(geometry.composerBottom < 600);
    assert.ok(geometry.titleSize >= 36 && geometry.titleSize <= 44);
    assert.ok(geometry.artBelowQuestion && geometry.artBesidePreview);
    assert.ok(geometry.previewBeforeIntro, 'cards enter the page before the longer product copy');
    assert.ok(geometry.previewRatio >= 2.3 && geometry.previewRatio <= 2.4 && geometry.previewWidth >= 650);
    assert.equal(geometry.groundColour, 'rgba(0, 0, 0, 0)', 'the feature section continues the white page');
    assert.ok(geometry.tutorSize >= 16);
    assert.equal(await page.locator('[data-art], .feature-rail').count(), 0);
    assert.equal(await page.locator('canvas').count(), 0, 'no decorative canvas on the homepage');
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
      newsColumns: getComputedStyle(document.querySelector('.news-grid')).gridTemplateColumns.split(' ').length,
      cardColumns: getComputedStyle(document.querySelector('.feature-layout')).gridTemplateColumns.split(' ').length,
      openGroups: document.querySelectorAll('details.site-footer-col[open]').length,
    }));
    assert.equal(layout.pageWidth, width);
    assert.equal(layout.newsColumns, width <= 760 ? 1 : 3);
    assert.equal(layout.cardColumns, width <= 760 ? 1 : 2);
    assert.equal(layout.openGroups, width <= 760 ? 0 : 5);
  });
}
