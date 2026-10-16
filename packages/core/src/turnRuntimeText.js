import { normalizeTurnRuntime } from './turnRuntime.js';

/** Keep persisted raw-text ranges aligned when storage strips controls/whitespace.
 * The clean text must be a subsequence of the original (no edits/reordering).
 * Live/reconnect snapshots continue using the original text and offsets. */
export function rebaseTurnRuntimeText(value, original, clean) {
  const runtime = normalizeTurnRuntime(value);
  if (!runtime || original === clean) return runtime;
  const points = new Set(runtime.uiSurfaces.map((surface) => surface.textOffset));
  for (const claim of runtime.claims || []) { points.add(claim.start); points.add(claim.end); }
  const mapped = new Map();
  let written = 0;
  for (let read = 0; read <= original.length; read++) {
    if (points.has(read)) mapped.set(read, written);
    if (written < clean.length && original[read] === clean[written]) written++;
  }
  if (written !== clean.length) return null;
  const claims = (runtime.claims || []).flatMap((claim) => {
    const start = mapped.get(claim.start), end = mapped.get(claim.end);
    if (start === undefined || end === undefined || end <= start) return [];
    return [{ ...claim, start, end, quote: clean.slice(start, end) }];
  });
  return { ...runtime,
    uiSurfaces: runtime.uiSurfaces.map((surface) => ({ ...surface, textOffset: mapped.get(surface.textOffset) ?? clean.length })),
    ...(runtime.claims ? { claims } : {}),
  };
}
