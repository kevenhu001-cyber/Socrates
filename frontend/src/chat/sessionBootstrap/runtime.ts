import { reportSwallow } from '../../util/reportSwallow.ts';
import { appMode, webSearchOn } from '../../config/providers.ts';

/** Session-start bridges published by the legacy shell. */
interface SessionBootstrapWindow extends Window {
  renderRecents?: () => void;
}

export function translate(key: string, fallback?: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      const value = window.t(key);
      if (value && value !== key) return value;
    }
  } catch (error) { reportSwallow(error, 'chat/sessionBootstrap.translate'); }
  return fallback != null ? fallback : key;
}

export function getAppMode(): string {
  return appMode;
}

export function isWebSearchOn(): boolean {
  return webSearchOn;
}

export function renderRecents(): void {
  try {
    const win = window as SessionBootstrapWindow;
    if (typeof window !== 'undefined' && typeof win.renderRecents === 'function') {
      win.renderRecents();
    }
  } catch (error) { reportSwallow(error, 'chat/sessionBootstrap.renderRecents'); }
}
