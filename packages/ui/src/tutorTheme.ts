import { getThemePaletteHex, getUiSurfaceHex } from '@socrates/theme';

/**
 * Tutor compatibility palette derived from the canonical Socrates theme.
 *
 * This used to freeze a second copy of the old ChatGPT-derived neutral ramp.
 * Socrates Design System v2 keeps the Tutor surface shape for compatibility,
 * but every value now resolves from `@socrates/theme` so Web and Universal App
 * cannot drift when the foundation palette changes.
 */
export function getTutorLegacyPalette(mode: 'light' | 'dark') {
  const base = getThemePaletteHex(mode);
  const surfaces = getUiSurfaceHex(mode);

  return {
    accent: base.accent.strong,
    success: base.success,
    border: base.border.strong,
    bg: {
      sidebar: surfaces.sidebar,
      raised: base.bg.overlay,
      soft: base.bg.hover,
      card: surfaces.surface,
    },
    text: {
      primary: base.text.primary,
      secondary: base.text.secondary,
      tertiary: base.text.tertiary,
      caption: base.text.tertiary,
      muted: base.text.muted,
    },
    rgba: {
      accent08: tutorRgba(base.accent.strong, 0.08),
      accent12: tutorRgba(base.accent.strong, 0.12),
      soft80: tutorRgba(base.bg.hover, 0.8),
    },
  } as const;
}

export function tutorRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const rgb = value.length === 3
    ? value.split('').map((channel) => parseInt(channel + channel, 16))
    : [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  return `rgba(${rgb.join(',')},${alpha})`;
}
