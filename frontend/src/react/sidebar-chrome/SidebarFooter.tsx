import { useUserInfo } from './sidebarChrome.bridge';

/* The account row is display-only: settings live behind the gear button
   (apiSettingsBtn → openSettings) and profile/sign-out inside the Settings
   account page. It used to open a popup menu duplicating those entries —
   removed so the footer reads as identity, not a second settings surface.

   P_account-compact — the row shows only the avatar and the plan badge.
   The name is not painted (it truncated to a few glyphs beside the footer
   actions and repeated what the avatar says); it stays one hover away via
   `title` and is announced through `aria-label`. */
export function SidebarFooter() {
  const user = useUserInfo();
  const name = user.displayName || '';
  const label = [name, user.tierLabel].filter(Boolean).join(' · ') || undefined;

  return (
    <div
      className="sidebar-account-static"
      aria-label={label}
      title={name || undefined}
    >
      <span className="user-avatar" aria-hidden="true">{user.initials}</span>
      <span className="user-identity">
        <span className="user-plan"><span className={`tier-badge ${user.tier}`}>{user.tierLabel}</span></span>
      </span>
    </div>
  );
}
