
import { getLegacyActions, t } from '../legacy/gateway.ts';
import { sidebarIcons } from '../../sidebar/sidebarIcons';
import { useUserInfo } from './sidebarChrome.bridge';

const NEW_CHAT_ICON = sidebarIcons.newChat;

/* Desktop shows chatgpt.com's panel glyph (the button toggles the rail);
   the phone drawer keeps the ×. styles/parity/sidebar.css picks one. */
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
