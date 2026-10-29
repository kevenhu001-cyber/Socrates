import { flushSync } from 'react-dom';
import type { ReactElement } from 'react';
import { createRootSlot } from '../../lib/boot/ownedRoot';

/**
 * The workspace dialogs are imperative: `showWorkspaceDialogView()` fills
 * `#workspaceDialog` and the caller immediately queries `#projectForm` and
 * friends to bind submit handlers. React renders asynchronously, so the view
 * has to be committed with `flushSync` — otherwise the binders would look for
 * ids that do not exist yet.
 */
const root = createRootSlot('workspace-dialog');

export function mountDialogCard(dialog: HTMLElement, element: ReactElement, cardClass = ''): void {
  unmountDialogCard();
  const card = document.createElement('div');
  card.className = cardClass ? `workspace-dialog-card ${cardClass}` : 'workspace-dialog-card';
  dialog.appendChild(card);
  flushSync(() => root.mount(card, element));
}

export function unmountDialogCard(): void {
  root.destroy();
}
