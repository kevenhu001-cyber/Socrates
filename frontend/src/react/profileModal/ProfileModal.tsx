import { clearHostMounted, markHostMountedBy } from '../lib/boot/ownership';
import { createRoot, type Root } from 'react-dom/client';

import { installProfileBridge, useProfileDispatch, useProfileSnapshot } from './profileModal.bridge';
import { ProfileAccountSection, ProfileSubscriptionSection } from './ProfileAccountSections';
import { ProfileDangerSection } from './ProfileDangerSection';
import { ProfileDataSection } from './ProfileDataSection';
import { ProfileHeader } from './ProfileHeader';
import { ProfilePreferencesSection } from './ProfilePreferencesSection';
import { profileText } from './profileText';

const OVERLAY_ID = 'profileOverlay';

function ProfileModal() {
  const snapshot = useProfileSnapshot();
  const dispatch = useProfileDispatch();

  return (
    <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
      <ProfileHeader user={snapshot.user} onSaveName={dispatch.saveName} />
      <div className="profile-body" id="profileBody">
        <ProfileAccountSection user={snapshot.user} />
        <ProfileSubscriptionSection user={snapshot.user} />
        <ProfilePreferencesSection snapshot={snapshot} dispatch={dispatch} />
        <ProfileDataSection dispatch={dispatch} />
        <ProfileDangerSection dispatch={dispatch} />
      </div>
      <div className="profile-actions" style={{ borderTop: '0.5px solid hsl(var(--border-300)/0.08)', paddingTop: 12 }}>
        <button
          type="button"
          className="profile-btn close-btn"
          data-initial-focus
          onClick={dispatch.close}
        >
          {profileText('common.close', 'Close')}
        </button>
      </div>
    </div>
  );
}

export interface ProfileModalHandle {
  overlay: HTMLElement;
  root: Root;
  destroy: () => void;
}

let profileModalMounted = false;

export function hydrateProfileModal(): ProfileModalHandle | null {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay || profileModalMounted) return null;
  profileModalMounted = true;

  installProfileBridge();
  const root = createRoot(overlay);
  root.render(<ProfileModal />);
  markHostMountedBy(overlay, 'profile-modal');
  return {
    overlay,
    root,
    destroy: () => {
      root.unmount();
      profileModalMounted = false;
      clearHostMounted(overlay);
    },
  };
}
