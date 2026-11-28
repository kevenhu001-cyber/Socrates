import { Input as ShadcnInput } from '../ui/shadcn/input';
import { Badge } from '../ui/shadcn/badge';
import { Button } from '../ui/shadcn/button';
import { SettingsRow } from '../layout/SettingsRow';
import { useProfileDispatch, useProfileSnapshot } from '../profile/profile.store';
import type { SettingsPaneProps } from './settings.types';

export function AccountSettingsPane({ hidden, label }: SettingsPaneProps) {
  const profile = useProfileSnapshot();
  const actions = useProfileDispatch();

  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('账户', 'Account')}</h2>
      <div className="settings-account-card">
        <span className="user-avatar settings-account-avatar">{profile.user.initials || '?'}</span>
        <div className="settings-account-id">
          <ShadcnInput
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
        <Badge variant="secondary">
          {profile.user.tier.charAt(0).toUpperCase() + profile.user.tier.slice(1)}
        </Badge>
      </div>
      <section className="settings-section">
        <div className="settings-section-head">
          <h3>{label('账户详情', 'Account details')}</h3>
        </div>
        <SettingsRow
          label={label('加入时间', 'Joined')}
          className="settings-choice"
          control={<span className="settings-choice-value">{profile.user.joinedAt || '—'}</span>}
        />
        <SettingsRow
          label={label('邮箱验证', 'Email verified')}
          className="settings-choice"
          control={
            <span className={'settings-choice-value' + (profile.user.verifiedAt ? ' is-yes' : '')}>
              {profile.user.verifiedAt
                ? label('已验证', 'Verified')
                : label('未验证', 'Not verified')}
            </span>
          }
        />
        <SettingsRow
          label={label('用户 ID', 'User ID')}
          className="settings-choice"
          control={
            <span className="settings-choice-value settings-mono">
              {profile.user.userId || '—'}
            </span>
          }
        />
        <SettingsRow
          label={label('续期', 'Renewal')}
          className="settings-choice"
          control={<span className="settings-choice-value">{profile.user.subEnd || '—'}</span>}
        />
      </section>
      <section className="settings-section">
        <div className="settings-section-head">
          <h3>{label('用量', 'Usage')}</h3>
        </div>
        <SettingsRow
          label={label('Token 用量', 'Token usage')}
          className="settings-choice"
          control={
            <Button variant="outline" type="button" onClick={actions.openUsage}>
              {label('查看', 'View')}
            </Button>
          }
        />
      </section>
      <section className="settings-section">
        <div className="settings-section-head">
          <h3>{label('会话', 'Session')}</h3>
        </div>
        <SettingsRow
          label={label('退出当前设备上的登录状态', 'End the session on this device')}
          className="settings-choice"
          control={
            <Button variant="outline" type="button" onClick={() => actions.signOut()}>
              {label('退出登录', 'Sign out')}
            </Button>
          }
        />
      </section>
      <section className="settings-section settings-danger-zone">
        <div className="settings-section-head">
          <h3>{label('危险区', 'Danger zone')}</h3>
        </div>
        <SettingsRow
          label={label('永久删除账户及全部数据', 'Permanently delete your account and all data')}
          labelClassName="settings-danger-text"
          className="settings-choice"
          control={
            <Button variant="destructive" type="button" onClick={() => actions.deleteAccount()}>
              {label('删除账户', 'Delete account')}
            </Button>
          }
        />
      </section>
    </section>
  );
}
