/**
 * react/tool-run/ToolRunAttachments.tsx — a call's non-text output.
 *
 * Charts (`visualization`) and saved files (`artifacts[]`) used to appear
 * because restorePersistedMessageExtras created a `.tool-inline-attachments`
 * div and inserted it after the row from outside React. A node React doesn't
 * own disappears the next time that subtree re-renders, so the declarative
 * path renders the host itself and asks the legacy mounters to fill it.
 *
 * Both mounters dedup by id (`[data-visualization-id]` within the host,
 * `[data-artifact-id]` document-wide), which is why the history-recovery pass
 * can hand the same host a second mount without drawing it twice.
 */
import { useEffect, useRef } from 'react';

import { getLegacyActions } from '../legacy/gateway.js';
import type { ToolCallRecord } from './toolRunModel';

/** Same rule the legacy recovery pass uses: a v1 spec, from either field. */
export function visualizationSpecOf(
  call: ToolCallRecord | null | undefined,
): Record<string, unknown> | null {
  if (!call) return null;
  const persisted = call.visualization;
  if (persisted && typeof persisted === 'object' && persisted.version === 1) {
    return persisted as unknown as Record<string, unknown>;
  }
  if (call.name === 'render_visualization' && call.input && typeof call.input === 'object') {
    const input = call.input as Record<string, unknown>;
    if (input.version === 1) return input;
  }
  return null;
}

export interface ToolRunAttachmentsProps {
  call: ToolCallRecord;
}

export function ToolRunAttachments({ call }: ToolRunAttachmentsProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const spec = visualizationSpecOf(call);
  const artifacts = Array.isArray(call.artifacts) ? call.artifacts : [];
  const artifactKey = artifacts.map((a) => a.id).join(',');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const pr = getLegacyActions().postRender;
    /* Deferred to a microtask so a throw inside a legacy mounter (a bad chart
       spec, a file the server no longer has) can never become a React render
       error for the whole message list. */
    Promise.resolve().then(() => {
      if (spec) {
        try {
          pr.mountVisualization?.(spec, host, { toolCallId: call.id || undefined });
        } catch (_) { /* malformed spec — leave the row standing */ }
      }
      for (const artifact of artifacts) {
        if (!artifact || !artifact.id) continue;
        try {
          pr.appendInlineArtifact?.(
            artifact.id,
            artifact.mimeType,
            host,
            artifact.name,
          );
        } catch (_) { /* artifact gone server-side */ }
      }
    });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.id, artifactKey, spec]);

  if (!spec && !artifacts.length) return null;

  return (
    <div
      className="tool-inline-attachments"
      data-tool-anchor={call.id}
      ref={hostRef}
    />
  );
}

export default ToolRunAttachments;
