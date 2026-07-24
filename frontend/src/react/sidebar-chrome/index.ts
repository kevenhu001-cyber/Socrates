export { SidebarHeader } from './SidebarHeader';
export { SidebarFooter } from './SidebarFooter';
export { installSidebarChromeBridge, getSidebarChromeSnapshot, subscribeToSidebarChrome } from './sidebarChromeStore';
export { useSidebarChromeSnapshot, useUserInfo } from './legacyAdapter';
export type { SidebarChromeSnapshot, SidebarChromeBridge, UserInfo } from './types';
