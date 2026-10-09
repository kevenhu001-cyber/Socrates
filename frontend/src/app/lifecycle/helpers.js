import { reportSwallow } from '../../util/reportSwallow.ts';

/** Resolve an i18n key with a readable fallback during early boot. */
export function translateLifecycleText(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      const value = window.t(key);
      if (value && value !== key) return value;
    }
  } catch (error) { reportSwallow(error, 'app/lifecycle.translate'); }
  return fallback != null ? fallback : key;
}
