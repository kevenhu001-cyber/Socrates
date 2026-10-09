import { reportSwallow } from '../../util/reportSwallow.ts';

export function translate(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      const value = window.t(key);
      if (value && value !== key) return value;
    }
  } catch (error) { reportSwallow(error, 'chat/sessionBootstrap.translate'); }
  return fallback != null ? fallback : key;
}

export function getAppMode() {
  try {
    if (typeof window !== 'undefined' && window.appMode) return window.appMode;
  } catch (error) { reportSwallow(error, 'chat/sessionBootstrap.getAppMode'); }
  return 'chat';
}

export function isWebSearchOn() {
  try {
    if (typeof window !== 'undefined' && typeof window.webSearchOn !== 'undefined') {
      return Boolean(window.webSearchOn);
    }
  } catch (error) { reportSwallow(error, 'chat/sessionBootstrap.isWebSearchOn'); }
  return true;
}

export function renderRecents() {
  try {
    if (typeof window !== 'undefined' && typeof window.renderRecents === 'function') {
      window.renderRecents();
    }
  } catch (error) { reportSwallow(error, 'chat/sessionBootstrap.renderRecents'); }
}
