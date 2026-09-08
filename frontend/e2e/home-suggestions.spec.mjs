import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function mockSuggestions(page, body) {
  await page.route('**/api/v2/suggestions/starters**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

test('renders only a complete three-item Beagle result and uses SVG icons', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'zh' });
  await mockSuggestions(page, {
    source: 'ai',
    suggestions: [
      { id: 's1', prompt: '继续分析上周的 Rust 异步运行时对比，并给出结论', icon: 'spark' },
      { id: 's2', prompt: '根据最近的阅读记录，整理一份本周研究计划', icon: 'history' },
      { id: 's3', prompt: '把我保存的储能方向信号汇总成三条行动建议', icon: 'target' },
    ],
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await expect(page.locator('.home-suggestion-item')).toHaveCount(3);
  await expect(page.locator('.home-suggestion-icon svg')).toHaveCount(3);
  await expect(page.locator('.suggestion-emoji')).toHaveCount(0);
  await expect(page.locator('.home-suggestion-text')).toHaveText([
    '继续分析上周的 Rust 异步运行时对比，并给出结论',
    '根据最近的阅读记录，整理一份本周研究计划',
    '把我保存的储能方向信号汇总成三条行动建议',
  ]);

  await page.locator('.home-suggestion-btn').first().click();
  await expect.poll(() => page.evaluate(() => window.__socratesComposerController?.getMarkdown('topic')))
    .toBe('继续分析上周的 Rust 异步运行时对比，并给出结论');
});

test('keeps the block hidden when the server returns no suggestions', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'zh' });
  await mockSuggestions(page, { source: 'empty-no-history', suggestions: [] });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await expect(page.locator('.home-suggestion-item')).toHaveCount(0);
  await expect(page.locator('#homeSuggestionsWrap')).toBeEmpty();
});

test('keeps the block hidden when fewer than three valid suggestions arrive', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'zh' });
  await mockSuggestions(page, {
    source: 'ai',
    suggestions: [
      { id: 's1', prompt: '第一条有效建议', icon: 'spark' },
      { id: 's2', prompt: '第二条有效建议', icon: 'history' },
    ],
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await expect(page.locator('.home-suggestion-item')).toHaveCount(0);
  await expect(page.locator('#homeSuggestionsWrap')).toBeEmpty();
});
