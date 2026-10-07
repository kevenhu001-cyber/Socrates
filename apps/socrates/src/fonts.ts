/**
 * Font assets for the Universal App.
 *
 * The woff2 binaries are byte-identical copies of the packages the baseline
 * SPA bundles (`@fontsource/inter`, `@fontsource/noto-sans-sc` — see
 * `frontend/src/styles/foundations/fonts.css`), so both clients render the
 * exact same faces. The map keys are the family names declared in
 * `@socrates/theme` (`FONT_FAMILY` / `CJK_FONT_FAMILY`); keep them in sync.
 */
export const FONTS = {
  Inter_400Regular: require('../assets/fonts/Inter-400.woff2'),
  Inter_500Medium: require('../assets/fonts/Inter-500.woff2'),
  Inter_600SemiBold: require('../assets/fonts/Inter-600.woff2'),
  Inter_700Bold: require('../assets/fonts/Inter-700.woff2'),
  NotoSansSC_400Regular: require('../assets/fonts/NotoSansSC-400.woff2'),
  NotoSansSC_500Medium: require('../assets/fonts/NotoSansSC-500.woff2'),
  NotoSansSC_600SemiBold: require('../assets/fonts/NotoSansSC-600.woff2'),
} as const;
