import type { ProfileDispatch } from './types';
import { profileText } from './profileText';

function ProfileActionRow({
  title,
  description,
  actionLabel,
  onAction,
  warning = false,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  warning?: boolean;
}) {
  return (
    <div className="profile-action-row">
      <div>
        <div className="profile-action-label">{title}</div>
        <div className="profile-action-desc">{description}</div>
      </div>
      <button
        type="button"
        className={`profile-btn${warning ? ' warning' : ''}`}
        onClick={onAction}
        style={{ width: 'auto', padding: '6px 14px', flexShrink: 0 }}
      >
        {actionLabel}
      </button>
    </div>
  );
}

export function ProfileDataSection({ dispatch }: { dispatch: ProfileDispatch }) {
  return (
    <div className="profile-section">
      <div className="profile-section-title">{profileText('profile.data', 'Data')}</div>
      <ProfileActionRow
        title={profileText('profile.usage', 'Token usage')}
        description={profileText('profile.usage.desc', 'View daily token usage heatmap and monthly breakdown.')}
        actionLabel={profileText('profile.view', 'View')}
        onAction={dispatch.openUsage}
      />
      <ProfileActionRow
        title={profileText('profile.archivedSessions', 'Archived sessions')}
        description={profileText('profile.archivedSessionsDesc', 'Archived chats stay here for 30 days. Archive from a Recents row, then Restore or Delete forever.')}
        actionLabel={profileText('profile.manage', 'Manage')}
        onAction={dispatch.openStorage}
      />
      <ProfileActionRow
        title={profileText('profile.promptTemplates', 'Prompt templates')}
        description={profileText('profile.promptTemplatesDesc', 'Reusable prompts you can fire from the chat with /shortcut.')}
        actionLabel={profileText('profile.manage', 'Manage')}
        onAction={dispatch.openPromptTemplates}
      />
      <ProfileActionRow
        title={profileText('profile.clearConversations', 'Clear conversations')}
        description={profileText('profile.clearConversationsDesc', 'Remove all local chat history.')}
        actionLabel={profileText('profile.clear', 'Clear')}
        onAction={dispatch.clearCache}
        warning
      />
      <ProfileActionRow
        title={profileText('profile.clearApiSettings', 'Clear API settings')}
        description={profileText('profile.clearApiSettingsDesc', 'Remove all configured API providers and keys.')}
        actionLabel={profileText('profile.clear', 'Clear')}
        onAction={dispatch.clearSettings}
        warning
      />
    </div>
  );
}
