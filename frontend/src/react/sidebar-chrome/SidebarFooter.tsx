import { useUserInfo } from './legacyAdapter';

export function SidebarFooter() {
  const user = useUserInfo();

  return (
    <>
      <div className="user-avatar">{user.initials}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="user-name"
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            if (typeof window.openProfile === 'function') window.openProfile();
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
