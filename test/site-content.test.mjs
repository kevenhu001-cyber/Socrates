import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { sitePage, startSite, stopSite } from './helpers/site-browser.mjs';

let site;
before(async () => { site = await startSite(); });
after(async () => { await stopSite(site); });

const slugs = ['memory-recall', 'explanation-evidence', 'honest-pause', 'maps-preserve-path', 'what-learners-keep', 'tutor-curiosity'];
const dates = ['2026-08-12', '2026-07-29', '2026-07-11', '2026-06-24', '2026-04-30', '2026-02-18'];

for (const prefix of ['', '/zh']) {
  for (const kind of ['research', 'about']) {
    const path = `${prefix}/${kind}`;
    for (const width of [320, 390, 760, 761, 1280, 1920]) {
      test(`${path} at ${width}px: reading hierarchy, local fonts and responsive layout`, async (t) => {
        const page = await sitePage(site, t, path, width);
        assert.equal(await page.locator('.content-title').count(), 1);
        assert.equal(await page.locator('h1').count(), 1);
        const geometry = await page.evaluate(() => {
          const nodes = [...document.querySelectorAll('main p, main h1, main h2, main h3')].filter((node) => node.checkVisibility());
          const title = document.querySelector('h1');
          const hero = document.querySelector('.content-hero');
          return {
            width: document.documentElement.scrollWidth,
            font: getComputedStyle(title).fontFamily,
            localChineseFont: Array.from(document.fonts).some((font) => font.family.includes('Noto Sans SC') && font.status === 'loaded'),
            headerHeight: document.querySelector('.site-header').getBoundingClientRect().height,
            heroBottom: hero.getBoundingClientRect().bottom,
            clipped: nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.className),
            bodySize: Math.min(...[...document.querySelectorAll('.research-note-summary, .content-prose, .company-practices p')].map((node) => parseFloat(getComputedStyle(node).fontSize))),
          };
        });
        assert.equal(geometry.width, width);
        assert.equal(geometry.headerHeight, width <= 760 ? 64 : 80);
        assert.match(geometry.font, /Geist Sans/);
        if (prefix) assert.ok(geometry.localChineseFont, 'Chinese content uses the local sans family instead of platform-dependent serif fallback');
        assert.deepEqual(geometry.clipped, [], 'text must wrap rather than be clipped');
        assert.ok(geometry.bodySize >= 15);
        assert.ok(geometry.heroBottom < 650, 'the introduction must not consume the whole first screen');
        const source = await page.content();
        assert.ok(!source.includes('fonts.googleapis.com'), 'these pages use local fonts, not the legacy remote font sheet');
        if (kind === 'research') {
          assert.equal(await page.locator('.research-note').count(), 6);
          if (width <= 560) {
            const filters = await page.locator('[data-research-filters]').evaluate((node) => ({
              columns: getComputedStyle(node).gridTemplateColumns.split(' ').length,
              clipped: [...node.querySelectorAll('button')].some((button) => button.scrollWidth > button.clientWidth),
            }));
            assert.equal(filters.columns, 3, 'phone filters form two balanced rows');
            assert.ok(!filters.clipped, 'filter labels stay readable at narrow widths');
          }
          const first = await page.locator('.research-note').first().boundingBox();
          const title = await page.locator('.research-note h3').first().boundingBox();
          assert.ok(first.y < 650, `first note starts at ${first.y}px`);
          assert.ok(title.y + title.height < 900, 'an article title is readable in the first viewport');
          assert.deepEqual(await page.locator('.research-note time').evaluateAll((nodes) => nodes.map((node) => node.dateTime)), dates);
          assert.deepEqual(await page.locator('.research-note > a').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href'))), slugs.map((slug) => `${prefix}/research/${slug}/`));
        } else {
          assert.ok(await page.locator('.company-visual img').evaluate((image) => image.naturalWidth > 0));
          assert.match(await page.locator('.company-visual figcaption').innerText(), /not a photograph of the Socrates team|并非.*团队.*照片/);
          assert.deepEqual(await page.locator('.company-work-list a').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href'))), ['product', 'research', 'announcements'].map((part) => `${prefix}/${part}`));
          assert.equal(await page.locator('#contact-team a[href^="mailto:"]').getAttribute('href'), 'mailto:help@addtech.site');
          for (const id of ['purpose', 'team', 'approach', 'work', 'contact-team']) assert.equal(await page.locator(`#${id}`).count(), 1);
        }
      });
    }

    test(`${path}: no-JS keeps content, navigation and translated destinations available`, async (t) => {
      const page = await sitePage(site, t, path, 390, false);
      assert.equal(await page.locator('.site-nav a').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).length), 7);
      assert.equal(await page.locator('.site-footer-grid a').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).length), 36);
      assert.equal(await page.locator('.site-header .site-locale').first().getAttribute('href'), prefix ? `/${kind}` : `/zh/${kind}`);
      if (kind === 'research') {
        assert.ok(!(await page.locator('[data-research-filters]').isVisible()), 'do not show dead filter controls when JS is unavailable');
        assert.equal(await page.locator('.research-note').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).length), 6);
        assert.ok(await page.locator('.research-note-summary').last().isVisible());
      } else {
        assert.ok(await page.locator('#team .content-heading').isVisible());
        assert.ok(await page.locator('#contact-team .content-button').isVisible());
      }
    });
  }

  test(`${prefix}/research: keyboard filters, announced counts, and hidden-topic deep links`, async (t) => {
    const page = await sitePage(site, t, `${prefix}/research`, 390);
    const controls = page.locator('[data-research-filters]');
    assert.ok(await controls.isVisible());
    assert.equal(await page.locator('[data-research-count]').getAttribute('role'), 'status');
    for (const [topic, count] of [['memory', 1], ['explanation', 1], ['practice', 2], ['mapping', 1], ['tutoring', 1], ['all', 6]]) {
      const button = controls.locator(`[data-research-filter="${topic}"]`);
      await button.focus();
      await page.keyboard.press('Space');
      assert.equal(await button.getAttribute('aria-pressed'), 'true');
      assert.equal(await controls.locator('[aria-pressed="true"]').count(), 1);
      assert.equal(await page.locator('.research-note:not([hidden])').count(), count);
      assert.match(await page.locator('[data-research-count]').innerText(), new RegExp(String(count)));
      assert.equal(await page.locator('.research-note').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).length), count);
      assert.ok(await button.evaluate((node) => document.activeElement === node));
    }
    await controls.locator('[data-research-filter="memory"]').click();
    await page.evaluate(() => { location.hash = '#mapping'; });
    await page.waitForFunction(() => !document.querySelector('#mapping').hidden);
    await page.waitForFunction(() => document.querySelector('#mapping').getBoundingClientRect().top < 130);
    assert.equal(await page.locator('.research-note:not([hidden])').count(), 6);
    assert.ok((await page.locator('#mapping').boundingBox()).y >= 64);
    await page.locator('.research-note > a').first().click();
    await page.waitForURL(`${site.baseURL}${prefix}/research/memory-recall/`);
    assert.match(await page.locator('h1').innerText(), prefix ? /回到一个想法的路径/ : /The route back to an idea/);
  });

  test(`${prefix}/research: switching language preserves a topic deep link`, async (t) => {
    const page = await sitePage(site, t, `${prefix}/research?ref=notes#practice`, 1280);
    await page.locator('.site-header-actions > .site-locale').click();
    const target = prefix ? '/research' : '/zh/research';
    await page.waitForURL(`${site.baseURL}${target}?ref=notes#practice`);
    await page.locator('.site-header[data-chrome-ready]').waitFor();
    assert.equal(await page.locator('.research-note:not([hidden])').count(), 6);
    assert.ok((await page.locator('#practice').boundingBox()).y >= 64);
  });
}

