/**
 * react/tool-output/types.ts — shared contracts for the output renderers.
 *
 * The mount/dispose contract stays in the legacy bridge (`postRender.mountVisualization`
 * / `disposeVisualization`): the real renderer owns creation and teardown, and
 * the React layer only decides where and for how long.
 */
import type { ToolOutput } from '../tool-run/toolRunModel';

/** Props the dispatcher hands every concrete renderer: the output plus the
 *  shared mount host for its call. Renderers return no DOM of their own. */
export interface ToolOutputRendererProps {
  output: ToolOutput;
  host: HTMLElement;
}
