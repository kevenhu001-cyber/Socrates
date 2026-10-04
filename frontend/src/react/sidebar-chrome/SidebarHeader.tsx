
import { getLegacyActions, t } from '../legacy/gateway';
import { useUserInfo } from './sidebarChrome.bridge';

const NEW_CHAT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

/* Desktop shows chatgpt.com's panel glyph (the button toggles the rail);
   the phone drawer keeps the ×. styles/parity/sidebar.css picks one. */
const CLOSE_ICON =
  '<svg class="sidebar-toggle-panel" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2.5"/><path d="M7.25 3.75v12.5"/></svg>'
  + '<svg class="sidebar-toggle-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';

const SEARCH_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>';

export function SidebarHeader() {
  // Subscribe to the chrome bridge so the header re-renders on user change
  // (even though the header itself doesn't display user info, the bridge
  //  is the single React-side subscription for the chrome).
  useUserInfo();

  return (
    <>
      <div className="sidebar-logo">
        <img
          className="sidebar-logo-img"
          src="/logo.png"
          alt=""
          aria-hidden="true"
          width={20}
          height={20}
        />
        <span>Socrates</span>
        <svg className="cg-sidebar-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m7 10 5 5 5-5" />
        </svg>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
          className="btn-icon compose-btn"
          id="newChatBtn"
          title={t('sidebar.startNewChat')}
          aria-label={t('sidebar.startNewChat')}
          data-i18n-title="sidebar.startNewChat"
          data-i18n-aria="sidebar.startNewChat"
          onClick={(e) => {
            e.preventDefault();
            getLegacyActions().navigation.startNewChat();
          }}
          dangerouslySetInnerHTML={{ __html: NEW_CHAT_ICON }}
        />
        <button
          className="btn-icon"
          id="sidebarCloseBtn"
          title={t('chrome.closeSidebar')}
          aria-label={t('chrome.closeSidebar')}
          data-i18n-title="chrome.closeSidebar"
          data-i18n-aria="chrome.closeSidebar"
          aria-controls="sidebar"
          onClick={() => {
            getLegacyActions().navigation.toggleSidebar();
          }}
          dangerouslySetInnerHTML={{ __html: CLOSE_ICON }}
        />
      </div>
    </>
  );
}
