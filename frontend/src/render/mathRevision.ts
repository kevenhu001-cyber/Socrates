/**
 * render/mathRevision.ts — Typed single owner for KaTeX mathematical typesetting revision.
 *
 * When KaTeX is lazily loaded or retried, bumping this revision invalidates
 * the per-turn settled prose cache and triggers re-typesetting of math formulas.
 */

let currentMathRevision = 0;

export function getMathRenderRevision(): number {
  if (typeof window !== 'undefined' && typeof window.__socratesMathRenderRev === 'number') {
    return Math.max(currentMathRevision, window.__socratesMathRenderRev);
  }
  return currentMathRevision;
}

export function bumpMathRenderRevision(): number {
  currentMathRevision += 1;
  if (typeof window !== 'undefined') {
    window.__socratesMathRenderRev = currentMathRevision;
  }
  return currentMathRevision;
}
