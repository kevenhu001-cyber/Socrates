import { flushSync } from 'react-dom';
import type { ReactElement } from 'react';
import { mountOwnedRoot, type OwnedRootHandle } from '../../lib/boot/ownedRoot';

/**
 * The workspace dialogs are imperative: `showWorkspaceDialogView()` fills
 * `#workspaceDialog` and the caller immediately queries `#projectForm` and
 * friends to bind submit handlers. React renders asynchronously, so the view
 * has to be committed with `flushSync` — otherwise the binders would look for
 * ids that do not exist yet.
 */
let activeRoot: OwnedRootHandle | null = null;

export function mountDialogCard(dialog: HTMLElement, element: ReactElement, cardClass = ''): void {
  unmountDialogCard();
  const card = document.createElement('div');
  card.className = cardClass ? `workspace-dialog-card ${cardClass}` : 'workspace-dialog-card';
  dialog.appendChild(card);
  flushSync(() => {
    activeRoot = mountOwnedRoot(card, 'workspace-dialog', element);
  });
}

export function unmountDialogCard(): void {
  const root = activeRoot;
  if (!root) return;
  activeRoot = null;
  root.destroy();
}
