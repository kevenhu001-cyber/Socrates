// frontend/src/auth/shell.ts
// M4 increment: auth gate shell ownership lives here, not scattered across
// auth/index.js inline `document.getElementById` calls. All helpers accept
// an explicit `root` (default: document) so unit tests can pass a detached
// DOM subtree. auth/index.js keeps its public exports (hideGate/showGate/
// showAuthView/...) as thin delegates so windowExports.js and e2e stay green.

export const AUTH_VIEW_IDS = [
  'authSigninView',
  'authRegisterView',
  'authVerifySentView',
  'authVerifyFailedView',
  'authVerifiedView',
  'authForgotPasswordView',
  'authForgotSentView',
  'authResetPasswordView',
  'authResetSuccessView',
  'authCodeLoginView',
] as const;

export type AuthRoot = Pick<Document, 'getElementById' | 'querySelectorAll'> & {
  documentElement?: { dataset?: Record<string, string> };
};

function el(root: AuthRoot, id: string): HTMLElement | null {
  try {
    return (root.getElementById(id) as HTMLElement | null) ?? null;
  } catch {
    return null;
  }
}

export function setGateVisible(root: AuthRoot, showApp: boolean): void {
  const gate = el(root, 'authGate');
  if (gate) gate.classList.toggle('hidden', showApp);
  const shell = el(root, 'appShell');
  if (shell) shell.classList.toggle('hidden', !showApp);
}

export function setBootState(root: AuthRoot, state: 'app' | 'auth'): void {
  try {
    const docEl = (root as Document).documentElement;
    if (docEl?.dataset) docEl.dataset.bootState = state;
  } catch {
    /* empty-catch: intentional — pre-boot document may be unavailable in tests */
  }
}

export function showView(root: AuthRoot, id: string, viewIds: readonly string[] = AUTH_VIEW_IDS): void {
  for (const v of viewIds) {
    const node = el(root, v);
    if (node) node.classList.add('hidden');
  }
  const target = el(root, id);
  if (target) target.classList.remove('hidden');
}

export function switchTab(root: AuthRoot, tab: string): void {
  const tabs = Array.from(root.querySelectorAll('.auth-tab')) as HTMLElement[];
  for (const t of tabs) {
    const active = t.getAttribute('data-tab') === tab;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
    t.setAttribute('tabindex', active ? '0' : '-1');
  }
  showView(root, tab === 'signin' ? 'authSigninView' : 'authRegisterView');
}

export function clearTabSelection(root: AuthRoot): void {
  const tabs = Array.from(root.querySelectorAll('.auth-tab')) as HTMLElement[];
  for (const t of tabs) {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
    t.setAttribute('tabindex', '-1');
  }
}

export function focusTab(root: AuthRoot, current: Element, key: string): boolean {
  if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End'].indexOf(key) === -1) return false;
  const tabs = Array.from(root.querySelectorAll('.auth-tab')) as HTMLElement[];
  const idx = tabs.indexOf(current as HTMLElement);
  if (idx < 0 || !tabs.length) return false;
  let next: number;
  if (key === 'Home') next = 0;
  else if (key === 'End') next = tabs.length - 1;
  else if (key === 'ArrowLeft' || key === 'ArrowUp') next = (idx - 1 + tabs.length) % tabs.length;
  else next = (idx + 1) % tabs.length;
  tabs[next].focus();
  switchTab(root, tabs[next].getAttribute('data-tab') || 'signin');
  return true;
}

export function setError(root: AuthRoot, viewId: string, msg: string): void {
  const node = el(root, viewId);
  if (node) node.textContent = msg || '';
}

/* ── Form field helpers (M4 round 3) ──
   Submit handlers read/write inputs, buttons, and labels. These helpers
   keep every `getElementById` in one auditable place; handlers stay pure
   logic + apiFetch. All are no-ops on missing nodes (views not yet open). */

export function getValue(root: AuthRoot, id: string): string {
  const node = el(root, id) as HTMLInputElement | null;
  return node?.value ?? '';
}

export function isChecked(root: AuthRoot, id: string): boolean {
  const node = el(root, id) as HTMLInputElement | null;
  return node?.checked ?? false;
}

export function setValue(root: AuthRoot, id: string, value: string): void {
  const node = el(root, id) as HTMLInputElement | null;
  if (node) node.value = value;
}

export function setText(root: AuthRoot, id: string, text: string): void {
  const node = el(root, id);
  if (node) node.textContent = text;
}

export function setVisible(root: AuthRoot, id: string, visible: boolean): void {
  const node = el(root, id);
  if (node) node.classList.toggle('hidden', !visible);
}

export function focusId(root: AuthRoot, id: string): void {
  const node = el(root, id) as HTMLElement | null;
  if (node?.focus) node.focus();
}

export function setButton(root: AuthRoot, id: string, disabled: boolean, label?: string): void {
  const node = el(root, id) as HTMLButtonElement | null;
  if (!node) return;
  node.disabled = disabled;
  if (label !== undefined) node.textContent = label;
}
