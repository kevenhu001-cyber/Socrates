import { Icon } from '../../../legacy/Icon';
import { Button } from '../../ui/shadcn/button';
import { i18n } from './workspaceUi';
import { actionTitle, actionDescription, detailText, pluginDescription, pluginExample } from './pluginDetailContent';
import type { WorkspacePluginBasic } from './pluginDetail.types';

interface PluginDetailSectionsProps {
  plugin: WorkspacePluginBasic;
  capabilities: string[];
  connectable: boolean;
  launching: boolean;
  onUseExample?: (prompt: string) => void;
}

function authDetails(authType?: string): [string, string] {
  switch (authType) {
    case 'api_key':
      return [detailText('API key', 'API 密钥'), detailText('Enter a key issued by the service in the connection form.', '在连接表单中填写服务提供方签发的密钥。')];
    case 'custom_credential':
      return [detailText('Custom credentials', '自定义凭据'), detailText('Complete the required credential fields in the connection form.', '在连接表单中填写服务要求的凭据。')];
    case 'public':
    case 'no_auth':
      return [detailText('No sign-in required', '无需登录'), detailText('This service does not require account authorization.', '此服务无需账户授权。')];
    case 'oauth':
      return ['OAuth 2.0', detailText('Sign in with the service and review its authorization screen before granting access.', '登录服务账户，并在授权页面确认权限后再授权。')];
    default:
      return [detailText('Not specified', '未提供'), detailText('Review the connection form for the required authorization method.', '请查看连接表单中的授权方式。')];
  }
}

function ActionList({ actions }: { actions: NonNullable<WorkspacePluginBasic['chatActions']> }) {
  return (
    <ul className="plugin-detail-features-list">
      {actions.map((action) => (
        <li key={action.name} className="plugin-detail-feature-item">
          <Icon name="check" size={16} />
          <div className="plugin-detail-action-copy">
            <strong>{actionTitle(action.name)}</strong>
            <span>{actionDescription(action)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PluginDetailSections({ plugin, capabilities, connectable, launching, onUseExample }: PluginDetailSectionsProps) {
  const actions = plugin.chatActions;
  const [authLabel, authHelp] = authDetails(plugin.authType);
  const connected = plugin.connection?.status === 'connected';
  const pending = plugin.connection?.status === 'initiated';
  const failed = ['failed', 'error', 'expired'].includes(plugin.connection?.status || '');
  const hasActions = Boolean(actions?.length);
  const credentials = plugin.credentialInput?.fields || [];

  return (
    <div className="plugin-detail-body">
      <section className="plugin-detail-section">
        <h2 className="plugin-detail-section-title">{i18n('plugins.detail.about', 'About')}</h2>
        <p className="plugin-detail-desc">{pluginDescription(plugin)}</p>
        {!connectable ? (
          <p className="plugin-detail-note" role="status">
            {detailText('This app is listed in the directory, but the connector service is not available for use right now.', '此插件已收录，但当前连接服务不可用。')}
          </p>
        ) : null}
      </section>

      <section className="plugin-detail-section">
        <h2 className="plugin-detail-section-title">
          {detailText('What you can do', '支持的功能')}
          {actions ? <span className="plugin-detail-count">{actions.length}</span> : null}
        </h2>
        {hasActions && actions ? (
          <>
            <ActionList actions={actions.slice(0, 6)} />
            {actions.length > 6 ? (
              <details className="plugin-detail-more-actions">
                <summary>{detailText('Show all actions', '查看全部操作')} ({actions.length})</summary>
                <ActionList actions={actions.slice(6)} />
              </details>
            ) : null}
            <p className="plugin-detail-privacy-note">
              {detailText('These are the actions registered in Socrates, not the full service API. Actual access depends on your connection and permissions.', '这里仅列出 Socrates 已注册的操作，并非服务的全部 API。实际访问范围取决于连接状态和账户权限。')}
            </p>
          </>
        ) : (
          <p className="plugin-detail-desc">
            {actions
              ? detailText('No chat actions are currently registered for this app.', '此插件暂未注册聊天操作。')
              : detailText('The server has not supplied a verified action list.', '服务器尚未提供可核验的操作清单。')}
          </p>
        )}
        {capabilities.length && !actions ? (
          <p className="plugin-detail-privacy-note">
            {detailText('Provider catalog categories (not verified chat actions): ', '服务目录分类（不代表实际聊天操作）：')}
            {capabilities.join(' · ')}
          </p>
        ) : null}
      </section>

      {hasActions && actions ? (
        <section className="plugin-detail-section">
          <h2 className="plugin-detail-section-title">{detailText('Try asking', '使用示例')}</h2>
          <p className="plugin-detail-desc">
            {onUseExample ? detailText('Choose an example to open a new chat with a draft. Nothing is sent automatically.', '选择示例即可打开新对话并填入草稿，不会自动发送。') : detailText('Example requests to use after connecting this app.', '连接后可在对话中尝试以下请求。')}
          </p>
          <ul className="plugin-detail-prompts-list">
            {actions.slice(0, 3).map((action) => (
              <li key={action.name}>
                {onUseExample ? (
                  <Button variant="outline" size="surface" className="plugin-detail-prompt-card" disabled={launching} onClick={() => onUseExample(pluginExample(plugin, action))}>
                    <Icon name="newChat" size={18} />
                    <span className="plugin-detail-prompt-text">{pluginExample(plugin, action)}</span>
                    <Icon name="chevronRight" size={16} className="plugin-detail-prompt-arrow" />
                  </Button>
                ) : (
                  <div className="plugin-detail-prompt-card">
                    <Icon name="newChat" size={18} />
                    <span className="plugin-detail-prompt-text">{pluginExample(plugin, action)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="plugin-detail-section">
        <h2 className="plugin-detail-section-title">{detailText('Connection and permissions', '连接与权限')}</h2>
        <dl className="plugin-detail-security-card">
          <div className="plugin-detail-security-field">
            <dt>{detailText('Authorization', '授权方式')}</dt>
            <dd>{authLabel}</dd>
          </div>
          <div className="plugin-detail-security-field">
            <dt>{detailText('Connection', '连接状态')}</dt>
            <dd>{connected ? detailText('Connected', '已连接') : pending ? detailText('Awaiting authorization', '等待授权') : failed ? detailText('Connection failed', '连接失败') : detailText('Not connected', '未连接')}</dd>
          </div>
          {connected && plugin.connection?.displayName ? (
            <div className="plugin-detail-security-field">
              <dt>{detailText('Account', '账户')}</dt>
              <dd>{plugin.connection.displayName}</dd>
            </div>
          ) : null}
          {credentials.map((field) => (
            <div className="plugin-detail-security-field" key={field.key}>
              <dt>{field.label}</dt>
              <dd>{field.required !== false ? detailText('Required', '必填') : detailText('Optional', '选填')}</dd>
            </div>
          ))}
        </dl>
        <p className="plugin-detail-desc">{authHelp}</p>
        {failed ? <p className="plugin-detail-note">{detailText('Check the service credentials and retry the connection.', '请检查服务凭据后重新连接。')}</p> : null}
        <p className="plugin-detail-privacy-note">
          {detailText('Review the permissions requested by the service. Use Manage to review or remove an existing connection. Do not enter credentials in a chat.', '请核对服务请求的权限。通过“管理”查看或移除已有连接，不要在聊天中填写凭据。')}
        </p>
      </section>
    </div>
  );
}
