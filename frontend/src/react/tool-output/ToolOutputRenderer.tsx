/**
 * react/tool-output/ToolOutputRenderer.tsx — dispatch on the ToolOutput
 * protocol.
 *
 * The renderer never inspects a tool's internal schema: `kind` is the only
 * thing it branches on, and every concrete renderer is wrapped in its own
 * error boundary so a broken output is contained to one card.
 */
import type { ReactNode } from 'react';

import { ArtifactOutput } from './ArtifactOutput';
import { OutputErrorBoundary } from './OutputErrorBoundary';
import type { ToolOutputRendererProps } from './types';
import { VisualizationOutput } from './VisualizationOutput';

export function ToolOutputRenderer({ output, host }: ToolOutputRendererProps) {
  let content: ReactNode;
  switch (output.kind) {
    case 'visualization':
      content = <VisualizationOutput output={output} host={host} />;
      break;
    case 'artifact':
      content = <ArtifactOutput output={output} host={host} />;
      break;
    /* Text outputs stay in the row's detail panel — the attachment host only
       renders things that are not text. */
    default:
      return null;
  }
  return (
    <OutputErrorBoundary outputId={output.id}>
      {content}
    </OutputErrorBoundary>
  );
}

export default ToolOutputRenderer;