test('reading-page translations share structure, and index metadata matches the linked articles', async () => {
  for (const kind of ['research', 'about']) {
    const pages = await Promise.all(['', 'zh/'].map((prefix) => readFile(new URL(`../site/${prefix}${kind}.html`, import.meta.url), 'utf8')));
    const structure = (html) => [...html.matchAll(/<(?:section|div|figure|article|ul|li|nav)\b[^>]*class="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(structure(pages[0]), structure(pages[1]));
    for (const prefix of ['', 'zh/']) {
      const markdown = await readFile(new URL(`../site/${prefix}${kind}.md`, import.meta.url), 'utf8');
      assert.match(markdown, /canonical: https:\/\/topodrive.top\//);
    }
  }
  for (const prefix of ['', 'zh/']) {
    const index = await readFile(new URL(`../site/${prefix}research.html`, import.meta.url), 'utf8');
    const minutes = [...index.matchAll(/data-reading-minutes="(\d+)"/g)].map((match) => Number(match[1]));
    // Reading-time estimates can differ between languages; match each article.
    assert.deepEqual(minutes, prefix ? [10, 9, 8, 11, 9, 10] : [7, 6, 5, 8, 6, 7]);
    for (let i = 0; i < slugs.length; i++) {
      const article = await readFile(new URL(`../site/${prefix}research/${slugs[i]}/index.html`, import.meta.url), 'utf8');
      const byline = article.match(/class="ed-(?:report|article)-byline"([\s\S]*?)<\/section>/)?.[1];
      assert.ok(byline, 'article must have source metadata');
      assert.match(byline, new RegExp(`${minutes[i]} (?:min|分钟)`));
      const [year, month, day] = dates[i].split('-').map(Number);
      const expectedDate = prefix ? `${year} 年 ${month} 月 ${day} 日` : new Date(`${dates[i]}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      assert.ok(byline.includes(expectedDate), `publication date must agree for ${prefix}${slugs[i]}`);
      if (!prefix) {
        const markdown = await readFile(new URL(`../site/research/${slugs[i]}/index.md`, import.meta.url), 'utf8');
        const markdownByline = markdown.split('\n').find((line) => line.startsWith('*') && !line.startsWith('**'));
        assert.ok(markdownByline.includes(`${minutes[i]} min`) && markdownByline.includes(expectedDate), 'Markdown byline follows published article metadata');
      }
    }
  }
});


test('Chinese developer quickstart fits a 320px phone and its wide table remains keyboard-scrollable', async (t) => {
  const page = await sitePage(site, t, '/zh/developers', 320);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
  const table = page.locator('.ed-table-wrap');
  assert.ok(await table.evaluate((node) => node.scrollWidth > node.clientWidth));
  await table.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.ed-table-wrap').scrollLeft > 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
});
