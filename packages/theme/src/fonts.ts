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

/** Exact SPA CSS family stack. On Web, the platform adapter registers the
 * Expo font assets under these family names and their real weight values;
 * native clients continue to use the named static families above. */
export const WEB_FONT_FAMILY = '"Inter", "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const WEB_FONT_WEIGHT: Readonly<Record<FontWeight, '400' | '500' | '600' | '700'>> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

/** Resolve the family for a weight + UI language (en → Inter, zh → Noto). */
export function fontFamily(weight: FontWeight = 'regular', language: 'en' | 'zh' = 'en'): string {
  return language === 'zh' ? CJK_FONT_FAMILY[weight] : FONT_FAMILY[weight];
}

/** Resolve a font style for the target renderer. On Web, CSS weight matching
 * selects among the same static font files as the SPA's @font-face rules. */
export function fontStyle(weight: FontWeight = 'regular', language: 'en' | 'zh' = 'en', web = false): { fontFamily: string; fontWeight?: '400' | '500' | '600' | '700' } {
  return web
    ? { fontFamily: WEB_FONT_FAMILY, fontWeight: WEB_FONT_WEIGHT[weight] }
    : { fontFamily: fontFamily(weight, language) };
}

/** Monospace face for inline code / code blocks (SPA: `--font-mono`). */
export const MONO_FAMILY = 'Menlo';
