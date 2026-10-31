// frontend/src/auth/shell.ts
// The app document routes auth values and presentation updates through the
// React-consumed auth state. Detached roots retain DOM behavior for isolated
// shell tests and embedders.

import {
  getAuthField,
  requestAuthFocus,
  setAuthButtonState,
  setAuthErrorState,
  setAuthField,
  setAuthTab,
  setAuthText,
  setAuthView,
  setAuthVisibility,
} from './uiState.ts';

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
  /* `DOMStringMap` indexes as `string | undefined`, so the widened value type
     is what lets a real `Document` satisfy this without a cast. */
  documentElement?: { dataset?: Record<string, string | undefined> };
};

function el(root: AuthRoot, id: string): HTMLElement | null {
  try {
    return (root.getElementById(id) as HTMLElement | null) ?? null;
  } catch {
    return null;
  }
}

function isDocumentRoot(root: AuthRoot): boolean {
  return typeof document !== 'undefined' && root === document;
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
  if (isDocumentRoot(root)) {
    if (viewIds.includes(id as typeof viewIds[number])) setAuthView(id);
    return;
  }
  for (const v of viewIds) {
    const node = el(root, v);
    if (node) node.classList.add('hidden');
  }
  const target = el(root, id);
  if (target) target.classList.remove('hidden');
}

export function switchTab(root: AuthRoot, tab: string): void {
  if (isDocumentRoot(root)) {
    setAuthTab(tab === 'signin' || tab === 'register' ? tab : null);
    return;
  }
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
  if (isDocumentRoot(root)) {
    setAuthTab(null);
    return;
  }
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
  if (isDocumentRoot(root)) {
    const nextTab = tabs[next].getAttribute('data-tab') || 'signin';
    setAuthTab(nextTab === 'signin' || nextTab === 'register' ? nextTab : null);
    requestAuthFocus(tabs[next].id);
    return true;
  }
  tabs[next].focus();
  switchTab(root, tabs[next].getAttribute('data-tab') || 'signin');
  return true;
}

export function setError(root: AuthRoot, viewId: string, msg: string): void {
  if (isDocumentRoot(root)) {
    setAuthErrorState(viewId, msg || '');
    return;
  }
  const node = el(root, viewId);
  if (node) node.textContent = msg || '';
}

/* Form service compatibility helpers. The live document uses the auth state
   store; detached test roots keep a small DOM adapter for their contract. */

export function getValue(root: AuthRoot, id: string): string {
  if (isDocumentRoot(root)) return getAuthField(id);
  const node = el(root, id) as HTMLInputElement | null;
  return node?.value ?? '';
}

export function isChecked(root: AuthRoot, id: string): boolean {
  const node = el(root, id) as HTMLInputElement | null;
  return node?.checked ?? false;
}

export function setValue(root: AuthRoot, id: string, value: string): void {
  if (isDocumentRoot(root)) {
    setAuthField(id, value);
    return;
  }
  const node = el(root, id) as HTMLInputElement | null;
  if (node) node.value = value;
}

export function setText(root: AuthRoot, id: string, text: string): void {
  if (isDocumentRoot(root)) {
    setAuthText(id, text);
    return;
  }
  const node = el(root, id);
  if (node) node.textContent = text;
}

export function setVisible(root: AuthRoot, id: string, visible: boolean): void {
  if (isDocumentRoot(root)) {
    setAuthVisibility(id, visible);
    return;
  }
  const node = el(root, id);
  if (node) node.classList.toggle('hidden', !visible);
}

export function focusId(root: AuthRoot, id: string): void {
  if (isDocumentRoot(root)) {
    requestAuthFocus(id);
    return;
  }
  const node = el(root, id) as HTMLElement | null;
  if (node?.focus) node.focus();
}

export function setButton(root: AuthRoot, id: string, disabled: boolean, label?: string): void {
  if (isDocumentRoot(root)) {
    setAuthButtonState(id, disabled, label);
    return;
  }
  const node = el(root, id) as HTMLButtonElement | null;
  if (!node) return;
  node.disabled = disabled;
  if (label !== undefined) node.textContent = label;
}
