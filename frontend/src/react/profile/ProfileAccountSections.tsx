import type { ProfileUserSnapshot } from './types';
import { profileText } from './profileText';

import { buttonVariants } from '../ui/shadcn/button';

export function ProfileAccountSection({ user }: { user: ProfileUserSnapshot }) {
  return (
    <div className="profile-section">
      <h2 className="profile-section-title">{profileText('profile.account', 'Account')}</h2>
      <div className="profile-row">
        <span className="profile-row-label">{profileText('profile.joined', 'Joined')}</span>
        <span className="profile-row-value" id="profileJoined">
          {user.joinedAt}
        </span>
      </div>
      <div className="profile-row">
        <span className="profile-row-label">
          {profileText('profile.emailVerified', 'Email verified')}
        </span>
        <span className="profile-row-value" id="profileVerified">
          {user.verifiedAt
            ? profileText('profile.verified', 'Verified')
            : profileText('profile.unverified', 'Unverified')}
        </span>
      </div>
      <div className="profile-row">
        <span className="profile-row-label">{profileText('profile.userId', 'User ID')}</span>
        <span className="profile-row-value" id="profileUserId">
          <span className="profile-id-text">{user.userId}</span>
        </span>
      </div>
    </div>
  );
}

export function ProfileSubscriptionSection({ user }: { user: ProfileUserSnapshot }) {
  const tierLabel =
    user.tier === 'diophantus' || user.tier === 'free'
      ? profileText('profile.freePlan', 'Free')
      : user.tier.charAt(0).toUpperCase() + user.tier.slice(1);
  return (
    <div className="profile-section">
      <h2 className="profile-section-title">
        {profileText('profile.subscription', 'Subscription')}
      </h2>
      <div className="profile-row">
        <span className="profile-row-label">
          {profileText('profile.currentPlan', 'Current plan')}
        </span>
        <div className="profile-plan-actions">
          <span className="profile-row-value" id="profileTier">
            {tierLabel}
          </span>
          <a
            href="https://topodrive.top/pricing"
            className={buttonVariants({ variant: 'link', size: 'sm' })}
          >
            {profileText('profile.comparePlans', 'Compare plans')}
          </a>
        </div>
      </div>
      <div
        className="profile-row"
        id="profileSubEndRow"
        style={{ display: user.subEnd || user.tier !== 'diophantus' ? 'flex' : 'none' }}
      >
        <span className="profile-row-label">{profileText('profile.renewal', 'Renewal')}</span>
        <span className="profile-row-value" id="profileSubEnd">
          {user.subEnd || '—'}
        </span>
      </div>
    </div>
  );
}
