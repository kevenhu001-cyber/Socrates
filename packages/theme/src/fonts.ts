/**
 * Typography families — the RN-side counterpart of the frontend's
 * `--font-sans` stack (`frontend/src/styles/foundations/fonts.css`:
 * `@fontsource/inter` + `@fontsource/noto-sans-sc`).
 *
 * Components must never hardcode a platform font (Roboto / San Francisco /
 * System): every text style picks its family from here. The RN-side family
 * names below mirror the fontsource faces the SPA bundles, so shared RN
 * components measure identically whether rendered on Web or a native client.
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

/** The web adapter registers the bundled faces with their real weights. Put
 * both ahead of system fallback so common Chinese glyphs use Noto Sans SC. */
export const WEB_FONT_FAMILY = '"Inter", "Noto Sans SC", system-ui, sans-serif';
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
