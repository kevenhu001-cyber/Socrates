import { Asset } from 'expo-asset';
import { FONTS as FONT_ASSETS } from './fontAssets';

/** Browser CSS selects only the faces/glyphs actually used on the page.
 * Never hand these assets to useFonts: it eagerly waits for all 3.5 MB of
 * CJK weights, even on an English login screen. Native keeps its own map. */
export const FONTS = {};

const FACES: ReadonlyArray<{ fontId: keyof typeof FONT_ASSETS; family: string; weight: number; range?: string }> = [
  { fontId: 'Inter_400Regular', family: 'Inter', weight: 400 },
  { fontId: 'Inter_500Medium', family: 'Inter', weight: 500 },
  { fontId: 'Inter_600SemiBold', family: 'Inter', weight: 600 },
  { fontId: 'Inter_700Bold', family: 'Inter', weight: 700 },
  // Inter covers Latin first. Restrict the large CJK files so English-only
  // pages do not download them merely to probe a missing glyph.
  { fontId: 'NotoSansSC_400Regular', family: 'Noto Sans SC', weight: 400, range: 'U+2E80-9FFF,U+F900-FAFF,U+FE30-FE4F,U+FF00-FFEF,U+20000-2FFFF' },
  { fontId: 'NotoSansSC_500Medium', family: 'Noto Sans SC', weight: 500, range: 'U+2E80-9FFF,U+F900-FAFF,U+FE30-FE4F,U+FF00-FFEF,U+20000-2FFFF' },
  { fontId: 'NotoSansSC_600SemiBold', family: 'Noto Sans SC', weight: 600, range: 'U+2E80-9FFF,U+F900-FAFF,U+FE30-FE4F,U+FF00-FFEF,U+20000-2FFFF' },
  { fontId: 'NotoSansSC109_400Regular', family: 'Noto Sans SC', weight: 400, range: 'U+A5,U+2192,U+2605' },
  { fontId: 'NotoSansSC109_500Medium', family: 'Noto Sans SC', weight: 500, range: 'U+A5,U+2192,U+2605' },
  { fontId: 'NotoSansSC109_600SemiBold', family: 'Noto Sans SC', weight: 600, range: 'U+A5,U+2192,U+2605' },
];

/** Idempotent across theme/language changes and hot reloads; no network wait. */
export function installWebFonts(): void {
  if (typeof document === 'undefined' || document.getElementById('socrates-web-fonts')) return;
  const style = document.createElement('style');
  style.id = 'socrates-web-fonts';
  style.textContent = FACES.map(({ fontId, family, weight, range }) => {
    const uri = Asset.fromModule(FONT_ASSETS[fontId]).uri;
    return `@font-face{font-family:${JSON.stringify(family)};font-style:normal;font-weight:${weight};src:url(${JSON.stringify(uri)}) format("woff2");font-display:swap;${range ? `unicode-range:${range};` : ''}}`;
  }).join('\n');
  document.head.appendChild(style);
}
