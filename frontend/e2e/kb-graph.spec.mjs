import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

// P1.2 / RN-5 — knowledge graph. The KB panel renders state.kbNodes as a
// pill-node graph (shared RN panel): ink weight = mastery (internalized /
// fuzzy / blank), hairline edges = learning path, question count in the
// accessible name. Clicking a node opens the detail drawer. Data is read
// straight from the KB store — no backend changes.

const KB_NODES = [
  { name: 'Limits', status: 'internalized', questions: 9, confidence_score: 5 },
  { name: 'Derivatives', status: 'fuzzy', questions: 4, confidence_score: 2 },
  { name: 'Chain Rule', status: 'fuzzy', questions: 1, confidence_score: 1 },
  { name: 'Integrals', status: 'blank', questions: 0, confidence_score: 0 },
  { name: 'A very long node name that should be truncated', status: 'internalized', questions: 16, confidence_score: 4 },
];

async function renderGraph(page, { currentNode = -1 } = {}) {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(({ nodes, currentNode }) => {
    window.stateStore.dispatch({ type: "state/set", key: "kbNodes", value: nodes });
    if (currentNode >= 0) window.stateStore.dispatch({ type: "state/set", key: "currentNode", value: currentNode });
    // The KB panel is a `tutor-only` element hidden in chat mode
    // (body[data-app-mode="chat"] .tutor-only{display:none !important}).
    // The app's syncAppModeUI keeps re-stamping data-app-mode from the
    // internal appMode var, so instead of fighting it we force the panel
    // visible with an !important inline display that beats the sheet rule.
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('collapsed');
    const panel = document.getElementById('knowledgePanel');
    if (panel) {
      panel.classList.remove('hidden');
      panel.style.setProperty('display', 'flex', 'important');
    }
    // Hide the sibling recents panel so the knowledge panel takes the slot.
    const recents = document.getElementById('recentsPanel');
    if (recents) recents.classList.add('hidden');
  }, { nodes: KB_NODES, currentNode });
}

const NODE = '#kbContent [data-kb-graph-node]';

test('KB panel renders a pill graph with one node per kbNode', async ({ page }) => {
  await renderGraph(page);
  await expect(page.locator('#kbContent [data-kb-graph]')).toBeVisible();
  await expect(page.locator(NODE)).toHaveCount(KB_NODES.length);
  // Sequential learning-path edges: N-1 hairlines.
  await expect(page.locator('#kbContent [data-kb-graph-edge]')).toHaveCount(KB_NODES.length - 1);
});

test('mastery is encoded per node and long names are truncated', async ({ page }) => {
  await renderGraph(page);
  await expect(page.locator(`${NODE}[data-kb-status="internalized"]`)).toHaveCount(2);
  await expect(page.locator(`${NODE}[data-kb-status="fuzzy"]`)).toHaveCount(2);
  await expect(page.locator(`${NODE}[data-kb-status="blank"]`)).toHaveCount(1);
  const long = page.locator(`${NODE}[data-kb-graph-node="4"]`);
  await expect(long).toContainText('…');
  await expect(long).toHaveAttribute('aria-label', /A very long node name that should be truncated/);
  await expect(long).toHaveAttribute('data-kb-questions', '16');
});

test('pills do not overlap', async ({ page }) => {
  await renderGraph(page);
  const boxes = await page.locator(NODE).evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  }));
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      const p = boxes[a]; const q = boxes[b];
      const overlap = p.x < q.x + q.w - 0.5 && q.x < p.x + p.w - 0.5 && p.y < q.y + q.h - 0.5 && q.y < p.y + p.h - 0.5;
      expect(overlap, `node ${a} overlaps node ${b}`).toBe(false);
    }
  }
});

test('the active node is marked', async ({ page }) => {
  await renderGraph(page, { currentNode: 1 });
  const active = page.locator(`${NODE}[data-kb-active="1"]`);
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute('data-kb-graph-node', '1');
});

test('zoom controls scale the graph and fit resets it', async ({ page }) => {
  await renderGraph(page);
  await expect(page.locator(NODE).first()).toBeVisible();
  const fit = page.locator('#kbContent [data-kb-zoom="fit"]');
  const before = await fit.textContent();
  await page.locator('#kbContent [data-kb-zoom="in"]').click();
  await expect(fit).not.toHaveText(before ?? '');
  await fit.click();
  await expect(fit).toHaveText(before ?? '');
});

test('clicking a graph node opens the detail drawer', async ({ page }) => {
  await renderGraph(page);
  await expect(page.locator('[data-kb-node-detail]')).toHaveCount(0);
  await page.locator(`${NODE}[data-kb-graph-node="1"]`).click();
  const detail = page.locator('[data-kb-node-detail="1"]');
  await expect(detail).toHaveCount(1);
  await expect(detail).toHaveAttribute('role', 'dialog');
  await expect(detail.locator('[data-kb-relation="before"]')).toContainText('Limits');
  await expect(detail.locator('[data-kb-relation="after"]')).toContainText('Chain Rule');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-kb-node-detail]')).toHaveCount(0);
});
