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

test('React knowledge panel follows KB store updates', async ({ page }) => {
  await openPanel(page);
  await expect(page.locator('#kbContent svg.kb-graph')).toBeVisible();
  await expect(page.locator('#kbContent .kb-graph-node')).toHaveCount(NODES.length);
});

test('the detail panel is localized and does not echo the status enum', async ({ page }) => {
  await openPanel(page);

  await page.locator('#kbContent .kb-graph-node').first().click();
  const detail = page.locator('#kbContent .kb-node-detail');
  await expect(detail).toHaveCount(1);

  /* Every label here used to be a hardcoded English literal. */
  await expect(detail.locator('.kb-detail-label').first()).toHaveText('掌握置信度');
  await expect(detail.getByText('系统笔记')).toBeVisible();
  await expect(detail.getByText('我的笔记')).toBeVisible();
  await expect(detail.getByText('存档历史')).toBeVisible();
  await expect(detail.locator('.kb-go-btn')).toHaveText('→ 进入');

  /* The backend emits internalized / fuzzy / blank; the panel showed that
     raw enum as the badge text. It now reuses tutor.status* — the same
     vocabulary the teaching-plan sidebar uses — so one node never reads
     已内化 in the sidebar and a different word in its own detail panel. */
  const badge = detail.locator('.kb-detail-status');
  await expect(badge).toHaveText('已内化');
  await expect(badge).not.toHaveText(/internalized/);
});

test('confidence dot tooltips interpolate their ordinal', async ({ page }) => {
  await openPanel(page);
  await page.locator('#kbContent .kb-graph-node').first().click();
  const dots = page.locator('#kbContent .kb-node-detail .kb-conf-dot');
  await expect(dots).toHaveCount(5);
  /* kb.confidenceSet carries a {n} placeholder and i18n.ts's t() does not
     substitute, so an unimplemented interpolator would show a literal
     "{n}" in every tooltip. */
  await expect(dots.nth(2)).toHaveAttribute('title', '将置信度设为 3');
  await expect(dots.nth(2)).not.toHaveAttribute('title', /\{n\}/);
});

test('snapshot history renders the shape the writer actually produces', async ({ page }) => {
  await openPanel(page);

  await page.locator('#kbContent .kb-graph-node').first().click();
  const rows = page.locator('#kbContent .kb-node-detail .kb-history li');
  await expect(rows).toHaveCount(1);
  /* The old code read h.from / h.to, fields saveBoundarySnapshot never
     wrote, so every row rendered as "<date> ? → ?". */
  await expect(rows.first()).toContainText('2026-09-20');
  await expect(rows.first()).toContainText('I 1 · F 2 · B 2');
  await expect(rows.first()).not.toContainText('?');
});

test('graph nodes are keyboard reachable', async ({ page }) => {
  await openPanel(page);

  await page.locator('#kbContent .kb-graph-node').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#kbContent .kb-node-detail')).toHaveCount(1);
});
