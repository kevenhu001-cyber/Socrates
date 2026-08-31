import { getLegacyActions } from '../legacy/gateway';
import { useUserInfo } from './sidebarChrome.bridge';

export function SidebarFooter() {
  const user = useUserInfo();

  return (
    <>
      <div className="user-avatar">{user.initials}</div>
      {/* .user-identity is the styling hook the desktop shell uses to put the
          name and the tier badge on one line; keep it in sync with the static
          markup in index.html. */}
      <div className="user-identity" style={{ flex: 1, minWidth: 0 }}>
        <div
          className="user-name"
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            getLegacyActions().navigation.openProfile();
          }}
        >
          {user.displayName}
        </div>
        <div className="user-plan">
          <span className={`tier-badge ${user.tier}`}>{user.tierLabel}</span>
        </div>
      </div>
    </>
  );
}
