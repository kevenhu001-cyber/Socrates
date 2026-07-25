import { useSyncExternalStore } from 'react';

import { getLegacyActions } from '../legacy/gateway';
import { useUserInfo } from './legacyAdapter';

const NEW_CHAT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>';

export function SidebarHeader() {
  // Subscribe to the chrome bridge so the header re-renders on user change
  // (even though the header itself doesn't display user info, the bridge
  //  is the single React-side subscription for the chrome).
  useUserInfo();

  return (
    <>
      <div className="sidebar-logo">
        <img src="/logo.png" width="18" height="18" alt="" style={{ borderRadius: 3, flexShrink: 0 }} />
        <span><em>S</em>ocrates</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button
          className="icon-btn compose-btn"
          id="newChatBtn"
          title="Start a new chat"
          onClick={(e) => {
            e.preventDefault();
            getLegacyActions().navigation.resetApp();
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
