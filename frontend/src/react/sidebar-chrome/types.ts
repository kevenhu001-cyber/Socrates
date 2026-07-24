/**
 * Shared contracts for the sidebar chrome (header + footer) React migration boundary.
 *
 * The legacy `ui/profile.js` owns the user info and `renderUserFooter()`.
 * In React mode, the bridge publishes the user snapshot so the footer
 * React tree can render the avatar, name, and tier badge.
 */

export interface UserInfo {
  initials: string;
  displayName: string;
  email: string;
  tier: string;
  tierLabel: string;
  isSignedIn: boolean;
}

export interface SidebarChromeSnapshot {
  user: UserInfo;
  revision: number;
}

export interface SidebarChromeBridge {
  getSnapshot: () => SidebarChromeSnapshot;
  publish: (snapshot: Omit<SidebarChromeSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesSidebarChromeBridge?: SidebarChromeBridge;
    toggleSidebar?: () => void;
    resetApp?: () => void;
    openProfile?: () => void;
    toggleTheme?: (e: Event) => void;
    toggleDisplayPrefs?: () => void;
    openSettings?: () => void;
  }
}
