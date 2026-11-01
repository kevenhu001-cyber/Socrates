import { reportSwallow } from '../../util/reportSwallow.ts';
import { t } from '../../i18n.ts';

/** Resolve an i18n key with a readable fallback during early boot. */
export function translateLifecycleText(key: string, fallback?: null) {
  try {
    const value = t(key);
    if (value && value !== key) return value;
  } catch (error) { reportSwallow(error, 'app/lifecycle.translate'); }
  return fallback != null ? fallback : key;
}
