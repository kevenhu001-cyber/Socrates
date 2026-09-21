/**
 * react/tool-run/ToolRunAttachments.tsx — automatic and referenced output hosts.
 *
 * The wrapper (class + `data-tool-anchor`) is the contract the rest of the
 * system hangs off: CSS styles it, the history-recovery pass reuses it by
 * anchor, and the mount dedup keys on it. The actual rendering is delegated to
 * react/tool-output, which dispatches on the ToolOutput protocol and owns
 * per-output lifecycle and error isolation.
 *
 * Native visualizations mount automatically. Python artifacts use the same
 * renderer only after a validated prose directive selects one; unreferenced
 * files remain metadata rows in the tool detail. Each selected output mounts
 * into one shared wrapper so live and restored turns keep stable ownership.
 */
import { useEffect, useRef, useState } from 'react';

import { ToolOutputRenderer } from '../tool-output/ToolOutputRenderer';
import {
  automaticAttachmentOutputsOf,
  type ArtifactOutput,
  type ToolCallRecord,
  type ToolOutput,
} from './toolRunModel';

export interface ToolRunAttachmentsProps {
  call: ToolCallRecord;
}

function OutputHost({ outputs, anchor }: { outputs: ToolOutput[]; anchor: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  /* Children mount only once the host element exists, so each renderer's
     effect can hand the real node to the legacy mounter. */
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(hostRef.current);
  }, [anchor]);

  if (!outputs.length) return null;

  return (
    <div
      className="tool-inline-attachments"
      data-tool-anchor={anchor}
      ref={hostRef}
    >
      {host
        ? outputs.map((output) => (
          <ToolOutputRenderer key={output.id} output={output} host={host} />
        ))
        : null}
    </div>
  );
}

export function ToolRunAttachments({ call }: ToolRunAttachmentsProps) {
  return <OutputHost outputs={automaticAttachmentOutputsOf(call)} anchor={call.id} />;
}

/** A Python artifact explicitly placed by a validated prose directive. */
export function ReferencedArtifact({ output }: { output: ArtifactOutput }) {
  return <OutputHost outputs={[output]} anchor={`${output.toolCallId}:ref:${output.fileId}`} />;
}

export default ToolRunAttachments;
