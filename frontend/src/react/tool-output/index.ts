/**
 * react/tool-output — React-owned rendering of a call's non-text outputs.
 *
 * `ToolOutputRenderer` dispatches on the ToolOutput protocol; concrete
 * renderers own the imperative mount lifecycle behind a shared host element,
 * and one failure is contained by `OutputErrorBoundary` without touching the
 * rest of the turn.
 */
export { ToolOutputRenderer } from './ToolOutputRenderer';
export { OutputErrorBoundary } from './OutputErrorBoundary';
export { VisualizationOutput, type VisualizationOutputProps } from './VisualizationOutput';
export { ArtifactOutput, type ArtifactOutputProps } from './ArtifactOutput';
export type { ToolOutputRendererProps } from './types';
