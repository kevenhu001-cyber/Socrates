import type { ProfileUserSnapshot } from './types';
import { profileText } from './profileText';

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
        <span
          className={`profile-row-value${user.verifiedAt ? ' profile-status-badge yes' : ' profile-status-badge no'}`}
          id="profileVerified"
        >
          {user.verifiedAt ? 'Yes' : 'No'}
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
  const tierLabel = user.tier.charAt(0).toUpperCase() + user.tier.slice(1);
  return (
    <div className="profile-section">
      <div className="profile-section-title">{profileText('profile.subscription', 'Subscription')}</div>
      <div className="profile-row">
        <span className="profile-row-label">{profileText('profile.currentPlan', 'Current plan')}</span>
        <span
          className={`profile-row-value tier-badge tier-${user.tier}`}
          id="profileTier"
          style={{ fontSize: 'calc(13px * var(--app-font-scale, 1))' }}
        >
          {tierLabel}
        </span>
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
          className="profile-btn close-btn"
          style={{ textAlign: 'center', display: 'block', fontSize: 'calc(12px * var(--app-font-scale, 1))', padding: '8px 0' }}
        >
          {profileText('profile.comparePlans', 'Compare plans')}
        </a>
      </div>
    </div>
  );
}
