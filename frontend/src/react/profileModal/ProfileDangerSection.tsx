import type { ProfileDispatch } from './types';
import { profileText } from './profileText';

export function ProfileDangerSection({ dispatch }: { dispatch: ProfileDispatch }) {
  return (
    <div className="profile-section" style={{ display: 'none' }}>
      <div className="profile-section-title" style={{ color: 'hsl(0 60% 55%)' }}>
        {profileText('profile.dangerZone', 'Danger zone')}
      </div>
      <div className="profile-action-row">
        <div>
          <div className="profile-action-label">{profileText('profile.signOut', 'Sign out')}</div>
          <div className="profile-action-desc">{profileText('profile.signOutDesc', 'End your session on this device.')}</div>
        </div>
        <button
          type="button"
          className="profile-btn signout"
          onClick={() => { dispatch.signOut(); dispatch.close(); }}
          style={{ width: 'auto', padding: '6px 14px', flexShrink: 0 }}
        >
          {profileText('profile.signOut', 'Sign out')}
        </button>
      </div>
      <div className="profile-action-row">
        <div>
          <div className="profile-action-label" style={{ color: 'hsl(0 60% 55%)' }}>
            {profileText('profile.deleteAccount', 'Delete account')}
          </div>
          <div className="profile-action-desc">{profileText('profile.deleteAccountDesc', 'Permanently delete your account and all data.')}</div>
        </div>
        <button
          type="button"
          className="profile-btn danger"
          onClick={dispatch.deleteAccount}
          style={{ width: 'auto', padding: '6px 14px', flexShrink: 0 }}
        >
          {profileText('profile.deleteAccount', 'Delete')}
        </button>
      </div>
    </div>
  );
}
