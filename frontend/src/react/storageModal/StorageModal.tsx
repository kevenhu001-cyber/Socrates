import { Button as UiButton } from '../ui/Button';
import { useRef } from 'react';
import { createRootSlot } from '../lib/boot/ownedRoot';
import {
  FoundationDialog,
  FoundationDialogClose,
  FoundationDialogTitle,
} from '../dialog/FoundationDialog';
import {
  installStorageBridge,
  useStorageDispatch,
  useStorageSnapshot,
} from './storageModal.bridge';

function StorageModal() {
  const snap = useStorageSnapshot();
  const dispatch = useStorageDispatch();
  const titleRef = useRef<HTMLDivElement>(null);
  const lastSnap = useRef(snap);
  if (snap.open) lastSnap.current = snap;
  const content = snap.open ? snap : lastSnap.current;
  const archived = content.archived;

  return (
    <FoundationDialog
      id="storageModalOverlay"
      open={snap.open}
      onOpenChange={(open) => {
        if (!open) dispatch.close();
      }}
      overlayClassName="cmd-k-overlay"
      className="cmd-k-modal storage-modal"
      initialFocus={titleRef}
    >
      <div className="modal-head">
        <FoundationDialogTitle ref={titleRef} tabIndex={-1} className="modal-title">
          {`Archived sessions (${archived.length})`}
        </FoundationDialogTitle>
        <FoundationDialogClose className="modal-close" onClick={() => dispatch.close()} aria-label="Close">
          ×
        </FoundationDialogClose>
      </div>
      <div className="storage-modal-body">
        <div className="storage-modal-desc">
          Archived chats stay here for 30 days. Use Archive on a Recents row to tuck one away without deleting it; Restore brings it back, or Delete forever erases it now.
        </div>
        {archived.length === 0 ? (
          <div className="storage-empty">
            No archived sessions. Archive one from a Recents row to keep it out of the way for up to 30 days.
          </div>
        ) : (
          <div className="storage-list">
            {archived.map((s) => {
              const ageDays = Math.max(0, Math.floor((Date.now() - (s.archivedAt || 0)) / (24 * 60 * 60 * 1000)));
              const remain = Math.max(0, 30 - ageDays);
              return (
                <div className="storage-row" key={s.id}>
                  <div className="storage-row-main">
                    <div className="storage-row-title">{s.title || s.topic || '(untitled)'}</div>
                    <div className="storage-row-meta">
                      {`Archived ${ageDays} day${ageDays === 1 ? '' : 's'} ago · ${remain} day${remain === 1 ? '' : 's'} left`}
                    </div>
                  </div>
                  <div className="storage-row-actions">
                    <UiButton
                      type="button"
                      className="storage-btn-restore"
                      onClick={() => dispatch.restore(s.id)}
                    >
                      Restore
                    </UiButton>
                    <UiButton
                      type="button"
                      className="storage-btn-delete"
                      onClick={() => dispatch.purge(s.id)}
                    >
                      Delete forever
                    </UiButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </FoundationDialog>
  );
}

const rootSlot = createRootSlot('storage-modal');

export function mountStorageModal(): void {
  let container = document.getElementById('storageModalReactRoot');
  if (!container) {
    container = document.createElement('div');
    container.id = 'storageModalReactRoot';
    document.body.appendChild(container);
  }
  rootSlot.mount(container, <StorageModal />, installStorageBridge);
}

export function unmountStorageModal(): void {
  rootSlot.destroy();
}
