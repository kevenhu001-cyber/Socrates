import type { MountFailure } from '../lib/boot/registry';

/** A boot-safe native adapter: recovery must work even when UI chunks cannot
 * load. It borrows the shared button grammar without creating another root. */
export function showMountRecovery(
  { host, spec, retry }: MountFailure,
  message: string,
  retryLabel: string,
  messageKey: string,
): () => void {
  const doc = host.ownerDocument;
  const notice = doc.createElement('div');
  notice.dataset.mountRecovery = spec.label;
  notice.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:var(--ui-space-sm);padding:var(--ui-space-sm);color:var(--ui-text-secondary);font-size:var(--ui-font-size-sm);';

  const status = doc.createElement('span');
  status.id = `mount-recovery-${spec.hostId}`;
  status.setAttribute('role', 'status');
  status.dataset.i18nKey = messageKey;
  status.textContent = message;

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-ghost btn-touch';
  button.dataset.slot = 'button';
  button.dataset.i18nKey = 'error.retry';
  button.setAttribute('aria-describedby', status.id);
  button.textContent = retryLabel;
  const onRetry = () => {
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    retry();
  };
  button.addEventListener('click', onRetry);
  notice.append(status, button);
  // Preserve any legacy content and draft nodes; remove only our own notice.
  host.appendChild(notice);
  return () => {
    button.removeEventListener('click', onRetry);
    notice.remove();
  };
}
