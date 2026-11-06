/**
 * render/mathRevision.ts — Typed single owner for KaTeX mathematical typesetting revision.
 *
 * When KaTeX is lazily loaded or retried, bumping this revision invalidates
 * the per-turn settled prose cache and triggers re-typesetting of math formulas.
 */

let currentMathRevision = 0;
const listeners = new Set<() => void>();

export function subscribeMathRenderRevision(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getMathRenderRevision(): number {
  return currentMathRevision;
}

export function bumpMathRenderRevision(): number {
  currentMathRevision += 1;
  listeners.forEach((listener) => listener());
  return currentMathRevision;
}
