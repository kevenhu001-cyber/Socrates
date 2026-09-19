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
 * lightness ramp; in light mode the relationship flips (#ffffff over
 * #fafafa). Getting this backwards inverts the entire UI.
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
  /* --accent-000 / --accent-900 — monochrome */
  accent: {
    strong: '#ffffff',
    soft: '#333333',
    surface: '#333333',
  },
  /* --bg-100 / --bg-200 / --bg-000 / --bg-300 / --bg-400 */
  bg: {
    /* Web phone canvas is #000 (chat-surface.css:31-44, mobile-parity.css:530);
     * desktop web stays #212121 — Android matches the phone reference frame. */
    page: '#000000',
    raised: '#292929',
    overlay: '#0d0d0d',
    hover: '#363636',
    sunken: '#050505',
  },
  /* --text-100 / --text-200 / --text-400 / --text-500 */
  /* Web conversation tokens: --conversation-text #f5f5f5 /
   * --conversation-text-muted #a9a9a9 (chat-surface.css:16-17). */
  text: {
    primary: '#f5f5f5',
    secondary: '#cccccc',
    tertiary: '#a6a6a6',
    muted: '#a9a9a9',
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
  /* glyph color on the now-white active send button */
  onAccent: '#141414',
};

const lightHex: ThemePaletteHex = {
  mode: 'light',
  accent: {
    strong: '#1a1a1a',
    soft: '#e6e6e6',
    surface: '#e6e6e6',
  },
  bg: {
    /* Web phone light canvas is #fff (chat-surface.css:57). */
    page: '#ffffff',
    raised: '#f2f2f2',
    overlay: '#ffffff',
    hover: '#e8e8e8',
    sunken: '#ffffff',
  },
  text: {
    /* Web conversation tokens: #171717 / #717171 (chat-surface.css:61-62). */
    primary: '#171717',
    secondary: '#454545',
    tertiary: '#707070',
    muted: '#717171',
    disabled: '#858585',
  },
  border: {
    subtle: '#e0e0e0',
    default: '#c2c2c2',
    strong: '#b3b3b3',
  },
  danger: '#b82e2e',
  success: '#2d865c',
  muted: '#858585',
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
    scrollbar: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.20)',
    overlay: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.45)',
    reasoningBg: isDark ? '#1a1a1a' : '#efefef',
    reasoningFg: isDark ? '#a0a0a0' : '#4a4a4a',
    codeBg: isDark ? '#0a0a0a' : '#f0f0f0',
    codeFg: isDark ? '#e7e7e7' : '#1a1a1a',
    codeBorder: isDark ? '#232323' : '#d0d0d0',
    toolCardBg: isDark ? 'rgba(255,255,255,0.062)' : 'rgba(0,0,0,0.05)',
    toolCardBgHover: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
    toolCardBgSunken: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.032)',
    toolCardBorder: isDark ? 'rgba(255,255,255,0.095)' : 'rgba(0,0,0,0.11)',
    toolCardBorderStrong: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.19)',
    toolCardFocus: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)',
  };
}
