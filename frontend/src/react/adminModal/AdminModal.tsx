/** Compatibility modal for existing admin configuration entry points. */

import { useRef } from 'react';
import { createRootSlot } from '../lib/boot/ownedRoot';

import {
  FoundationDialog,
  FoundationDialogClose,
  FoundationDialogTitle,
} from '../dialog/FoundationDialog';
import { installAdminBridge } from './admin.bridge';
import { closeAdminModal } from './legacyApi';
import { EmbeddingProviderSection } from './EmbeddingProviderSection';
import { SystemModelSection } from './SystemModelSection';
import { useAdminConfigActions } from './useAdminConfigActions';
import { useAdminModalConfiguration } from './useAdminModalConfiguration';

function AdminModal() {
  const config = useAdminModalConfiguration();
  const actions = useAdminConfigActions({ ...config, includeToken: false, includeKeyHint: true });
  const { snapshot } = config;
  const titleRef = useRef<HTMLHeadingElement>(null);

  return (
    <FoundationDialog
      id="adminModalOverlay"
      open={snapshot.open}
      onOpenChange={(open) => {
        if (!open) closeAdminModal();
      }}
      overlayClassName="modal-overlay admin-modal-overlay"
      className="modal-card admin-modal"
      initialFocus={titleRef}
    >
      <div className="modal-head">
        <FoundationDialogTitle ref={titleRef} tabIndex={-1}>
          <h2 id="adminModalTitle" style={{ margin: 0 }}>Admin configuration</h2>
        </FoundationDialogTitle>
        <FoundationDialogClose
          className="modal-close"
          onClick={closeAdminModal}
          aria-label="Close admin configuration"
          data-i18n-aria="admin.close"
        >
          ×
        </FoundationDialogClose>
      </div>
      {snapshot.loading && <div className="admin-loading">Loading…</div>}
      {!snapshot.loading && snapshot.adminGateError && (
        <div className="admin-gate-error" role="alert">{snapshot.adminGateError}</div>
      )}
      {!snapshot.loading && snapshot.error && (
        <div className="admin-error" role="alert">{snapshot.error}</div>
      )}
      {!snapshot.loading && snapshot.isAdmin && (
        <div className="admin-body">
          <SystemModelSection
            form={config.systemForm}
            apiKey={config.systemKey}
            saving={snapshot.savingSystem}
            onFormChange={config.setSystemForm}
            onApiKeyChange={config.setSystemKey}
            onSubmit={actions.submitSystem}
          />
          <EmbeddingProviderSection
            form={config.embeddingForm}
            apiKey={config.embeddingKey}
            saving={snapshot.savingEmbedding}
            onFormChange={config.setEmbeddingForm}
            onApiKeyChange={config.setEmbeddingKey}
            onSubmit={actions.submitEmbedding}
            onRemove={actions.removeEmbedding}
          />
        </div>
      )}
    </FoundationDialog>
  );
}

const rootSlot = createRootSlot('admin-modal');

export function mountAdminModal(): void {
  let container = document.getElementById('adminModal');
  if (!container) {
    container = document.createElement('div');
    container.id = 'adminModal';
    document.body.appendChild(container);
  }

  rootSlot.mount(container, <AdminModal />, installAdminBridge);
}

export function unmountAdminModal(): void {
  rootSlot.destroy();
}
