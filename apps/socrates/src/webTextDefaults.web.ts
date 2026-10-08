import { WEB_FONT_FAMILY } from '@socrates/theme';

/* Symbols the SPA takes from fontsource subset 109 (see `src/fonts.ts`). */
const NOTO_SUBSET_109_SYMBOLS = 'U+a5,U+2192,U+2605';

const EXPO_FACES: Readonly<Record<string, { family: string; weight: string; unicodeRange?: string }>> = {
  Inter_400Regular: { family: 'Inter', weight: '400' },
  Inter_500Medium: { family: 'Inter', weight: '500' },
  Inter_600SemiBold: { family: 'Inter', weight: '600' },
  Inter_700Bold: { family: 'Inter', weight: '700' },
  NotoSansSC_400Regular: { family: 'Noto Sans SC', weight: '400' },
  NotoSansSC_500Medium: { family: 'Noto Sans SC', weight: '500' },
  NotoSansSC_600SemiBold: { family: 'Noto Sans SC', weight: '600' },
  NotoSansSC109_400Regular: { family: 'Noto Sans SC', weight: '400', unicodeRange: NOTO_SUBSET_109_SYMBOLS },
  NotoSansSC109_500Medium: { family: 'Noto Sans SC', weight: '500', unicodeRange: NOTO_SUBSET_109_SYMBOLS },
  NotoSansSC109_600SemiBold: { family: 'Noto Sans SC', weight: '600', unicodeRange: NOTO_SUBSET_109_SYMBOLS },
};

/** Register Expo's static assets with the same CSS family/weight descriptors
 * as the SPA, then match its inherited Web text rasterization defaults. */
