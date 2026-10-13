import { getLegacyActions, t } from '../legacy/gateway.ts';
import { sidebarIcons } from '../../sidebar/sidebarIcons';
import { useUserInfo } from './sidebarChrome.bridge';

/* Desktop shows the panel glyph while the phone drawer keeps the ×.
   styles/parity/sidebar.css chooses the visible glyph per breakpoint. */
const CLOSE_ICON =
  sidebarIcons.panel.replace('<svg ', '<svg class="sidebar-toggle-panel" ')
  + sidebarIcons.close.replace('<svg ', '<svg class="sidebar-toggle-close" ');

const SEARCH_ICON = sidebarIcons.search;

export function SidebarHeader() {
  // Subscribe to the chrome bridge so the header re-renders on user change
  // (even though the header itself doesn't display user info, the bridge
  //  is the single React-side subscription for the chrome).
  useUserInfo();

  return (
    <>
      <div className="sidebar-logo" style={{ height: 36, padding: '0 4px', gap: 0 }}>
        <img
          className="sidebar-logo-img"
          src="/logo.png"
          alt=""
          aria-hidden="true"
          width={26}
          height={26}
          style={{ width: 26, height: 26, borderRadius: 0 }}
        />
      </div>
      <div className="sidebar-header-actions">
        <button
          className="btn-icon sidebar-search-btn"
          id="sidebarSearchBtn"
          type="button"
          title={t('sidebar.searchPlaceholder')}
          aria-label={t('sidebar.searchPlaceholder')}
          data-i18n-title="sidebar.searchPlaceholder"
          data-i18n-aria="sidebar.searchPlaceholder"
          aria-controls="sidebarSearch"
          aria-expanded="false"
          onClick={(event) => {
            const button = event.currentTarget;
            const sidebar = document.getElementById('sidebar');
            const input = document.getElementById('sidebarSearch') as HTMLInputElement | null;
            const open = !sidebar?.classList.contains('search-open');
            sidebar?.classList.toggle('search-open', open);
            button.setAttribute('aria-expanded', String(open));
            if (open) window.requestAnimationFrame(() => input?.focus());
          }}
          dangerouslySetInnerHTML={{ __html: SEARCH_ICON }}
        />
        <button
          className="btn-icon"
          id="sidebarCloseBtn"
          type="button"
          title={t('chrome.closeSidebar')}
          aria-label={t('chrome.closeSidebar')}
          data-i18n-title="chrome.closeSidebar"
          data-i18n-aria="chrome.closeSidebar"
          aria-controls="sidebar"
          style={{ width: 36, minWidth: 36, height: 36, minHeight: 36, borderRadius: 8 }}
          onClick={() => {
            getLegacyActions().navigation.toggleSidebar();
          }}
          dangerouslySetInnerHTML={{ __html: CLOSE_ICON }}
        />
      </div>
    </>
  );
}
