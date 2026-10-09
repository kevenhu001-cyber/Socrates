/** Compatibility modal for existing admin configuration entry points. */

import { createRoot, type Root } from 'react-dom/client';

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

  if (!snapshot.open) return null;

  return (
    <div
      className="modal-overlay admin-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeAdminModal();
      }}
    >
      <div className="modal-card admin-modal" role="dialog" aria-modal="true" aria-labelledby="adminModalTitle">
        <div className="modal-head">
          <h2 id="adminModalTitle">Admin configuration</h2>
          <button type="button" className="modal-close" onClick={closeAdminModal} aria-label="Close admin configuration">
            ×
          </button>
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
      </div>
    </div>
  );
}

let root: Root | null = null;

export function mountAdminModal(): void {
  const container = document.getElementById('adminModal');
  if (!container) return;

  installAdminBridge();
  if (!root) root = createRoot(container);
  root.render(<AdminModal />);
}

export function unmountAdminModal(): void {
  if (!root) return;
  root.unmount();
  root = null;
}
