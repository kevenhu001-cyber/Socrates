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
  meta: '[data-testid="turn-activity-meta"]',
  body: '[data-testid="turn-activity-body"]',
  progress: '[data-testid="turn-activity-progress"]',
  step: '[data-testid="thinking-step"]',
  stepTitle: '[data-testid="thinking-step-title"]',
  stepSummary: '[data-testid="thinking-step-summary"]',
  groupToggle: '[data-testid="tool-group-toggle"]',
  groupTitle: '[data-testid="tool-group-title"]',
  groupBody: '[data-testid="tool-group-body"]',
  row: '.rn-tool-row',
  verb: '[data-testid="tool-row-verb"]',
  target: '[data-testid="tool-row-target"]',
  status: '[data-testid="tool-row-status"]',
  detail: '[data-testid="tool-detail"]',
  detailTitle: '[data-testid="tool-detail-title"]',
  detailClose: '[data-testid="tool-detail-close"]',
  sources: '[data-testid="tool-sources"]',
  source: '[data-testid="tool-source"]',
  sourceTitle: '[data-testid="tool-source-title"]',
  codeOutput: '[data-testid="tool-code-output"]',
  codeCopy: '[data-testid="tool-code-copy"]',
  error: '[data-testid="tool-error"]',
  errorMessage: '[data-testid="tool-error-message"]',
  errorRetry: '[data-testid="tool-error-retry"]',
  approval: '[data-testid="tool-approval"]',
});

/** The DOM wrapper of one call (keeps data-tcid / data-state). */
export function toolRow(scope, id) {
  return scope.locator(`${TURN.row}[data-tcid="${id}"]`);
}

/** The pressable row that opens the call's detail drawer / sheet. */
export function toolRowButton(scope, id) {
  return scope.locator(`[data-testid="tool-row-${id}"]`);
}

/** Expand the turn's activity surface (idempotent). */
export async function openActivity(scope) {
  const toggle = scope.locator(TURN.toggle).last();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

/** Expand every collapsed 「使用了 N 个工具」 group inside `scope`. */
export async function openToolGroups(scope) {
  const toggles = scope.locator(TURN.groupToggle);
  const count = await toggles.count();
  for (let index = 0; index < count; index++) {
    const toggle = toggles.nth(index);
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
}

/** Open the activity, any tool groups, then the call's detail drawer. Returns the drawer. */
export async function openToolDetail(page, scope, id) {
  await openActivity(scope);
  await openToolGroups(scope);
  await toolRowButton(scope, id).click();
  const detail = page.locator(TURN.detail);
  await expect(detail).toBeVisible();
  return detail;
}

export async function closeToolDetail(page) {
  await page.locator(TURN.detailClose).click();
  await expect(page.locator(TURN.detail)).toHaveCount(0);
}
