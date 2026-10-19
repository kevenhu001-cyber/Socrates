import { markHostMountedBy } from '../lib/boot/ownership';
import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getLegacyActions } from '../legacy/gateway';
import { reportSwallow } from '../../util/reportSwallow';
import { installConfirmBridge, useConfirmSnapshot } from './confirm.bridge';

type ConfirmRuntime = typeof import('./ConfirmDialogContent');
let runtimePromise: Promise<ConfirmRuntime> | null = null;

function loadConfirmRuntime() {
  return runtimePromise ??= import('./ConfirmDialogContent').catch((error) => {
    runtimePromise = null;
    throw error;
  });
}

/** The boot root subscribes immediately; modal primitives load on first use. */
function ConfirmDialog() {
  const snapshot = useConfirmSnapshot();
  const [runtime, setRuntime] = useState<ConfirmRuntime | null>(null);
  const cancel = useCallback(() => getLegacyActions().confirm.closeConfirm(false), []);

  useEffect(() => {
    if (!snapshot.open || runtime) return;
    let cancelled = false;
    void loadConfirmRuntime().then((loaded) => {
      if (!cancelled) setRuntime(loaded);
    }).catch((error) => {
      if (cancelled) return;
      reportSwallow(error, 'confirm:load');
      cancel();
    });
    const dismissKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Tab') return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
      cancel();
    };
    const outside = () => cancel();
    document.addEventListener('keydown', dismissKey, true);
    document.addEventListener('pointerdown', outside, true);
    return () => {
      cancelled = true;
      document.removeEventListener('keydown', dismissKey, true);
      document.removeEventListener('pointerdown', outside, true);
    };
  }, [snapshot.open, runtime, cancel]);

  // Keep the loaded root alive so Base UI can finish exit motion and restore
  // focus after the legacy Promise has already resolved.
  return runtime ? <runtime.ConfirmDialogContent snapshot={snapshot} /> : null;
}

/**
 * Mount the React confirm dialog. Creates a dedicated body-level
 * container so `createRoot` owns the overlay shell. Legacy
 * `showConfirm()` / `closeConfirm()` keep the Promise resolver and
 * publish visibility/copy through the bridge (M4 step 4.5c).
 */
let confirmDialogMounted = false;

export function mountConfirmDialog(): void {
  /* The mount registry marks the host with 'confirm-dialog' at dispatch
     time — before this async import resolves — so hostIsMountedBy()
     cannot be used as the re-entry guard here (it would always see the
     registry's mark and skip the real mount). A module-level flag keeps
     direct re-calls idempotent instead. */
  if (confirmDialogMounted) return;
  let container = document.getElementById('confirmDialogReactRoot');
  if (!container) {
    container = document.createElement('div');
    container.id = 'confirmDialogReactRoot';
    document.body.appendChild(container);
  }

  confirmDialogMounted = true;
  markHostMountedBy(container, 'confirm-dialog');

  installConfirmBridge();
  const root = createRoot(container);
  root.render(<ConfirmDialog />);
}
