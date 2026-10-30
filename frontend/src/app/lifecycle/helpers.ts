import { reportSwallow } from '../../util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "../../types/runtimeWindow.ts";


/** Resolve an i18n key with a readable fallback during early boot. */
export function translateLifecycleText(key: string, fallback?: null) {
  try {
    if (typeof window !== 'undefined' && typeof browserWindow.t === 'function') {
      const value = browserWindow.t(key);
      if (value && value !== key) return value;
    }
  } catch (error) { reportSwallow(error, 'app/lifecycle.translate'); }
  return fallback != null ? fallback : key;
}
