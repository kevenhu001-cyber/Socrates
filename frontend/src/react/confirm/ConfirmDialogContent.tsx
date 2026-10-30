import { Button as UiButton } from '../ui/Button';
import { useCallback, useRef } from 'react';
import { FoundationDialog, FoundationDialogClose, FoundationDialogDescription, FoundationDialogTitle } from '../dialog/FoundationDialog';
import { getLegacyActions, i18n } from '../legacy/gateway';
import type { ConfirmSnapshot } from './types';
import { getConfirmReturnFocus } from './confirm.hooks';
import { setModalOpen } from '../../ui/modalA11y.ts';

function restoreConfirmFocus(): HTMLElement | null {
  // Base UI resolves finalFocus as the confirm popup closes. Release its modal
  // registration first so a nested parent dialog can receive focus again.
  setModalOpen('confirmDialog', false);
  return getConfirmReturnFocus();
}

/** Loaded on the first confirmation, not when the compatibility root boots. */
export function ConfirmDialogContent({ snapshot }: { snapshot: ConfirmSnapshot }) {
  const title = useRef<HTMLDivElement>(null);
  const lastOpenSnapshot = useRef(snapshot);
  if (snapshot.open) lastOpenSnapshot.current = snapshot;
  const content = snapshot.open ? snapshot : lastOpenSnapshot.current;
  const onOpenChange = useCallback((open: boolean) => {
    if (!open) getLegacyActions().confirm.closeConfirm(false);
  }, []);

  return <FoundationDialog id="confirmDialog" open={snapshot.open} onOpenChange={onOpenChange}
    overlayClassName="confirm-dialog" className="confirm-box" role="alertdialog" initialFocus={title} finalFocus={restoreConfirmFocus}>
    <FoundationDialogTitle id="confirmTitle" className="confirm-title" ref={title} tabIndex={-1} data-initial-focus="true">
      {content.title}
    </FoundationDialogTitle>
    <FoundationDialogDescription id="confirmMsg" className="confirm-msg">{content.msg}</FoundationDialogDescription>
    <div className="confirm-actions" id="confirmActions">
      <FoundationDialogClose className="confirm-btn cancel" id="confirmCancelBtn">
        {i18n('common.cancel', 'Cancel')}
      </FoundationDialogClose>
      <UiButton type="button" className={`confirm-btn ${content.danger ? 'danger' : 'primary'}`} id="confirmOkBtn"
        onClick={() => getLegacyActions().confirm.closeConfirm(true)}>
        {content.danger ? i18n('common.delete', 'Delete') : i18n('common.ok', 'OK')}
      </UiButton>
    </div>
  </FoundationDialog>;
}
