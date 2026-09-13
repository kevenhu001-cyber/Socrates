/**
 * react/tool-output/ArtifactOutput.tsx — a saved file's inline preview.
 *
 * Artifacts are still painted by the legacy `appendInlineArtifact` (it owns
 * image loading, skeletons, retry and the document-wide fileId dedup), so this
 * component only registers the mount and lets the host's removal clean up the
 * node. Text and protocol validation happen in `attachmentOutputsOf`.
 */
import { useEffect } from 'react';

import { getLegacyActions } from '../legacy/gateway.js';
import type { ArtifactOutput as ArtifactOutputData } from '../tool-run/toolRunModel';

export interface ArtifactOutputProps {
  output: ArtifactOutputData;
  host: HTMLElement;
}

export function ArtifactOutput({ output, host }: ArtifactOutputProps) {
  useEffect(() => {
    const pr = getLegacyActions().postRender;
    try {
      pr.appendInlineArtifact?.(
        output.fileId,
        output.mimeType ?? undefined,
        host,
        output.name ?? undefined,
      );
    } catch (_) { /* artifact gone server-side */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [output.id, output.fileId, output.mimeType, output.name, host]);

  return null;
}

export default ArtifactOutput;
