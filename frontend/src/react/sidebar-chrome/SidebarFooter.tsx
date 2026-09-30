import { useUserInfo } from './sidebarChrome.bridge';

/* The account row is display-only: settings live behind the gear button
   (apiSettingsBtn → openSettings) and profile/sign-out inside the Settings
   account page. It used to open a popup menu duplicating those entries —
   removed so the footer reads as identity, not a second settings surface.

   Identity mirrors the chatgpt.com drawer: avatar + name over plan tier,
   two quiet left-aligned lines. The full "name · tier" label also stays
   one hover away via `title` and is announced through `aria-label`. */
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
        {name ? <span className="user-name">{name}</span> : null}
        <span className="user-plan"><span className={`tier-badge ${user.tier}`}>{user.tierLabel}</span></span>
      </span>
    </div>
  );
}
