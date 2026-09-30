import { useUserInfo } from './sidebarChrome.bridge';
import { t as _t } from '../legacy/gateway';

function i18n(key: string, fallback: string): string {
  const v = _t(key);
  return v !== key ? v : fallback;
}

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
  /* The reference drawer's footer carries a small "升级" pill on the right
     for free-tier accounts; paid tiers see the bare identity row. It links
     to the same pricing page as ProfileModal's "Compare plans". CSS keeps
     it phone-only (polish/sidebar.css). */
  const upgradeLabel = i18n('sidebar.upgrade', 'Upgrade');

  return (
    <>
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
      {user.tier === 'diophantus' ? (
        <a
          className="sidebar-upgrade-pill"
          href="https://topodrive.top/pricing"
          aria-label={upgradeLabel}
        >
          {upgradeLabel}
        </a>
      ) : null}
    </>
  );
}
