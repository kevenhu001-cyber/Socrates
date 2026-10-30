export type { SidebarUserSnapshot as SidebarChromeSnapshot, UserInfo } from '../../ui/sidebarUserState.ts';

declare global {
  interface Window {
    toggleSidebar?: () => void;
    resetApp?: () => void;
    openProfile?: () => void;
    toggleTheme?: (e: Event) => void;
    toggleDisplayPrefs?: () => void;
    openSettings?: () => void;
  }
}
