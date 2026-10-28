import type { ProfileUserSnapshot } from './types';
import { profileText } from './profileText';
import { Badge } from '../ui/shadcn/badge';
import { buttonVariants } from '../ui/shadcn/button';

export function ProfileAccountSection({ user }: { user: ProfileUserSnapshot }) {
  return (
    <div className="profile-section">
      <div className="profile-section-title">{profileText('profile.account', 'Account')}</div>
      <div className="profile-row">
        <span className="profile-row-label">{profileText('profile.joined', 'Joined')}</span>
        <span className="profile-row-value" id="profileJoined">{user.joinedAt}</span>
      </div>
      <div className="profile-row">
        <span className="profile-row-label">{profileText('profile.emailVerified', 'Email verified')}</span>
        <Badge variant={user.verifiedAt ? 'secondary' : 'outline'}
          id="profileVerified"
        >
          {user.verifiedAt ? 'Yes' : 'No'}
        </Badge>
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
  const tierLabel = user.tier.charAt(0).toUpperCase() + user.tier.slice(1);
  return (
    <div className="profile-section">
      <div className="profile-section-title">{profileText('profile.subscription', 'Subscription')}</div>
      <div className="profile-row">
        <span className="profile-row-label">{profileText('profile.currentPlan', 'Current plan')}</span>
        <Badge variant="secondary"
          id="profileTier"
        >
          {tierLabel}
        </Badge>
      </div>
      <div
        className="profile-row"
        id="profileSubEndRow"
        style={{ display: user.subEnd || user.tier !== 'diophantus' ? 'flex' : 'none' }}
      >
        <span className="profile-row-label">{profileText('profile.renewal', 'Renewal')}</span>
        <span className="profile-row-value" id="profileSubEnd">{user.subEnd || '—'}</span>
      </div>
      <div style={{ marginTop: 10 }}>
        <a
          href="https://topodrive.top/pricing"
          className={buttonVariants({ variant: 'outline', className: 'w-full' })}
        >
          {profileText('profile.comparePlans', 'Compare plans')}
        </a>
      </div>
    </div>
  );
}
