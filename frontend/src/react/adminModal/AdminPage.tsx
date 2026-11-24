import { Button as UiButton } from '../ui/shadcn/button';
import { PageFrame } from '../ui/page/PageFrame';
import { PageHeader } from '../ui/page/PageHeader';
/** The standalone /admin operator console page. */

import { createRootSlot } from '../lib/boot/ownedRoot';

import { installAdminBridge } from './admin.bridge';
import { EmbeddingProviderSection } from './EmbeddingProviderSection';
import { LoginPage } from './LoginPage';
import { SystemModelSection } from './SystemModelSection';
import { useAdminConsole } from './useAdminConsole';

export function AdminPage() {
  const admin = useAdminConsole();

  if (admin.authed === null) {
    return (
      <PageFrame className="admin-console" aria-labelledby="admin-console-title" aria-busy="true">
        <PageHeader titleId="admin-console-title" title="Admin console" />
        <div className="admin-loading" role="status">
          Loading…
        </div>
      </PageFrame>
    );
  }
  if (!admin.authed) {
    return <LoginPage onReady={() => admin.setAuthed(true)} />;
  }

  return (
    <PageFrame className="admin-console">
      <PageHeader
        titleId="admin-console-title"
        title="Admin console"
        actions={
          <UiButton
            variant="destructive"
            type="button"
            className="admin-remove"
            onClick={admin.signOut}
          >
            Sign out
          </UiButton>
        }
      />
      {admin.snapshot.loading && <div className="admin-loading">Loading…</div>}
      {admin.snapshot.error && (
        <div className="admin-error" role="alert">
          {admin.snapshot.error}
        </div>
      )}
      <div className="admin-body">
        <SystemModelSection
          form={admin.systemForm}
          apiKey={admin.systemKey}
          saving={admin.snapshot.savingSystem}
          onFormChange={admin.setSystemForm}
          onApiKeyChange={admin.setSystemKey}
          onSubmit={admin.submitSystem}
        />
        <EmbeddingProviderSection
          form={admin.embeddingForm}
          apiKey={admin.embeddingKey}
          saving={admin.snapshot.savingEmbedding}
          onFormChange={admin.setEmbeddingForm}
          onApiKeyChange={admin.setEmbeddingKey}
          onSubmit={admin.submitEmbedding}
          onRemove={admin.removeEmbedding}
        />
      </div>
    </PageFrame>
  );
}

const rootSlot = createRootSlot('admin-page');

export function mountAdminPage(): void {
  const container = document.getElementById('adminPanel');
  if (!container) {
    rootSlot.destroy();
    return;
  }

  rootSlot.mount(container, <AdminPage />, installAdminBridge);
}

export function unmountAdminPage(): void {
  rootSlot.destroy();
}
