import { reportSwallow } from '../../util/reportSwallow.ts';
import { appMode, webSearchOn } from '../../config/providers.ts';
import { t } from '../../i18n.ts';

export { renderRecents } from '../../ui/recentsView.ts';

export function translate(key: string, fallback?: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      const value = window.t(key);
      if (value && value !== key) return value;
    }
    const val = t(key);
    if (val && val !== key) return val;
  } catch (error) { reportSwallow(error, 'chat/sessionBootstrap.translate'); }
  return fallback != null ? fallback : key;
}

export function getAppMode(): string {
  return appMode;
}

export function isWebSearchOn(): boolean {
  return webSearchOn;
}
