/* ui/dangerConfirms.ts — Wave 2 of main-js-split plan.
 * Three "are you sure?" confirm actions reachable from the profile modal:
 * - confirmClearCache:    wipe local session cache, hard reload
 * - confirmClearSettings: delete every non-built-in API provider + local storage
 * - confirmDeleteAccount: full account deletion via /api/auth/account
 */

import { stateStore } from '../state/store.ts';
import { showConfirm } from './confirm.ts';
import { clearProviderConfig } from '../config/providerConfig.service.ts';
import { renderUserFooter } from './profile.ts';

interface DangerWindow {
  t?: (key: string) => string;
  renderRecents?: () => void;
  resetApp?: () => void;
  closeProfile?: () => void;
  apiFetch?: (path: string, options?: RequestInit) => Promise<unknown>;
  CURRENT_USER?: unknown;
  resetState?: () => void;
  showGate?: () => void;
  showAuthSignin?: () => void;
}

function getWindow(): DangerWindow | undefined {
  return typeof window !== 'undefined' ? (window as unknown as DangerWindow) : undefined;
}

function t(key: string): string {
  const w = getWindow();
  return typeof w?.t === 'function' ? w.t(key) : key;
}

export function confirmClearCache(): void {
  showConfirm(t('confirm.clearConversations.title'), t('confirm.clearConversations.msg'), false).then((yes) => {
    if (yes !== true) return;
    try { localStorage.removeItem('socrates-sessions-v2'); } catch { /* empty-catch: intentional — localStorage wipe best effort */ }
    stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: null });
    const w = getWindow();
    w?.renderRecents?.();
    w?.resetApp?.();
    location.reload();
  }).catch(() => { /* noop */ });
}

export function confirmClearSettings(): void {
  showConfirm(t('confirm.clearApiSettings.title'), t('confirm.clearApiSettings.msg'), false).then((yes) => {
    if (yes !== true) return;
    clearProviderConfig().then(() => { getWindow()?.closeProfile?.(); }).catch(() => { /* empty-catch: intentional — clear provider config is best effort */ });
  }).catch(() => { /* noop */ });
}

function clearDeletedAccountStorage(): void {
  const keys = [
    'socrates-sessions-v2',
    'socrates-api',
    'socrates-provider-keys',
    'socrates-websearch',
  ];
  for (const key of keys) {
    try { localStorage.removeItem(key); } catch { /* empty-catch: intentional — wipe best effort */ }
  }
}

async function deleteAccountOnServer(w: DangerWindow | undefined): Promise<void> {
  if (typeof w?.apiFetch === 'function') {
    await w.apiFetch('/api/auth/account', { method: 'DELETE' });
  }
}

function resetAfterAccountDeletion(w: DangerWindow | undefined): void {
  if (w) w.CURRENT_USER = null;
  clearDeletedAccountStorage();
  w?.resetState?.();
  w?.resetApp?.();
  w?.showGate?.();
  renderUserFooter();
  w?.closeProfile?.();
  w?.showAuthSignin?.();
}

function reportAccountDeletionFailure(error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  alert(t('settings.action.deleteAccount').replace('{msg}', msg));
}

async function performAccountDeletion(): Promise<void> {
  const w = getWindow();
  try {
    await deleteAccountOnServer(w);
    resetAfterAccountDeletion(w);
  } catch (error: unknown) {
    reportAccountDeletionFailure(error);
  }
}

export function confirmDeleteAccount(): void {
  showConfirm(t('confirm.deleteAccount.title'), t('confirm.deleteAccount.msg'), true).then((yes) => {
    if (!yes) return;
    void performAccountDeletion();
  });
}
