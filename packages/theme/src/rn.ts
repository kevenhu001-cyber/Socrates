/**
 * RN-native helpers built on top of `@socrates/theme/tokens`.
 *
 * React Native does not parse `hsl(H S% L%)` triplet strings — only hex
 * / rgb / rgba / named colors. This module precomputes the canonical
 * hex equivalent of every token color so RN components can consume
 * them without rewriting the palette. The values are intentionally
 * stable: do not introduce per-mode drift between tokens.ts and the
 * hex table; if either changes, regenerate both.
 *
 * Source: `frontend/src/styles.css` — the `[data-theme=socrates][data-mode=…]`
 * blocks, which are what the web app actually paints. `styles/themes.css`
 * (the `--ui-*` namespace) is an M1 forward-port that does NOT match the
 * rendered result and must not be used as the reference.
 *
 * Role mapping — the web app aliases its raw ramps at `:root`:
 *   --surface-page:    var(--bg-100)   -> bg.page
 *   --surface-raised:  var(--bg-200)   -> bg.raised
 *   --surface-overlay: var(--bg-000)   -> bg.overlay   (cards, modals, composer, user bubble)
 *   --surface-hover:   var(--bg-300)   -> bg.hover
 *   --surface-input:   var(--bg-000)   -> bg.overlay
 *   --text-primary:    var(--text-100) -> text.primary
 *   --text-secondary:  var(--text-400) -> text.tertiary
 *   --text-tertiary:   var(--text-500) -> text.muted
 *   --border-default:  var(--border-300) -> border.default
 *   --accent:          var(--accent-000) -> accent.strong
 *   --accent-bg:       var(--accent-900) -> accent.soft
 *
 * Consequence worth remembering: in dark mode `bg.overlay` (#0d0d0d) is
 * DARKER than `bg.page` (#212121). Cards sit below the page on the
 * lightness ramp; in light mode the relationship flips (#fcfbf8 over
 * #f7f6f2). Getting this backwards inverts the entire UI.
 */

import {
  palettes,
  type ThemePalette,
  type ThemeMode,
} from './tokens';

export interface ThemePaletteHex extends Omit<ThemePalette, 'accent' | 'bg' | 'text' | 'border' | 'danger' | 'success' | 'muted' | 'onAccent'> {
  readonly accent: {
    readonly strong: string;
    readonly soft: string;
    readonly surface: string;
  };
  readonly bg: {
    readonly page: string;
    readonly raised: string;
    readonly overlay: string;
    readonly hover: string;
    readonly sunken: string;
  };
  readonly text: {
    readonly primary: string;
    readonly secondary: string;
    readonly tertiary: string;
    readonly muted: string;
    readonly disabled: string;
  };
  readonly border: {
    readonly subtle: string;
    readonly default: string;
    readonly strong: string;
  };
  readonly danger: string;
  readonly success: string;
  readonly muted: string;
  readonly onAccent: string;
}

const darkHex: ThemePaletteHex = {
  mode: 'dark',
  /* --accent-000 / --accent-900 */
  accent: {
    strong: '#e9be53',
    soft: '#473c1f',
    surface: '#473c1f',
  },
  /* --bg-100 / --bg-200 / --bg-000 / --bg-300 / --bg-400 */
  bg: {
    page: '#212121',
    raised: '#292929',
    overlay: '#0d0d0d',
    hover: '#363636',
    sunken: '#050505',
  },
  /* --text-100 / --text-200 / --text-400 / --text-500 */
  text: {
    primary: '#ffffff',
    secondary: '#cccccc',
    tertiary: '#a6a6a6',
    muted: '#8c8c8c',
    disabled: '#8c8c8c',
  },
  /* --border-100 / --border-300 / --border-400 */
  border: {
    subtle: '#383838',
    default: '#383838',
    strong: '#383838',
  },
  /* hsl(0 65% 62%) / hsl(145 50% 50%) */
  danger: '#dd5f5f',
  success: '#40bf75',
  muted: '#8c8c8c',
  /* --oncolor-100 — the glyph color on `.send-btn.active` */
  onAccent: '#ffffff',
};

const lightHex: ThemePaletteHex = {
  mode: 'light',
  accent: {
    strong: '#b18925',
    soft: '#f0eadb',
    surface: '#f0eadb',
  },
  bg: {
    page: '#f7f6f2',
    raised: '#efece7',
    overlay: '#fcfbf8',
    hover: '#e3dfd9',
    sunken: '#ffffff',
  },
  text: {
    primary: '#2d2925',
    secondary: '#4d4842',
    tertiary: '#746f67',
    muted: '#868079',
    disabled: '#868079',
  },
  border: {
    subtle: '#e0dcd7',
    default: '#cdc8c1',
    strong: '#beb9b1',
  },
  danger: '#b82e2e',
  success: '#2d865c',
  muted: '#868079',
  onAccent: '#ffffff',
};

export const palettesHex: Readonly<Record<ThemeMode, ThemePaletteHex>> = {
  dark: darkHex,
  light: lightHex,
};

export function getThemePaletteHex(mode: ThemeMode): ThemePaletteHex {
  return palettesHex[mode];
}

/** Drop-in replacement for mobile's existing `Palette` shape so the
 *  ThemeProvider can swap its source without touching call-sites.
 *  Add new fields here when mobile's local `theme.ts` adds more. */
export interface MappedPalette extends ThemePaletteHex {
  /** `statusBarStyle` is an RN/Expo convention not in tokens.ts. */
  readonly statusBarStyle: 'light' | 'dark';
  /** `white` / `black` convenience colors used by mobile buttons. */
  readonly white: string;
  readonly black: string;
  /** Generic scrollbar tint. */
  readonly scrollbar: string;
  /** Generic overlay tint (for backdrop modals). */
  readonly overlay: string;
  /** Reasoning card backgrounds — used by MessageBubble. */
  readonly reasoningBg: string;
  readonly reasoningFg: string;
  /** Code block container colors. */
  readonly codeBg: string;
  readonly codeFg: string;
  readonly codeBorder: string;
  /** Tool card container colors. */
  readonly toolCardBg: string;
  readonly toolCardBgHover: string;
  readonly toolCardBgSunken: string;
  readonly toolCardBorder: string;
  readonly toolCardBorderStrong: string;
  readonly toolCardFocus: string;
}

export function buildMappedPalette(mode: ThemeMode): MappedPalette {
  const base = palettesHex[mode];
  const isDark = mode === 'dark';
  return {
    ...base,
    statusBarStyle: isDark ? 'light' : 'dark',
    white: '#ffffff',
    black: '#000000',
    scrollbar: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(26,22,14,0.20)',
    overlay: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(26,22,14,0.45)',
    reasoningBg: isDark ? '#1a1d24' : '#e1d6b8',
    reasoningFg: isDark ? '#9da4af' : '#4d443a',
    codeBg: isDark ? '#0a0c10' : '#ddd2b6',
    codeFg: isDark ? '#e7eaf0' : '#1a160e',
    codeBorder: isDark ? '#1f2330' : '#b8ac8e',
    toolCardBg: isDark ? 'rgba(255,255,255,0.062)' : 'rgba(26,22,14,0.05)',
    toolCardBgHover: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(26,22,14,0.08)',
    toolCardBgSunken: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(26,22,14,0.032)',
    toolCardBorder: isDark ? 'rgba(255,255,255,0.095)' : 'rgba(26,22,14,0.11)',
    toolCardBorderStrong: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(26,22,14,0.19)',
    toolCardFocus: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(26,22,14,0.35)',
  };
}
