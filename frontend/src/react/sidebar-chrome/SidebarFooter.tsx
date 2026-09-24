import { useUserInfo } from './sidebarChrome.bridge';

/* The account row is display-only: settings live behind the gear button
   (apiSettingsBtn → openSettings) and profile/sign-out inside the Settings
   account page. It used to open a popup menu duplicating those entries —
   removed so the footer reads as identity, not a second settings surface. */
export function SidebarFooter() {
  const user = useUserInfo();

  return (
    <div className="sidebar-account-trigger sidebar-account-static" aria-label={user.displayName || undefined}>
      <span className="user-avatar">{user.initials}</span>
      <span className="user-identity">
        <span className="user-name">{user.displayName}</span>
        <span className="user-plan"><span className={`tier-badge ${user.tier}`}>{user.tierLabel}</span></span>
      </span>
    </div>
  );
}
