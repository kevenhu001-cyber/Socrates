import { Button } from '../ui/shadcn/button';
import { getLegacyActions } from '../legacy/gateway.ts';
import { BellIcon, DatabaseIcon, PlugZapIcon } from 'lucide-react';
import type { SettingsPaneProps } from './settings.types';

export function NotificationsSettingsPane({ hidden, label }: SettingsPaneProps) {
  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('通知', 'Notifications')}</h2>
      <section className="settings-section settings-info-panel">
        <span className="settings-info-icon"><BellIcon aria-hidden /></span>
        <div className="settings-info-copy">
          <h3>{label('Android 应用通知', 'Android notifications')}</h3>
          <p>{label('在 Android 系统设置中管理 Socrates 的通知权限。', 'Manage Socrates notification permissions in Android system settings.')}</p>
        </div>
        <span className="settings-info-badge">Android</span>
      </section>
    </section>
  );
}

export function AppConnectionsSettingsPane({ hidden, label }: SettingsPaneProps) {
  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('应用与连接', 'Apps & connections')}</h2>
      <section className="settings-section settings-info-panel">
        <span className="settings-info-icon"><PlugZapIcon aria-hidden /></span>
        <div className="settings-info-copy">
          <h3>{label('插件与服务', 'Plugins & services')}</h3>
          <p>{label('查看可用连接，并管理已配置的插件。', 'Browse available connections and manage configured plugins.')}</p>
        </div>
        <Button variant="outline"
          onClick={() => {
            const navigation = getLegacyActions().navigation;
            navigation.closeSettings();
            navigation.openNav('plugins');
          }}
        >{label('管理连接', 'Manage connections')}</Button>
      </section>
    </section>
  );
}

export function DataControlsSettingsPane({ hidden, label }: SettingsPaneProps) {
  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('数据管理', 'Data controls')}</h2>
      <section className="settings-section settings-info-panel">
        <span className="settings-info-icon"><DatabaseIcon aria-hidden /></span>
        <div className="settings-info-copy">
          <h3>{label('文件与作品', 'Files & artifacts')}</h3>
          <p>{label('在资料库中查看、整理或删除已保存的内容。', 'View, organize, and delete saved items in your Library.')}</p>
        </div>
        <Button variant="outline"
          onClick={() => {
            const navigation = getLegacyActions().navigation;
            navigation.closeSettings();
            navigation.openNav('library');
          }}
        >{label('打开资料库', 'Open Library')}</Button>
      </section>
    </section>
  );
}
