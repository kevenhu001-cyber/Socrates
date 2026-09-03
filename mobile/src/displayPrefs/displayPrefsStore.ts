/* Display preferences store — mirrors `frontend/src/displayPrefs.js`
 * (font scale + width scale + accent hue/custom + bg dark / light +
 * grid). Values below are 1:1 with the web defaults so both clients
 * boot identically; ThemeProvider derives live colors/layout from them.
 *
 * Frontend ground truth:
 *   DISPLAY_FONT_STEPS  = [1, 1.125, 1.25, 1.375] default 1.125 (M)
 *   DISPLAY_WIDTH_STEPS = [0.85, 1, 1.3, 1.7]    default 1 (M)
 *   content column      = 58rem * widthScale (928px at scale 1)
 *   accent presets      = hues [35,160,210,270,330,40] (40 Amber default)
 *   bg pickers          = free hex, defaults #212121 / #ffffff
 *   grid                = showGrid false default
 * See `frontend/src/displayPrefs.js:10-17`,
 * `frontend/src/styles.css:1050`, `frontend/index.html:427-432`. */
import { getItem, setItem } from '../platform/secureStorage';

const STORAGE_KEY = 'socrates.displayPrefs.v1';

/** Canonical web steps — single source for Settings UI labels. */
export const DISPLAY_FONT_STEPS = [1, 1.125, 1.25, 1.375] as const;
export const DISPLAY_WIDTH_STEPS = [0.85, 1, 1.3, 1.7] as const;
export const FONT_LABELS = ['S', 'M', 'L', 'XL'] as const;
export const WIDTH_LABELS = ['S', 'M', 'L', 'XL'] as const;
/** 58rem content column at 16px root (`styles.css:1050`). */
export const BASE_CONTENT_WIDTH = 928;

export function widthScaleToPx(scale: number): number {
  return Math.round(BASE_CONTENT_WIDTH * scale);
}

export function pxToWidthScale(px: number): number {
  let best: number = DISPLAY_WIDTH_STEPS[1];
  let bestDist = Math.abs(px - widthScaleToPx(best));
  for (const step of DISPLAY_WIDTH_STEPS) {
    const dist = Math.abs(px - widthScaleToPx(step));
    if (dist < bestDist) {
      bestDist = dist;
      best = step;
    }
  }
  return best;
}

export interface DisplayPrefs {
  fontScale: number;
  contentWidth: number;
  accentColor: string | null;
  bgDark: string | null;
  bgLight: string | null;
  gridEnabled: boolean;
}

const defaults: DisplayPrefs = {
  fontScale: 1.125,
  contentWidth: BASE_CONTENT_WIDTH,
  accentColor: null,
  bgDark: null,
  bgLight: null,
  gridEnabled: false,
};

type Listener = (prefs: DisplayPrefs) => void;

let prefs: DisplayPrefs = defaults;
const listeners = new Set<Listener>();
let hydrated = false;

function emit() {
  for (const l of listeners) l(prefs);
}

export const displayPrefsStore = {
  defaults,
  get(): DisplayPrefs {
    return prefs;
  },
  set(patch: Partial<DisplayPrefs>) {
    prefs = { ...prefs, ...patch };
    emit();
    void setItem(STORAGE_KEY, JSON.stringify(prefs)).catch(() => undefined);
  },
  reset() {
    prefs = defaults;
    emit();
    void setItem(STORAGE_KEY, JSON.stringify(defaults)).catch(() => undefined);
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  async hydrate() {
    if (hydrated) return;
    hydrated = true;
    try {
      const stored = await getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<DisplayPrefs>;
        prefs = { ...defaults, ...parsed };
        /* Migrate pre-P0 values to the canonical web steps so users
         * on the old mobile-only ladder (font 0.9/1/1.1/1.2,
         * width px 620/720/860/1024) land on the nearest web step
         * instead of a scale the web client can never produce. */
        const legacyFontMap: Record<string, number> = {
          '0.9': 1,
          '1': 1,
          '1.1': 1.125,
          '1.2': 1.25,
        };
        if (typeof prefs.fontScale === 'number' && !(DISPLAY_FONT_STEPS as readonly number[]).includes(prefs.fontScale)) {
          const key = String(prefs.fontScale);
          prefs.fontScale = legacyFontMap[key] ?? defaults.fontScale;
        }
        if (typeof prefs.contentWidth === 'number') {
          const canonicalPx = (DISPLAY_WIDTH_STEPS as readonly number[]).map(widthScaleToPx);
          if (!canonicalPx.includes(prefs.contentWidth)) {
            const legacyWidthMap: Record<string, number> = {
              '620': widthScaleToPx(0.85),
              '720': widthScaleToPx(1),
              '860': widthScaleToPx(1),
              '1024': widthScaleToPx(1.3),
            };
            prefs.contentWidth = legacyWidthMap[String(prefs.contentWidth)]
              ?? widthScaleToPx(pxToWidthScale(prefs.contentWidth));
          }
        }
        emit();
      }
    } catch {
      /* ignore — best effort */
    }
  },
};
