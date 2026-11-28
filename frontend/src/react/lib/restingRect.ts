function parseLengths(value: unknown): number[] {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .map((part) => Number.parseFloat(part));
}

/**
 * The element's border box as laid out, without any active individual `scale`
 * property so popover positioning stays anchored to resting geometry.
 */
export function restingRect(el: Element) {
  const rect = el.getBoundingClientRect();
  let cs: CSSStyleDeclaration | null;
  try {
    cs = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  } catch {
    cs = null;
  }
  const scaleValue = cs ? cs.scale : '';
  if (!scaleValue || scaleValue === 'none') return rect;
  const scales = parseLengths(scaleValue);
  const sx = scales[0];
  const sy = Number.isFinite(scales[1]) ? scales[1] : sx;
  if (!(sx > 0) || !(sy > 0) || (sx === 1 && sy === 1)) return rect;
  const origin = parseLengths(cs?.transformOrigin);
  const width = rect.width / sx;
  const height = rect.height / sy;
  const ox = Number.isFinite(origin[0]) ? origin[0] : width / 2;
  const oy = Number.isFinite(origin[1]) ? origin[1] : height / 2;
  const left = rect.left - ox * (1 - sx);
  const top = rect.top - oy * (1 - sy);
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}
