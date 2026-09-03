import { Platform } from 'react-native';
import { useWindowDimensions } from 'react-native';

/** Breakpoint ladder — mirrors `packages/theme/src/tokens.ts`. */
export const breakpoints = {
  sm: 480,
  md: 768,
  lg: 1200,
} as const;

export type BreakpointToken = keyof typeof breakpoints;

/** Drawer permanent-mode width. P0 1:1 — frontend
 * `.sidebar { width: var(--app-sidebar-width, 18rem) }` = 288px
 * (`frontend/src/styles.css:176,956`) on every viewport where the
 * sidebar is permanent. No tablet/desktop split. */
const PERMANENT_DRAWER_WIDTH = 288;

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
 * frontend's `@media` ladder so the same `<768 / ≥769`
 * breakpoints produce the same shell across both clients
 * (`frontend/src/styles.css:956`
 * `@media(min-width:769px){.main{padding-left:var(--app-sidebar-width,18rem)}}`).
 *
 * Behaviour notes:
 *  - Permanent vs modal is width-only (`width >= 768`), matching the
 *    web shell. The previous Android-only-modal exception broke 1:1
 *    on tablets and has been removed.
 *  - The returned `sidebarWidth` is `null` when the modal drawer should
 *    be used; callers can subtract it from their content padding.
 */
export function useResponsive(): ResponsiveValue {
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= breakpoints.lg;
  const isTablet = width >= breakpoints.md && width < breakpoints.lg;
  const isCompact = width < breakpoints.md;

  const sidebarWidth: number | null = isCompact ? null : PERMANENT_DRAWER_WIDTH;

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

/** Style helper: applies `paddingLeft = sidebarWidth` on tablet/desktop. */
export function sidebarInsetStyle(sidebarWidth: number | null) {
  if (!sidebarWidth) return undefined;
  return { paddingLeft: sidebarWidth } as const;
}