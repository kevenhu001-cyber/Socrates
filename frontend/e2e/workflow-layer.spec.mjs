// Smoke coverage for the extension workflow layer. The layer is mounted
// inside #chatView, immediately before the composer, so its height remains
// part of the normal chat layout.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function waitForBridge(page) {
  await page.waitForFunction(
    () => Boolean(window.__socratesAgentRunBridge && typeof window.__socratesAgentRunBridge.publish === 'function'),
    null,
    { timeout: 10_000 },
  );
}

async function publish(page, event) {
  await waitForBridge(page);
  await page.evaluate((ev) => {
    window.__socratesAgentRunBridge.publish(ev);
  }, event);
}

async function enterChat(page) {
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
  });
}

test('workflow layer mounts empty and shows stepper on research planning', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await enterChat(page);

  const layer = page.locator('#workflowLayerReactRoot .workflow-layer');
  await expect(layer).toHaveCount(0);

  await publish(page, {
    runId: 'research-smoke',
    workflow: 'research',
    stage: 'planning',
    status: 'running',
    message: 'Preparing the search strategy…',
  });

  await expect(page.locator('#workflowLayerReactRoot .workflow-layer')).toHaveCount(1);
  await expect(page.locator('#chatView #workflowLayerReactRoot')).toHaveCount(1);
  await expect(page.locator('.agent-stepper')).toBeVisible();
  await expect(page.locator('.agent-stepper-workflow')).toHaveText('research');
  await expect(page.locator('.agent-stepper-stages .agent-stepper-stage')).toHaveCount(4);
  await expect(page.locator('.agent-stepper-stage-active')).toHaveText(/Plan/);
});

test('stepper advances through searching and hides after completed', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await enterChat(page);

  await publish(page, {
    runId: 'research-smoke-2',
    workflow: 'research',
    stage: 'planning',
    status: 'running',
  });
  await publish(page, {
    runId: 'research-smoke-2',
    workflow: 'research',
    stage: 'searching',
    status: 'running',
    message: 'Searching sources…',
    toolCallIds: ['tc-1'],
  });

  await expect(page.locator('.agent-stepper-stage-active')).toHaveText(/Search/);

  await publish(page, {
    runId: 'research-smoke-2',
    workflow: 'research',
    stage: 'completed',
    status: 'succeeded',
  });
  await expect(page.locator('.workflow-layer')).toHaveClass(/workflow-layer-done/);
  await expect(page.locator('#workflowLayerReactRoot .workflow-layer')).toHaveCount(0, { timeout: 5000 });
});

test('analyze planning does not render a separate analysis workbench', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await enterChat(page);

  await publish(page, {
    runId: 'analyze-smoke',
    workflow: 'analyze',
    stage: 'planning',
    status: 'running',
  });

  await expect(page.locator('.analyze-workbench')).toHaveCount(0);
  await expect(page.getByText('Analysis tools', { exact: true })).toHaveCount(0);
  await expect(page.locator('.workflow-layer')).toHaveCount(0);
});
