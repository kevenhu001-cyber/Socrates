import { i18n } from './workspaceUi';
import type { WorkspacePluginBasic } from './pluginDetail.types';

interface PluginDetailSectionsProps {
  plugin: WorkspacePluginBasic;
  capabilities: string[];
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>;
}

function authTypeLabel(authType?: string): string {
  if (authType === 'api_key') return i18n('plugins.detail.authApiKey', 'API key');
  if (authType === 'custom_credential') return i18n('plugins.detail.authCustom', 'Custom credentials');
  if (authType === 'public') return i18n('plugins.detail.authPublic', 'Public — no sign-in needed');
  return i18n('plugins.detail.authOauth', 'OAuth 2.0');
}

export function PluginDetailSections({ plugin, capabilities }: PluginDetailSectionsProps) {
  return (
    <div className="plugin-detail-body">
      <section className="plugin-detail-section">
        <h3 className="plugin-detail-section-title">{i18n('plugins.detail.about', 'About')}</h3>
        <p className="plugin-detail-desc">{plugin.description || i18n('plugins.noDescription', 'Use this app in chat')}</p>
      </section>

      <section className="plugin-detail-section">
        <h3 className="plugin-detail-section-title">{i18n('plugins.detail.capabilities', 'Capabilities')}</h3>
        {capabilities.length ? (
          <ul className="plugin-detail-features-list">
            {capabilities.map((capability, index) => (
              <li key={index} className="plugin-detail-feature-item">
                <span className="plugin-detail-feature-icon" aria-hidden="true"><CheckIcon /></span>
                <span>{capability}</span>
              </li>
            ))}
          </ul>
        ) : <p className="plugin-detail-desc">{i18n('plugins.detail.noCaps', 'No published capabilities.')}</p>}
      </section>

      <section className="plugin-detail-section">
        <h3 className="plugin-detail-section-title">{i18n('plugins.detail.auth', 'Authorization')}</h3>
        <div className="plugin-detail-security-card">
          <div className="plugin-detail-security-field">
            <span className="plugin-detail-security-label">{i18n('plugins.detail.authType', 'Auth type')}</span>
            <span className="plugin-detail-security-value">{authTypeLabel(plugin.authType)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
