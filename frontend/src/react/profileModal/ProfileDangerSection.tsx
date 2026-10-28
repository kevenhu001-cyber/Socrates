import { Button as UiButton } from '../ui/shadcn/button';
import type { ProfileDispatch } from './types';
import { profileText } from './profileText';

export function ProfileDangerSection({ dispatch }: { dispatch: ProfileDispatch }) {
  return (
    <div className="profile-section" style={{ display: 'none' }}>
      <div className="profile-section-title">
        {profileText('profile.dangerZone', 'Danger zone')}
      </div>
      <div className="profile-action-row">
        <div>
          <div className="profile-action-label">{profileText('profile.signOut', 'Sign out')}</div>
          <div className="profile-action-desc">{profileText('profile.signOutDesc', 'End your session on this device.')}</div>
        </div>
        <UiButton variant="outline"
          type="button"
          onClick={() => { dispatch.signOut(); dispatch.close(); }}
        >
          {profileText('profile.signOut', 'Sign out')}
        </UiButton>
      </div>
      <div className="profile-action-row">
        <div>
          <div className="profile-action-label">
            {profileText('profile.deleteAccount', 'Delete account')}
          </div>
          <div className="profile-action-desc">{profileText('profile.deleteAccountDesc', 'Permanently delete your account and all data.')}</div>
        </div>
        <UiButton variant="destructive"
          type="button"
          onClick={dispatch.deleteAccount}
        >
          {profileText('profile.deleteAccount', 'Delete')}
        </UiButton>
      </div>
    </div>
  );
}
