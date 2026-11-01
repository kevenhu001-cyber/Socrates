import { Button as UiButton } from '../ui/shadcn/button';
import { Separator } from '../ui/shadcn/separator';
import { createRootSlot } from '../lib/boot/ownedRoot';
import { useEffect } from 'react';
import { cn } from 'cn';

import { useProfileDispatch, useProfileSnapshot } from './profileModal.store';
import { ProfileAccountSection, ProfileSubscriptionSection } from './ProfileAccountSections';
import { ProfileDangerSection } from './ProfileDangerSection';
import { ProfileDataSection } from './ProfileDataSection';
import { ProfileHeader } from './ProfileHeader';
import { ProfilePreferencesSection } from './ProfilePreferencesSection';
import { profileText } from './profileText';
import { i18n } from '../legacy/gateway';
import { installModalA11y } from '../../ui/modalA11y.ts';

const OVERLAY_ID = 'profileOverlay';

function ProfileModal() {
  const snapshot = useProfileSnapshot();
  const dispatch = useProfileDispatch();

  /* React owns the overlay element, so the focus/Esc wiring is installed
     from here — the legacy shell no longer reaches into this surface. */
  useEffect(() => {
    installModalA11y({ overlayId: OVERLAY_ID, closeFn: () => dispatch.close() });
    /* The close function is stable for the lifetime of the modal. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={cn('profile-overlay', !snapshot.open && 'hidden')}
      id={OVERLAY_ID}
      role="dialog"
      aria-modal="true"
      aria-label={i18n('profile.account', 'Account')}
    >
      <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
        <ProfileHeader user={snapshot.user} onSaveName={dispatch.saveName} />
        <div className="profile-body" id="profileBody">
          <ProfileAccountSection user={snapshot.user} />
          <ProfileSubscriptionSection user={snapshot.user} />
          <ProfilePreferencesSection snapshot={snapshot} dispatch={dispatch} />
          <ProfileDataSection dispatch={dispatch} />
          <ProfileDangerSection dispatch={dispatch} />
        </div>
        <Separator />
        <div className="profile-actions pt-3">
          <UiButton variant="outline"
            type="button"
            className="w-full"
            data-initial-focus
            onClick={dispatch.close}
          >
            {profileText('common.close', 'Close')}
          </UiButton>
        </div>
      </div>
    </div>
  );
}

const rootSlot = createRootSlot('profile-modal');

/**
 * Mount the React-owned profile modal. React renders the overlay itself —
 * the static `#profileOverlay` markup was removed from index.html — so the
 * legacy module only publishes the open flag and the snapshot.
 */
export function mountProfileModal(): void {
  let container = document.getElementById('profileModalReactRoot');
  if (!container) {
    container = document.createElement('div');
    container.id = 'profileModalReactRoot';
    document.body.appendChild(container);
  }
  rootSlot.mount(container, <ProfileModal />);
}

export function unmountProfileModal(): void {
  rootSlot.destroy();
}
