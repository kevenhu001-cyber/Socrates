/**
 * Convert the RN-shaped style objects still passed by a few callers into CSS.
 *
 * This is a small, DOM-free helper for style *data*, not a React Native layer:
 * it flattens arrays, maps the handful of axis aliases that appear in the
 * shared components, and leaves real CSS properties alone. New work should
 * pass CSSProperties directly; the aliases remain only for existing call sites.
 */
import type { CSSProperties } from 'react';

export type TextStyle = CSSProperties & Record<string, unknown>;
export type ViewStyle = TextStyle;

function transformToCss(value: readonly unknown[]): string {
  const parts: string[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    for (const [name, raw] of Object.entries(entry as Record<string, unknown>)) {
      if (raw === undefined || raw === null) continue;
      if (typeof raw === 'number') {
        const unit = name.startsWith('rotate') || name.startsWith('skew') ? 'deg' : 'px';
        const suffix = name.startsWith('scale') ? '' : unit;
        parts.push(`${name}(${raw}${suffix})`);
      } else {
        parts.push(`${name}(${String(raw)})`);
      }
    }
  }
  return parts.join(' ');
}

/**
 * Collect the class names a host attached through the shim's compiled-style
 * escape hatch (`{ $$css: true, socratesHost: '...' }`). Migrated DOM parts
 * still need those structural hooks for the shell CSS.
 */
export function domClassName(...styles: unknown[]): string | undefined {
  const classes = new Set<string>();
  const visit = (style: unknown): void => {
    if (!style) return;
    if (Array.isArray(style)) {
      for (const entry of style) visit(entry);
      return;
    }
    if (typeof style === 'string') {
      classes.add(style);
      return;
    }
    if (typeof style !== 'object') return;
    const record = style as Record<string, unknown>;
    if (record.$$css) {
      for (const [key, value] of Object.entries(record)) {
        if (key !== '$$css' && typeof value === 'string' && value) classes.add(value);
      }
    } else if (typeof record.className === 'string') {
      classes.add(record.className);
    }
  };
  for (const style of styles) visit(style);
  return classes.size ? [...classes].join(' ') : undefined;
}

/**
 * Flatten one style or an array of styles. False/null entries are skipped so
 * `cond && style` works the same way it does in the React Native tree.
 */
export function domStyle(style: unknown): CSSProperties {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<CSSProperties>((acc, entry) => Object.assign(acc, domStyle(entry)), {});
  }
  if (typeof style !== 'object') return {};

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style as Record<string, unknown>)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === '$$css' || key === 'socratesHost' || key === 'className') continue;

    switch (key) {
      case 'paddingHorizontal':
        out.paddingLeft = value;
        out.paddingRight = value;
        break;
      case 'paddingVertical':
        out.paddingTop = value;
        out.paddingBottom = value;
        break;
      case 'marginHorizontal':
        out.marginLeft = value;
        out.marginRight = value;
        break;
      case 'marginVertical':
        out.marginTop = value;
        out.marginBottom = value;
        break;
      case 'fontVariant':
        out.fontVariantNumeric = Array.isArray(value) ? value.join(' ') : value;
        break;
      case 'textAlign':
        // CSS has no `auto` for text-align; leaving it unset keeps the
        // inherited direction, which is what RN's auto means.
        if (value !== 'auto') out.textAlign = value;
        break;
      case 'transform':
        if (Array.isArray(value)) {
          const transform = transformToCss(value);
          if (transform) out.transform = transform;
        } else {
          out.transform = value;
        }
        break;
      default:
        out[key] = value;
    }
  }
  return out as CSSProperties;
}
