import { Platform } from 'react-native';
import { useWindowDimensions } from 'react-native';

/** Breakpoint ladder — mirrors `packages/theme/src/tokens.ts`. */
export const breakpoints = {
  sm: 480,
  md: 768,
  lg: 1200,
} as const;

export type BreakpointToken = keyof typeof breakpoints;

/* The web shell has three geometry tiers: 300px for the compact/tablet
 * sidebar, 260px for the wide desktop sidebar, and the same 300px panel when
 * the mobile drawer is presented over the page. */
const MOBILE_DRAWER_WIDTH = 300;
const TABLET_DRAWER_WIDTH = 300;
const DESKTOP_DRAWER_WIDTH = 260;

export interface ResponsiveValue {
  isCompact: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
  height: number;
  platform: typeof Platform.OS;
  /** Sidebar width in pixels when the drawer is rendered as a permanent
   *  surface (tablet / desktop). `null` when the modal drawer is used. */
  sidebarWidth: number | null;
}

/**
 * Single source of truth for screen-size-derived layout decisions. Mirrors
 * frontend's @media ladder so the same <=768 / >768
 * breakpoints produce the same shell across both clients
 * (`frontend/src/styles.css:956`
 * @media(min-width:769px) uses the compact 300px sidebar until the wide
 * desktop shell switches to 260px.
 *
 * Behaviour notes:
 *  - Permanent vs modal is width-only (width > 768), matching the
 *    web shell. The previous Android-only-modal exception broke 1:1
 *    on tablets and has been removed.
 *  - The returned `sidebarWidth` is `null` when the modal drawer should
 *    be used; callers can subtract it from their content padding.
 */
export function useResponsive(): ResponsiveValue {
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= breakpoints.lg;
  /* frontend uses max-width:768px for the mobile shell; keep 768 itself
   * compact so the boundary does not render a permanent sidebar one client
   * and an overlay drawer in the other. */
  const isCompact = width <= breakpoints.md;
  const isTablet = width > breakpoints.md && width < breakpoints.lg;

  const sidebarWidth: number | null = isCompact
    ? null
    : isDesktop
      ? DESKTOP_DRAWER_WIDTH
      : TABLET_DRAWER_WIDTH;

  return {
    isCompact,
    isTablet,
    isDesktop,
    width,
    height,
    platform: Platform.OS,
    sidebarWidth,
  };
}

export const mobileDrawerWidth = MOBILE_DRAWER_WIDTH;

/** Style helper: applies `paddingLeft = sidebarWidth` on tablet/desktop. */
export function sidebarInsetStyle(sidebarWidth: number | null) {
  if (!sidebarWidth) return undefined;
  return { paddingLeft: sidebarWidth } as const;
}
