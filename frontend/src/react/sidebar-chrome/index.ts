export { SidebarHeader } from './SidebarHeader';
export { SidebarFooter } from './SidebarFooter';
export {
  installSidebarChromeBridge,
  getSidebarChromeSnapshot,
  subscribeToSidebarChrome,
  useSidebarChromeSnapshot,
  useUserInfo,
} from './sidebarChrome.bridge';
export type { SidebarChromeSnapshot, SidebarChromeBridge, UserInfo } from './types';
