/**
 * react/tool-output/types.ts — shared contracts for the output renderers.
 *
 * Visualizations still use the legacy chart adapter for renderer-specific
 * creation and teardown. Artifact markup is rendered directly by React.
 */
import type { ToolOutput } from '../tool-run/toolRunModel';

/** Props the dispatcher hands every concrete renderer. Only imperative chart
 *  adapters need the shared host; React-rendered artifacts need no host. */
export interface ToolOutputRendererProps {
  output: ToolOutput;
  host?: HTMLElement;
}
