import { createRoot, type Root } from 'react-dom/client';
import React from 'react';
import { installStorageBridge, useStorageSnapshot, useStorageDispatch } from './storageModal.bridge';

function esc(s: string | undefined | null): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
}

function StorageModal() {
  const snap = useStorageSnapshot();
  const dispatch = useStorageDispatch();
  const archived = snap.archived;

  if (!snap.open) return null;

  return React.createElement('div', {
    className: 'cmd-k-overlay',
    id: 'storageModalOverlay',
    onClick: (e: React.MouseEvent) => { if (e.target === e.currentTarget) dispatch.close(); },
  },
    React.createElement('div', { className: 'cmd-k-modal storage-modal', onClick: (e: React.MouseEvent) => e.stopPropagation() },
      React.createElement('div', { className: 'modal-head' },
        React.createElement('span', { className: 'modal-title' }, `Archived sessions (${archived.length})`),
        React.createElement('button', { className: 'modal-close', onClick: () => dispatch.close() }, '×'),
      ),
      React.createElement('div', { className: 'storage-modal-body' },
        React.createElement('div', { className: 'storage-modal-desc' },
          'These sessions are pending permanent deletion. Deleting a session in Recents first archives it for up to 30 days as a safety net; this list shows any that have not yet been purged. Use Restore to bring one back, or Delete forever to remove it now.',
        ),
        archived.length === 0
          ? React.createElement('div', { className: 'storage-empty' }, 'No archived sessions. Long-press a session in Recents to send it here.')
          : React.createElement('div', { className: 'storage-list' },
              ...archived.map((s) => {
                const ageDays = Math.max(0, Math.floor((Date.now() - (s.archivedAt || 0)) / (24 * 60 * 60 * 1000)));
                const remain = Math.max(0, 30 - ageDays);
                return React.createElement('div', { className: 'storage-row', key: s.id },
                  React.createElement('div', { className: 'storage-row-main' },
                    React.createElement('div', { className: 'storage-row-title' }, esc(s.title || s.topic || '(untitled)')),
                    React.createElement('div', { className: 'storage-row-meta' }, `Archived ${ageDays} day${ageDays === 1 ? '' : 's'} ago · ${remain} day${remain === 1 ? '' : 's'} left`),
                  ),
                  React.createElement('div', { className: 'storage-row-actions' },
                    React.createElement('button', { className: 'storage-btn-restore', onClick: () => dispatch.restore(s.id) }, 'Restore'),
                    React.createElement('button', { className: 'storage-btn-delete', onClick: () => dispatch.purge(s.id) }, 'Delete forever'),
                  ),
                );
              }),
            ),
      ),
    ),
  );
}

let root: Root | null = null;

export function mountStorageModal(): void {
  installStorageBridge();
  // Use portal or create dedicated container
  let container = document.getElementById('storageModalReactRoot');
  if (!container) {
    container = document.createElement('div');
    container.id = 'storageModalReactRoot';
    document.body.appendChild(container);
  }
  if (!root) root = createRoot(container);
  root.render(React.createElement(StorageModal));
}

export function unmountStorageModal(): void {
  if (root) { root.unmount(); root = null; }
}
