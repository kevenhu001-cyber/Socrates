/**
 * react/tool-run/ToolRunAttachments.tsx — a call's output host.
 *
 * The wrapper (class + `data-tool-anchor`) is the contract the rest of the
 * system hangs off: CSS styles it, the history-recovery pass reuses it by
 * anchor, and the mount dedup keys on it. The actual rendering is delegated to
 * react/tool-output, which dispatches on the ToolOutput protocol and owns
 * per-output lifecycle and error isolation.
 *
 * Structural note: every output mounts into THIS wrapper (the shared host),
 * not into a per-output child. `restorePersistedMessageExtras` mounts into the
 * same wrapper on history restore; keeping one host is what makes the
 * `[data-visualization-id]` dedup hold across the two paths.
 */
import { useEffect, useRef, useState } from 'react';

import { ToolOutputRenderer } from '../tool-output/ToolOutputRenderer';
import { attachmentOutputsOf, type ToolCallRecord } from './toolRunModel';

export interface ToolRunAttachmentsProps {
  call: ToolCallRecord;
}

export function ToolRunAttachments({ call }: ToolRunAttachmentsProps) {
  const outputs = attachmentOutputsOf(call);
  const hostRef = useRef<HTMLDivElement | null>(null);
  /* Children mount only once the host element exists, so each renderer's
     effect can hand the real node to the legacy mounter. */
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(hostRef.current);
  }, [call.id]);

  if (!outputs.length) return null;

  return (
    <div
      className="tool-inline-attachments"
      data-tool-anchor={call.id}
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

export default ToolRunAttachments;
