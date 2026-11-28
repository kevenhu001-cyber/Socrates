import { Button } from '../ui/shadcn/button';
import { SettingsRow } from '../layout/SettingsRow';
import { getLegacyActions } from '../legacy/gateway.ts';
import { BellIcon, DatabaseIcon, PlugZapIcon } from 'lucide-react';
import type { SettingsPaneProps } from './settings.types';

export function NotificationsSettingsPane({ hidden, label }: SettingsPaneProps) {
  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('通知', 'Notifications')}</h2>
      <section className="settings-section">
        <SettingsRow
          leading={<BellIcon size={18} aria-hidden />}
          label={label('系统通知权限', 'Notification permissions')}
          description={label(
            '在浏览器或设备系统设置中管理 Socrates 的推送与通知权限。',
            'Manage Socrates notification and push permissions in your browser or device system settings.',
          )}
          className="settings-choice"
          control={<span className="settings-info-badge">{label('系统管理', 'System')}</span>}
        />
      </section>
    </section>
  );
}

export function AppConnectionsSettingsPane({ hidden, label }: SettingsPaneProps) {
  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('应用与连接', 'Apps & connections')}</h2>
      <section className="settings-section">
        <SettingsRow
          leading={<PlugZapIcon size={18} aria-hidden />}
          label={label('插件与服务', 'Plugins & services')}
          description={label(
            '查看可用连接，并管理已配置的插件。',
            'Browse available connections and manage configured plugins.',
          )}
          className="settings-choice"
          control={
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                const navigation = getLegacyActions().navigation;
                navigation.openNav('plugins');
              }}
            >
              {label('管理连接', 'Manage connections')}
            </Button>
          }
        />
      </section>
    </section>
  );
}

export function DataControlsSettingsPane({ hidden, label }: SettingsPaneProps) {
  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('数据管理', 'Data controls')}</h2>
      <section className="settings-section">
        <div className="settings-section-head">
          <h3>{label('对话记录', 'Chat history')}</h3>
          <p>
            {label(
              '查看、恢复或永久删除已归档的对话。',
              'View, restore, or permanently delete archived chats.',
            )}
          </p>
        </div>
        <SettingsRow
          label={label('已归档会话', 'Archived sessions')}
          className="settings-choice"
          control={
            <Button
              variant="outline"
              type="button"
              onClick={() => getLegacyActions().navigation.openStorageModal()}
            >
              {label('管理', 'Manage')}
            </Button>
          }
        />
        <SettingsRow
          leading={<DatabaseIcon size={18} aria-hidden />}
          label={label('文件与作品', 'Files & artifacts')}
          description={label(
            '在资料库中查看、整理或删除已保存的内容。',
            'View, organize, and delete saved items in your Library.',
          )}
          className="settings-choice"
          control={
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                const navigation = getLegacyActions().navigation;
                navigation.openNav('library');
              }}
            >
              {label('打开资料库', 'Open Library')}
            </Button>
          }
        />
      </section>
    </section>
  );
}
