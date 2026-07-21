import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

// P1.2 — force-directed knowledge graph. The KB panel renders state.kbNodes
// as an SVG force-directed graph: node COLOR = mastery (internalized / fuzzy
// / blank), node SIZE = questions asked. Clicking a node opens the same
// detail panel the list view uses (window.toggleKBDetail). Data is read
// straight from state.kbNodes — no backend changes.

const KB_NODES = [
  { name: 'Limits', status: 'internalized', questions: 9, confidence_score: 5 },
  { name: 'Derivatives', status: 'fuzzy', questions: 4, confidence_score: 2 },
  { name: 'Chain Rule', status: 'fuzzy', questions: 1, confidence_score: 1 },
  { name: 'Integrals', status: 'blank', questions: 0, confidence_score: 0 },
  { name: 'A very long node name that should be truncated', status: 'internalized', questions: 16, confidence_score: 4 },
];

async function renderGraph(page, { currentNode = -1 } = {}) {
  await mockAuthedApp(page);
  await page.goto('/');
  await waitForAppShell(page);
  await page.evaluate(({ nodes, currentNode }) => {
    window.state.kbNodes = nodes;
    if (currentNode >= 0) window.state.currentNode = currentNode;
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
    // immediate:true bypasses the rAF render throttle so the DOM is ready.
    window.tutorSocratic.renderKnowledgeBoundaryFile({ immediate: true });
  }, { nodes: KB_NODES, currentNode });
}

test('KB panel renders a force-directed SVG graph with one node per kbNode', async ({ page }) => {
  await renderGraph(page);
  const svg = page.locator('#kbContent svg.kb-graph');
  await expect(svg).toBeVisible();
  // One <g class="kb-graph-node"> per node.
  await expect(page.locator('#kbContent .kb-graph-node')).toHaveCount(KB_NODES.length);
  // Sequential learning-path edges: N-1 lines.
  await expect(page.locator('#kbContent .kb-graph-edges line')).toHaveCount(KB_NODES.length - 1);
});

test('node color encodes mastery via status class', async ({ page }) => {
  await renderGraph(page);
  await expect(page.locator('#kbContent .kb-graph-node-internalized')).toHaveCount(2);
  await expect(page.locator('#kbContent .kb-graph-node-fuzzy')).toHaveCount(2);
  await expect(page.locator('#kbContent .kb-graph-node-blank')).toHaveCount(1);
});

test('node size encodes questions asked (more questions -> larger radius)', async ({ page }) => {
  await renderGraph(page);
  const radii = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('#kbContent .kb-graph-node'));
    return nodes.map((g) => parseFloat(g.querySelector('circle').getAttribute('r')));
  });
  // Node 4 (16 questions) is the busiest -> largest; node 3 (0 questions) -> smallest.
  const max = Math.max(...radii), min = Math.min(...radii);
  expect(radii[4]).toBeCloseTo(max, 5);
  expect(radii[3]).toBeCloseTo(min, 5);
  expect(radii[4]).toBeGreaterThan(radii[3]);
});

test('the active node gets the active class', async ({ page }) => {
  await renderGraph(page, { currentNode: 1 });
  const active = page.locator('#kbContent .kb-graph-node-active');
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute('data-node-idx', '1');
});

test('clicking a graph node opens the shared detail panel', async ({ page }) => {
  await renderGraph(page);
  await expect(page.locator('#kbContent .kb-node-detail')).toHaveCount(0);
  await page.locator('#kbContent .kb-graph-node[data-node-idx="1"]').click();
  await expect(page.locator('#kbContent .kb-node-detail')).toHaveCount(1);
});
