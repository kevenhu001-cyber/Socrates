import { Button as UiButton } from '../ui/shadcn/button';
import { PageShell } from '../layout/PageShell';
import { t } from '../../i18n/index';
import { useLocaleRefresh } from '../rn/WebUiTheme';
/** The standalone /admin operator console page. */

import { createRootSlot } from '../lib/boot/ownedRoot';

import { installAdminBridge } from './admin.bridge';
import { EmbeddingProviderSection } from './EmbeddingProviderSection';
import { LoginPage } from './LoginPage';
import { SystemModelSection } from './SystemModelSection';
import { useAdminConsole } from './useAdminConsole';

export function AdminPage() {
  useLocaleRefresh();
  const admin = useAdminConsole();

  if (admin.authed === null) {
    return (
      <PageShell
        titleId="admin-console-title"
        title={t('admin.title')}
        className="admin-console"
        ariaBusy
      >
        <div className="admin-loading" role="status">
          {t('common.loading')}
        </div>
      </PageShell>
    );
  }
  if (!admin.authed) {
    return <LoginPage onReady={() => admin.setAuthed(true)} />;
  }

  return (
    <PageShell
      titleId="admin-console-title"
      title={t('admin.title')}
      className="admin-console"
      ariaBusy={admin.snapshot.loading}
      actions={
        <UiButton
          variant="destructive"
          type="button"
          className="admin-remove"
          onClick={admin.signOut}
        >
          {t('profile.signOut')}
        </UiButton>
      }
    >
      {admin.snapshot.loading && (
        <div className="admin-loading" role="status">
          {t('common.loading')}
        </div>
      )}
      {admin.snapshot.error && (
        <div className="admin-error" role="alert">
          {admin.snapshot.error}
        </div>
      )}
      {!admin.snapshot.loading &&
      (!admin.snapshot.error || admin.systemForm || admin.embeddingForm) ? (
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
      ) : null}
    </PageShell>
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
