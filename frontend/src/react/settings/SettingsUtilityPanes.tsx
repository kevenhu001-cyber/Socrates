import { getLegacyActions } from '../legacy/gateway.ts';
import type { SettingsPaneProps } from './settings.types';

export function NotificationsSettingsPane({ hidden, label }: SettingsPaneProps) {
  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('通知', 'Notifications')}</h2>
      <p>{label(
        '推送通知仅在 Android 客户端可用。请在手机端的应用设置中开关通知。',
        'Push notifications are available in the Android app only. Turn them on or off in the app settings on your phone.',
      )}</p>
    </section>
  );
}

export function AppConnectionsSettingsPane({ hidden, label }: SettingsPaneProps) {
  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('应用与连接', 'Apps & connections')}</h2>
      <p>{label('管理已连接的插件与服务。', 'Manage connected plugins and services.')}</p>
      <button
        className="settings-btn secondary"
        onClick={() => {
          const navigation = getLegacyActions().navigation;
          navigation.closeSettings();
          navigation.openNav('plugins');
        }}
      >{label('打开插件', 'Open plugins')}</button>
    </section>
  );
}

export function DataControlsSettingsPane({ hidden, label }: SettingsPaneProps) {
  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('数据管理', 'Data controls')}</h2>
      <p>{label('你的文件和作品保存在资料库，可随时逐项删除。', 'Your files and artifacts are in Library, where you can remove them individually.')}</p>
      <button
        className="settings-btn secondary"
        onClick={() => {
          const navigation = getLegacyActions().navigation;
          navigation.closeSettings();
          navigation.openNav('library');
        }}
      >{label('打开资料库', 'Open library')}</button>
    </section>
  );
}
