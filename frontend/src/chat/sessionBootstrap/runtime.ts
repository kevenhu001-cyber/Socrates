import { reportSwallow } from '../../util/reportSwallow.ts';

/** Session-start bridges published by the legacy shell. */
interface SessionBootstrapWindow extends Window {
  appMode?: string;
  webSearchOn?: boolean;
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
  try {
    const win = window as SessionBootstrapWindow;
    if (typeof window !== 'undefined' && win.appMode) return win.appMode;
  } catch (error) { reportSwallow(error, 'chat/sessionBootstrap.getAppMode'); }
  return 'chat';
}

export function isWebSearchOn(): boolean {
  try {
    const win = window as SessionBootstrapWindow;
    if (typeof window !== 'undefined' && typeof win.webSearchOn !== 'undefined') {
      return Boolean(win.webSearchOn);
    }
  } catch (error) { reportSwallow(error, 'chat/sessionBootstrap.isWebSearchOn'); }
  return true;
}

export function renderRecents(): void {
  try {
    const win = window as SessionBootstrapWindow;
    if (typeof window !== 'undefined' && typeof win.renderRecents === 'function') {
      win.renderRecents();
    }
  } catch (error) { reportSwallow(error, 'chat/sessionBootstrap.renderRecents'); }
}
