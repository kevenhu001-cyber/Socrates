// Knowledge-map React ownership and store-driven rendering, from the entry point a user actually goes through.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const NODES = [
  { name: '导数', status: 'internalized', confidence_score: 5, questions: 12, system_note: '核心', user_note: '链式法则' },
  { name: '积分', status: 'fuzzy', confidence_score: 3, questions: 6 },
  { name: '级数', status: 'fuzzy', confidence_score: 2, questions: 3 },
  { name: '向量', status: 'blank', confidence_score: 0, questions: 0 },
  { name: '矩阵', status: 'blank', confidence_score: 1, questions: 1 },
];

async function openPanel(page) {
  /* zh is the default locale, so a hardcoded English label here is a
     defect a zh user would hit on first open. */
  await mockAuthedApp(page, { lang: 'zh' });
  await page.setViewportSize({ width: 1280, height: 1400 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.locator('#topModeTutor').click();
  await expect(page.locator('#topModeTutor')).toHaveAttribute('aria-selected', 'true');
  /* The map lives in the sidebar's Knowledge tab, which starts hidden;
     without this every assertion runs against a display:none subtree. */
  await page.locator('#tabKnowledge').click();
  await expect(page.locator('#knowledgePanel')).toBeVisible();
  await page.evaluate((nodes) => {
    window.stateStore.dispatch({ type: 'state/set', key: 'kbNodes', value: nodes });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentNode', value: 0 });
    window.stateStore.dispatch({
      type: 'state/set',
      key: 'boundariesHistory',
      value: [{ date: '2026-09-20', at: 1789000000000, summary: 'I 1 · F 2 · B 2', counts: { internalized: 1, fuzzy: 2, blank: 2 } }],
    });
  }, NODES);
}

const NODE = '#kbContent [data-kb-graph-node]';
const DETAIL = '[data-kb-node-detail]';

test('React knowledge panel follows KB store updates', async ({ page }) => {
  await openPanel(page);
  await expect(page.locator('#kbContent [data-kb-graph]')).toBeVisible();
  await expect(page.locator(NODE)).toHaveCount(NODES.length);
  await expect(page.locator('#kbContent [data-kb-section="fuzzy"] [data-kb-node]')).toHaveCount(2);
});

test('the detail panel is localized and does not echo the status enum', async ({ page }) => {
  await openPanel(page);

  await page.locator(NODE).first().click();
  const detail = page.locator(DETAIL);
  await expect(detail).toHaveCount(1);
  /* Desktop: right-hand drawer. */
  await expect(detail).toHaveAttribute('data-kb-presentation', 'drawer');

  /* Every label here used to be a hardcoded English literal. */
  await expect(detail.getByText('掌握置信度')).toBeVisible();
  await expect(detail.getByText('系统笔记')).toBeVisible();
  await expect(detail.getByText('我的笔记')).toBeVisible();
  await expect(detail.getByText('存档历史')).toBeVisible();
  await expect(detail.getByText('相关知识点')).toBeVisible();
  await expect(detail.locator('[data-kb-go]')).toHaveText('→ 进入');

  /* The badge reuses tutor.status*, the teaching-plan vocabulary. */
  const badge = detail.locator('[data-kb-detail-status]');
  await expect(badge).toHaveText('已内化');
  await expect(badge).not.toHaveText(/internalized/);
});

test('confidence steps carry their ordinal and toggle', async ({ page }) => {
  await openPanel(page);
  await page.locator(NODE).nth(1).click();
  const steps = page.locator(`${DETAIL} [data-kb-conf]`);
  await expect(steps).toHaveCount(5);
  /* kb.confidenceSet carries a {n} placeholder. */
  await expect(steps.nth(2)).toHaveAttribute('aria-label', '将置信度设为 3');
  await expect(steps.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await steps.nth(3).click();
  await expect.poll(() => page.evaluate(() => window.stateStore.read('kbNodes')[1].confidence_score)).toBe(4);
});

test('snapshot history renders the shape the writer actually produces', async ({ page }) => {
  await openPanel(page);

  await page.locator(NODE).first().click();
  const rows = page.locator(`${DETAIL} [data-kb-history-row]`);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('2026-09-20');
  await expect(rows.first()).toContainText('I 1 · F 2 · B 2');
  await expect(rows.first()).not.toContainText('?');
});

test('graph nodes are keyboard reachable', async ({ page }) => {
  await openPanel(page);

  await page.locator(NODE).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(DETAIL)).toHaveCount(1);
});

test('phones get a bottom sheet', async ({ page }) => {
  await openPanel(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#kbContent [data-kb-node]').first().click();
  await expect(page.locator(DETAIL)).toHaveAttribute('data-kb-presentation', 'sheet');
});
