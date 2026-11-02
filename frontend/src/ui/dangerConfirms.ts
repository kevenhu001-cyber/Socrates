/* ui/dangerConfirms.ts — Wave 2 of main-js-split plan.
 * Three "are you sure?" confirm actions reachable from the profile modal:
 * - confirmClearCache:    wipe local session cache, hard reload
 * - confirmClearSettings: delete every non-built-in API provider + local storage
 * - confirmDeleteAccount: full account deletion via /api/auth/account
 */

import { learnerStorageKeys } from '../tutor/learnerStorage.ts';
import { resetState, stateStore } from '../state/store.ts';
import { showConfirm } from './confirm.ts';
import { clearProviderConfig } from '../config/providerConfig.service.ts';
import { publishSidebarChrome, closeProfile } from './profile.ts';
import { apiFetch } from '../util/api.ts';
import { t } from '../i18n.ts';
import { resetApp, setCurrentUser } from '../app/lifecycle.ts';
import { renderRecents } from './recentsView.ts';
import { showGate, showAuthSignin } from '../auth/index.ts';

export function confirmClearCache(): void {
  showConfirm(t('confirm.clearConversations.title'), t('confirm.clearConversations.msg'), false).then((yes) => {
    if (yes !== true) return;
    try { localStorage.removeItem('socrates-sessions-v2'); } catch { /* empty-catch: intentional — localStorage wipe best effort */ }
    stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: null });
    try { renderRecents(); } catch { /* empty-catch: intentional — recents view may not be mounted */ }
    try { resetApp(); } catch { /* empty-catch: intentional — resetApp during cache wipe is best effort */ }
    location.reload();
  }).catch(() => { /* noop */ });
}

export function confirmClearSettings(): void {
  showConfirm(t('confirm.clearApiSettings.title'), t('confirm.clearApiSettings.msg'), false).then((yes) => {
    if (yes !== true) return;
    clearProviderConfig().then(() => { closeProfile(); }).catch(() => { /* empty-catch: intentional — clear provider config is best effort */ });
  }).catch(() => { /* noop */ });
}

function clearDeletedAccountStorage(): void {
  const keys = [
    'socrates-sessions-v2',
    'socrates-api',
    'socrates-provider-keys',
    'socrates-websearch',
    /* RN-14: the deleted account's review deck and cross-session mistake book. */
    ...learnerStorageKeys(),
  ];
  for (const key of keys) {
    try { localStorage.removeItem(key); } catch { /* empty-catch: intentional — wipe best effort */ }
  }
}

async function deleteAccountOnServer(): Promise<void> {
  await apiFetch('/api/auth/account', { method: 'DELETE' });
}

function resetAfterAccountDeletion(): void {
  setCurrentUser(null);
  clearDeletedAccountStorage();
  resetState();
  try { resetApp(); } catch { /* empty-catch: intentional — resetApp during account deletion is best effort */ }
  showGate();
  publishSidebarChrome();
  closeProfile();
  showAuthSignin();
}

function reportAccountDeletionFailure(error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  alert(t('settings.action.deleteAccount').replace('{msg}', msg));
}

async function performAccountDeletion(): Promise<void> {
  try {
    await deleteAccountOnServer();
    resetAfterAccountDeletion();
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
