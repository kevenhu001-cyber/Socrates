import { flushSync } from 'react-dom';
import { mountOwnedRoot, type OwnedRootHandle } from '../lib/boot/ownedRoot';
import { applyLegacyI18n } from '../legacy/gateway';
import { AuthGate } from './AuthGate';

let gateRoot: OwnedRootHandle | null = null;

/**
 * Mounts the auth gate once, before `mountAuthListeners()` binds handlers to
 * `#authGate`. `flushSync` is required: the binders query `#authSigninView`,
 * `.auth-tab` and friends immediately after this returns.
 *
 * The tree is static — no props, no state — so every imperative write the auth
 * modules make afterwards (hidden classes, error text, button labels) sticks.
 * The one thing React cannot know about is the i18n pass, which ran during
 * module evaluation before this mount, so it is replayed here.
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
