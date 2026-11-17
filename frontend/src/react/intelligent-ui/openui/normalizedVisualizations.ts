/**
 * Server-normalized visualization specs for the surface being rendered.
 *
 * A successful `render_intelligent_ui` result carries `visualizations`: the
 * exact specs the server accepted, already normalized by the shared
 * @socrates/core normalizer and tagged with `nodeId`/`index`. The OpenUI
 * `Visualization` component prefers one of these over re-deriving the spec
 * from raw program props, so the card draws precisely what was validated.
 * Without a provider (fenced OpenUI in prose, history without results) the
 * component normalizes its own props with the same shared code.
 */
import { createContext, useContext } from 'react';

export type ServerVisualizationSpec = Record<string, unknown>;

export const NormalizedVisualizationsContext = createContext<ReadonlyArray<ServerVisualizationSpec>>([]);

export function useServerVisualizations(): ReadonlyArray<ServerVisualizationSpec> {
  return useContext(NormalizedVisualizationsContext);
}

/** Server specs come back without interactive state, so match by identity. */
export function matchServerVisualization(
  specs: ReadonlyArray<ServerVisualizationSpec>,
  template: unknown,
  title: unknown,
): ServerVisualizationSpec | null {
  if (!specs.length || typeof template !== 'string') return null;
  const wanted = typeof title === 'string' ? title.trim() : '';
  const matches = specs.filter((spec) => spec && spec.template === template && String(spec.title ?? '').trim() === wanted);
  /* Two identical (template, title) pairs are ambiguous: fall back to the
     local normalizer rather than risk drawing the sibling's data. */
  return matches.length === 1 ? matches[0] : null;
}
