import { i18n } from '../legacy/gateway.ts';

/**
 * Resolve a palette string at render time.
 *
 * The palette mounts long after boot's `data-i18n-*` sweep, so every string
 * inside it has to be translated where it is rendered instead of through the
 * attribute pass — otherwise a Chinese UI keeps English placeholder text.
 */
export function t(key: string, fallback: string): string {
  return i18n(key, fallback);
}

/**
 * Substitute `{name}` placeholders in a translated string.
 *
 * The legacy `t()` takes no arguments, so the dictionary keeps the whole
 * sentence (word order differs per locale) and the values are dropped in
 * here. Unknown placeholders are left intact rather than blanked, so a
 * stale key degrades to visible `{query}` instead of silently losing text.
 */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}
