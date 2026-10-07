/**
 * Typography families — the RN-side counterpart of the frontend's
 * `--font-sans` stack (`frontend/src/styles/foundations/fonts.css`:
 * `@fontsource/inter` + `@fontsource/noto-sans-sc`).
 *
 * The woff2 binaries in `apps/socrates/assets/fonts/` are byte-identical
 * copies of the fontsource files the SPA bundles, and expo-font registers
 * each one under the family name below. Components must never hardcode a
 * platform font (Roboto / San Francisco / System): every text style picks
 * its family from here so the Universal App measures identically to the
 * baseline SPA.
 *
 * `front(family)` mirrors the SPA's CSS stack behaviour (`Inter` first,
 * `Noto Sans SC` for CJK) by language, because React Native cannot fall
 * back per glyph the way a font stack does.
 */

/** Latin face — Inter, the exact font the SPA ships. */
export const FONT_FAMILY = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** CJK face — Noto Sans SC, second entry of the SPA's `--font-sans`. */
export const CJK_FONT_FAMILY = {
  regular: 'NotoSansSC_400Regular',
  medium: 'NotoSansSC_500Medium',
  semibold: 'NotoSansSC_600SemiBold',
  bold: 'NotoSansSC_600SemiBold',
} as const;

export type FontWeight = keyof typeof FONT_FAMILY;

/** Resolve the family for a weight + UI language (en → Inter, zh → Noto). */
export function fontFamily(weight: FontWeight = 'regular', language: 'en' | 'zh' = 'en'): string {
  return language === 'zh' ? CJK_FONT_FAMILY[weight] : FONT_FAMILY[weight];
}

/** Monospace face for inline code / code blocks (SPA: `--font-mono`). */
export const MONO_FAMILY = 'Menlo';
