/* ui/dangerConfirms.ts — Wave 2 of main-js-split plan.
 * Three "are you sure?" confirm actions reachable from the profile modal:
 * - confirmClearCache:    wipe local session cache, hard reload
 * - confirmClearSettings: delete every non-built-in API provider + local storage
 * - confirmDeleteAccount: full account deletion via /api/auth/account
 */

import { stateStore } from '../state/store.js';
import { showConfirm } from './confirm.ts';
import { clearProviderConfig } from '../config/providerConfig.service.ts';
import { renderUserFooter } from './profile.js';

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

export function confirmDeleteAccount(): void {
  showConfirm(t('confirm.deleteAccount.title'), t('confirm.deleteAccount.msg'), true).then((yes) => {
    if (!yes) return;
    void (async () => {
      const w = getWindow();
      try {
        if (typeof w?.apiFetch === 'function') {
          await w.apiFetch('/api/auth/account', { method: 'DELETE' });
        }
        if (w) w.CURRENT_USER = null;
        try { localStorage.removeItem('socrates-sessions-v2'); } catch { /* empty-catch: intentional — wipe best effort */ }
        try { localStorage.removeItem('socrates-api'); } catch { /* empty-catch: intentional — wipe best effort */ }
        try { localStorage.removeItem('socrates-provider-keys'); } catch { /* empty-catch: intentional — wipe best effort */ }
        try { localStorage.removeItem('socrates-websearch'); } catch { /* empty-catch: intentional — wipe best effort */ }
        w?.resetState?.();
        w?.resetApp?.();
        w?.showGate?.();
        renderUserFooter();
        w?.closeProfile?.();
        w?.showAuthSignin?.();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        alert(t('settings.action.deleteAccount').replace('{msg}', msg));
      }
    })();
  });
}
