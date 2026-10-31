import { flushSync } from 'react-dom';
import { mountOwnedRoot, type OwnedRootHandle } from '../lib/boot/ownedRoot';
import { applyLegacyI18n } from '../legacy/gateway';
import { AuthGate } from './AuthGate';

let gateRoot: OwnedRootHandle | null = null;

/**
 * Mounts the auth gate once. `flushSync` keeps the complete React surface
 * available before URL-route handlers can switch to a deep auth view.
 *
 * The initial translation pass still uses the app's legacy i18n adapter, so
 * replay it after React has mounted the elements that carry translation keys.
 */
export function mountAuthGate(): OwnedRootHandle | null {
  const host = document.getElementById('authGate');
  if (!host) return null;
  if (!gateRoot) {
    flushSync(() => {
      gateRoot = mountOwnedRoot(host, 'auth-gate', <AuthGate />);
    });
  }
  applyLegacyI18n();
  return gateRoot;
}

export function unmountAuthGate(): void {
  const root = gateRoot;
  gateRoot = null;
  if (root) root.destroy();
}
