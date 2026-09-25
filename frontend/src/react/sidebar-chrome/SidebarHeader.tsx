
import { getLegacyActions } from '../legacy/gateway';
import { useUserInfo } from './sidebarChrome.bridge';

const NEW_CHAT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';

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
          className="icon-btn sidebar-search-btn"
          id="sidebarSearchBtn"
          type="button"
          title="Search chats"
          aria-label="Search chats"
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
          className="icon-btn compose-btn"
          id="newChatBtn"
          title="Start a new chat"
          aria-label="Start a new chat"
          onClick={(e) => {
            e.preventDefault();
            getLegacyActions().navigation.startNewChat();
          }}
          dangerouslySetInnerHTML={{ __html: NEW_CHAT_ICON }}
        />
        <button
          className="icon-btn"
          id="sidebarCloseBtn"
          title="Close sidebar"
          aria-label="Close sidebar"
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