export function installWebTextDefaults(theme: 'dark' | 'light' = 'dark'): void {
  if (typeof document === 'undefined') return;
  const expoFonts = document.getElementById('expo-generated-fonts') as HTMLStyleElement | null;
  const rules = expoFonts?.sheet?.cssRules;
  if (rules) {
    for (const rule of Array.from(rules)) {
      if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
      const face = rule as CSSFontFaceRule;
      const declaredFamily = face.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
      const mapped = EXPO_FACES[declaredFamily];
      if (!mapped) continue;
      face.style.setProperty('font-family', `"${mapped.family}"`);
      face.style.setProperty('font-weight', mapped.weight);
      if (mapped.unicodeRange) face.style.setProperty('unicode-range', mapped.unicodeRange);
    }
  }
  const root = document.documentElement;
  root.style.setProperty('font-family', WEB_FONT_FAMILY);
  root.style.setProperty('color-scheme', theme);
  root.style.setProperty('-webkit-font-smoothing', 'antialiased');
  root.style.setProperty('-moz-osx-font-smoothing', 'grayscale');
  root.style.setProperty('text-rendering', 'optimizeLegibility');

  const renderingFixes = document.getElementById('socrates-web-text-rendering') as HTMLStyleElement | null
    || document.createElement('style');
  renderingFixes.id = 'socrates-web-text-rendering';
  renderingFixes.textContent = `
    /* RNW's FlatList applies an identity translate transform to its web
       scroll container. The baseline SPA does not transform the transcript;
       disabling it here preserves native scrolling while matching browser
       text rasterization on Web. */
    #socrates-message-list { transform: none !important; will-change: auto !important; }
    /* The SPA promotes its sidebar for the drawer transition. Matching that
       paint layer removes the RNW sidebar text raster mismatch without
       moving the sidebar or changing its Android/iOS behavior. */
    #socrates-sidebar { will-change: transform !important; }
    /* RNW's sidebar ScrollView adds an identity transform on Web; the SPA's
       recents list has none. Drop only that Web paint hint to match its text. */
    #socrates-sidebar-recents { transform: none !important; }
    #socrates-composer-shell { background-clip: padding-box !important; }
    /* RNW emits a positioned z-index:0 stack for Web controls; the SPA's
       composer and message rows/actions use z-index:auto. */
    #socrates-composer-shell,
    #socrates-message-toolbar,
    #socrates-message-toolbar > *,
    [id^="socrates-message-row-"] { z-index: auto !important; }
    /* The SPA chat input bar owns z-index:10 above the transcript. */
    #socrates-composer-slot { z-index: 10 !important; }
    @media (min-width: 769px) {
      #socrates-composer-shell { box-shadow: inset 0 0 1px 0 rgba(255, 255, 255, 0.12) !important; }
      #socrates-message-toolbar svg { shape-rendering: crispEdges !important; }
    }
    [id^="socrates-sidebar-session-title"],
    [id^="socrates-sidebar-session-title"] *,
    [data-testid="socrates-sidebar-session-title"],
    [data-testid="socrates-sidebar-session-title"] * { text-rendering: optimizeLegibility !important; }
    #socrates-sidebar-user-name,
    #socrates-sidebar-user-name *,
    [data-testid="socrates-sidebar-user-name"],
    [data-testid="socrates-sidebar-user-name"] * { text-rendering: auto !important; }
    #socrates-sidebar-user-avatar-text,
    #socrates-sidebar-user-plan { text-rendering: auto !important; text-align: left !important; }
    #socrates-sidebar-user-avatar-text { white-space: normal !important; overflow-wrap: normal !important; }
    [id^="socrates-sidebar-nav-badge-"] { white-space: nowrap !important; overflow-wrap: normal !important; }
    #socrates-topbar-summary-label,
    [data-testid="socrates-topbar-summary-label"] {
      text-rendering: auto !important;
      text-align: center !important;
      white-space: normal !important;
      overflow-wrap: normal !important;
    }
    [id^="socrates-effort-text-"] {
      text-align: center !important;
      white-space: nowrap !important;
      overflow-wrap: normal !important;
    }
    #socrates-composer-input::placeholder {
      text-rendering: optimizeLegibility !important;
      text-align: left !important;
      white-space: nowrap !important;
      font-variant-ligatures: none !important;
      font-feature-settings: "liga" 0 !important;
    }
    [id^="socrates-message-assistant-"],
    [id^="socrates-message-assistant-"] *,
    [id^="socrates-message-user-"],
    [id^="socrates-message-user-"] * {
      white-space: normal !important;
      word-break: break-word !important;
    }
    [id^="socrates-message-user-"] { overflow-wrap: anywhere !important; }
    [id^="socrates-message-user-"] * { overflow-wrap: anywhere !important; }
    [id^="socrates-message-assistant-"] { overflow-wrap: anywhere !important; }
    [id^="socrates-message-assistant-"] * { overflow-wrap: anywhere !important; }
    #socrates-sidebar-recents-title,
    [id^="socrates-sidebar-recents-time-"] {
      white-space: normal !important;
      overflow-wrap: normal !important;
    }
    #socrates-sidebar-logo-text,
    #socrates-sidebar-logo-text *,
    #socrates-model-name,
    #socrates-model-name * {
      position: static !important;
      unicode-bidi: normal !important;
    }
    /* Tutor knowledge detail: RNW Text defaults (pre-wrap / break-word /
       isolate / relative) rasterize differently from the baseline's plain
       DOM text (normal / normal / normal / static). Normalize the whole
       detail subtree; the textarea's plaintext bidi becomes normal too. */
    [data-testid="socrates-kb-detail"],
    [data-testid="socrates-kb-detail"] *,
    [data-testid="socrates-kb-file-list"],
    [data-testid="socrates-kb-file-list"] *,
    [data-testid="socrates-mistakes-panel"],
    [data-testid="socrates-mistakes-panel"] * {
      white-space: normal !important;
      overflow-wrap: normal !important;
      unicode-bidi: normal !important;
      position: static !important;
    }
    /* The SPA note is a plain <textarea> (resize: vertical) whose grip is
       painted in the corner; RNW resets TextInput to resize: none. */
    [data-testid="socrates-kb-detail"] textarea { resize: vertical !important; }
    #socrates-sidebar-user-name { text-align: left !important; }
    #socrates-model-name,
    #socrates-model-subtitle { text-align: center !important; }
    @media (max-width: 768px) {
      [id^="socrates-message-user-"],
      [id^="socrates-message-user-"] *,
      [id^="socrates-message-assistant-"],
      [id^="socrates-message-assistant-"] * { overflow-wrap: normal !important; }
      #socrates-topbar-summary-label,
      [data-testid="socrates-topbar-summary-label"] { line-height: normal !important; }
    }
  `;
  if (!renderingFixes.isConnected) document.head.append(renderingFixes);
}
