// e2e/_turn-ui.mjs — selectors and helpers for the RN-2 turn activity
// (packages/ui/src/turn, mounted by frontend/src/react/tool-run).
//
// react-native-web renders `testID` as `data-testid`; the DOM wrappers the web
// adapters own keep `data-tcid` / `data-state` on `.rn-tool-row`.
import { expect } from '@playwright/test';

export const TURN = Object.freeze({
  surface: '[data-testid="turn-activity"]',
  wrapper: '.rn-turn-activity',
  toggle: '[data-testid="turn-activity-toggle"]',
  label: '[data-testid="turn-activity-label"]',
  duration: '[data-testid="turn-activity-duration"]',
  body: '[data-testid="turn-activity-body"]',
  thoughtsPanel: '#thoughtsPanel',
  thoughtsBackdrop: '#thoughtsBackdrop',
  thoughtsTitle: '#thoughtsPanelTitle',
  timeline: '[data-testid="thinking-timeline"]',
  /** The live working glyph (rotating dotted sphere) ahead of the caption. */
  indicator: '[data-testid="turn-activity-indicator"]',
  spark: '[data-testid="thinking-spark"]',
  /** The running step's arc, one per running row. */
  spinner: '[data-testid="thinking-step-spinner"]',
  step: '[data-testid="thinking-step"]',
  stepTitle: '[data-testid="thinking-step-title"]',
  stepDetail: '[data-testid="thinking-step-detail"]',
  stepSummary: '.thinking-step-summary',
  row: '.rn-tool-row',
  detail: '[data-testid="tool-detail"]',
  sources: '[data-testid="tool-sources"]',
  source: '[data-testid="tool-source"]',
  sourceTitle: '[data-testid="tool-source-title"]',
  sourceHost: '[data-testid="tool-source-host"]',
  codeOutput: '[data-testid="tool-code-output"]',
  codeCopy: '[data-testid="tool-code-copy"]',
  error: '[data-testid="tool-error"]',
  errorMessage: '[data-testid="tool-error-message"]',
  errorRetry: '[data-testid="tool-error-retry"]',
  approval: '[data-testid="tool-approval"]',
});

function resolvePage(scope) {
  return typeof scope?.page === 'function' ? scope.page() : scope;
}

export function thoughtsScope(scope) {
  return resolvePage(scope).locator(TURN.thoughtsPanel);
}

/** The DOM wrapper of one call inside the Thoughts sheet/drawer. */
export function toolRow(scope, id) {
  return thoughtsScope(scope).locator(`${TURN.row}[data-tcid="${id}"]`);
}

/** The pressable row that opens the call's detail inline. */
export function toolRowButton(scope, id) {
  return thoughtsScope(scope).locator(`[data-testid="tool-row-${id}"]`);
}

/** Expand the turn's Thoughts sheet/drawer (idempotent). Returns the panel locator. */
export async function openActivity(scope) {
  const toggle = scope.locator(TURN.toggle).last();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const panel = thoughtsScope(scope);
  await expect(panel).toBeVisible();
  return panel;
}

/** All execution logs now share the turn Thoughts sheet/drawer. */
export async function openToolGroups(scope) { return openActivity(scope); }

/** Open the call's inline detail inside Thoughts. Returns the detail locator. */
export async function openToolDetail(page, scope, id) {
  const panel = await openActivity(scope);
  const row = toolRowButton(scope, id);
  if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
  const detail = panel.locator(TURN.detail);
  await expect(detail).toBeVisible();
  return detail;
}

/** Collapse the inline detail by pressing its own row again. */
export async function closeToolDetail(page, scope) {
  const container = thoughtsScope(scope ?? page);
  const open = container.locator('[data-testid^="tool-row-"][aria-expanded="true"]').first();
  await open.click();
  await expect(container.locator(TURN.detail)).toHaveCount(0);
}
