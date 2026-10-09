import { useProfileDispatch, useProfileSnapshot } from '../profileModal/profileModal.bridge';
import type { SettingsPaneProps } from './settings.types';

export function AccountSettingsPane({ hidden, label }: SettingsPaneProps) {
  const profile = useProfileSnapshot();
  const actions = useProfileDispatch();

  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('账户', 'Account')}</h2>
      <section className="settings-section">
        <div className="settings-account-card">
          <span className="user-avatar settings-account-avatar">{profile.user.initials || '?'}</span>
          <div className="settings-account-id">
            <input
              className="settings-account-name"
              type="text"
              maxLength={50}
              defaultValue={profile.user.displayName}
              placeholder={label('你的名字', 'Your name')}
              aria-label={label('显示名称', 'Display name')}
              onBlur={(event) => actions.saveName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
              }}
            />
            <span className="settings-account-email">
              {profile.user.email || label('访客模式', 'Guest session')}
            </span>
          </div>
          <span className={'tier-badge tier-' + profile.user.tier}>
            {profile.user.tier.charAt(0).toUpperCase() + profile.user.tier.slice(1)}
          </span>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-section-head"><h3>{label('账户详情', 'Account details')}</h3></div>
        <div className="settings-choice"><span>{label('加入时间', 'Joined')}</span><span className="settings-choice-value">{profile.user.joinedAt || '—'}</span></div>
        <div className="settings-choice"><span>{label('邮箱验证', 'Email verified')}</span><span className={'settings-choice-value' + (profile.user.verifiedAt ? ' is-yes' : '')}>{profile.user.verifiedAt ? label('已验证', 'Verified') : label('未验证', 'Not verified')}</span></div>
        <div className="settings-choice"><span>{label('用户 ID', 'User ID')}</span><span className="settings-choice-value settings-mono">{profile.user.userId || '—'}</span></div>
        <div className="settings-choice"><span>{label('续期', 'Renewal')}</span><span className="settings-choice-value">{profile.user.subEnd || '—'}</span></div>
      </section>
      <section className="settings-section">
        <div className="settings-section-head"><h3>{label('数据与用量', 'Data & usage')}</h3></div>
        <div className="settings-choice">
          <span>{label('Token 用量', 'Token usage')}</span>
          <button type="button" className="settings-btn secondary" onClick={() => actions.openUsage()}>{label('查看', 'View')}</button>
        </div>
        <div className="settings-choice">
          <span>{label('已归档会话', 'Archived sessions')}</span>
          <button type="button" className="settings-btn secondary" onClick={() => actions.openStorage()}>{label('管理', 'Manage')}</button>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-section-head"><h3>{label('会话', 'Session')}</h3></div>
        <div className="settings-choice">
          <span>{label('退出当前设备上的登录状态', 'End the session on this device')}</span>
          <button type="button" className="settings-btn secondary" onClick={() => actions.signOut()}>{label('退出登录', 'Sign out')}</button>
        </div>
      </section>
      <section className="settings-section settings-danger-zone">
        <div className="settings-section-head"><h3>{label('危险区', 'Danger zone')}</h3></div>
        <div className="settings-choice">
          <span className="settings-danger-text">{label('永久删除账户及全部数据', 'Permanently delete your account and all data')}</span>
          <button type="button" className="settings-btn danger" onClick={() => actions.deleteAccount()}>{label('删除账户', 'Delete account')}</button>
        </div>
      </section>
    </section>
  );
}
