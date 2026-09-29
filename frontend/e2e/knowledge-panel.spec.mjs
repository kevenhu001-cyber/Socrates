// knowledge-panel.spec.mjs — integration coverage for the knowledge
// boundary panel, from the entry point a user actually goes through.
//
// e2e/kb-graph.spec.mjs already pins the force layout's encodings (node
// colour, radius, active class) by calling the renderer directly. It does
// so through window.tutorSocratic.renderKnowledgeBoundaryFile({immediate})),
// which deliberately bypasses updateKB() and the sidebar/mode plumbing.
// Nothing covered those, which is how the panel could carry three
// untranslated English surfaces, a status enum echoed raw into the DOM,
// and a history section reading fields the writer never produced — all
// invisible to a spec that only looked at the SVG.
//
// These specs drive updateKB() in tutor mode with the Knowledge tab
// open, which is the path the product actually renders.

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
  await page.locator('#modeSegmentedTop').getByRole('tab', { name: '辅导' }).click();
  await expect.poll(() => page.evaluate(() => window.appMode)).toBe('tutor');
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
    window.updateKB();
  }, NODES);
  /* updateKB coalesces bursts into one rAF. */
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test('updateKB leaves the delegated graph on screen', async ({ page }) => {
  await openPanel(page);
  /* Guards the delegation contract in ui/knowledgePanel.js: once the
     renderer is called, this function must not go on to rebuild #kbContent
     itself. Encoding details are kb-graph.spec.mjs's job. */
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
     raw enum as the badge text. */
  const badge = detail.locator('.kb-detail-status');
  await expect(badge).toHaveText('已掌握');
  await expect(badge).not.toHaveText(/internalized/);
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
