/**
 * react/tool-run/ToolRunAttachments.tsx — a call's non-text output.
 *
 * Charts (`visualization`) and saved files (`artifacts[]`) used to appear
 * because restorePersistedMessageExtras created a `.tool-inline-attachments`
 * div and inserted it after the row from outside React. A node React doesn't
 * own disappears the next time that subtree re-renders, so the declarative
 * path renders the host itself and asks the legacy mounters to fill it.
 *
 * Which outputs to mount comes from `attachmentOutputsOf` — the ToolOutput
 * protocol, never the legacy `visualization` / `artifacts` fields directly.
 * Old calls get the same list synthesized by the compat adapter, so this
 * component cannot tell (and must not care) which writer shape it is reading.
 *
 * Both mounters dedup by id (`[data-visualization-id]` within the host,
 * `[data-artifact-id]` document-wide), which is why the history-recovery pass
 * can hand the same host a second mount without drawing it twice.
 *
 * Lifecycle: the mount effect owns an AbortController. On unmount (or when the
 * call id / spec content changes) it aborts the mount — a renderer that is
 * still loading disposes itself instead of attaching to an abandoned host —
 * and disposes every card already in the host, so ECharts, Plotly, Three and
 * friends release their observers, RAF loops and WebGL contexts.
 */
import { useEffect, useRef } from 'react';

import { getLegacyActions } from '../legacy/gateway.js';
import {
  attachmentOutputsOf,
  visualizationSpecKey,
  type ToolCallRecord,
} from './toolRunModel';

export interface ToolRunAttachmentsProps {
  call: ToolCallRecord;
}

export function ToolRunAttachments({ call }: ToolRunAttachmentsProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const outputs = attachmentOutputsOf(call);
  const specOutput = outputs.find((output) => output.kind === 'visualization') || null;
  const spec = specOutput ? specOutput.spec : null;
  const artifacts = outputs.filter((output) => output.kind === 'artifact');
  const artifactKey = artifacts.map((output) => output.fileId).join(',');
  /* Content identity, not object identity: the runtime swaps `call.input` for
     the normalized result spec on settle, and an identity dependency would
     dispose + remount a byte-identical chart right as the answer finishes. */
  const specKey = spec ? visualizationSpecKey(spec) : '';

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const pr = getLegacyActions().postRender;
    const controller = new AbortController();
    let cancelled = false;
    /* The renderer's element, captured from the mount return value. The host
       query is not enough: legacy DOM work (a session switch) can empty the
       host before React's cleanup, leaving this as the only handle. */
    let mountedCard: unknown = null;
    /* Deferred to a microtask so a throw inside a legacy mounter (a bad chart
       spec, a file the server no longer has) can never become a React render
       error for the whole message list. */
    Promise.resolve().then(() => {
      if (cancelled) return;
      if (spec) {
        try {
          const mounted = pr.mountVisualization?.(spec, host, {
            toolCallId: call.id || undefined,
            signal: controller.signal,
          }) as Promise<unknown> | null | undefined;
          if (mounted && typeof (mounted as Promise<unknown>).then === 'function') {
            (mounted as Promise<unknown>).then((card) => {
              if (!card) return;
              if (cancelled) {
                try { pr.disposeVisualization?.(card); } catch (_) { /* already gone */ }
              } else {
                mountedCard = card;
              }
            }).catch(() => { /* mount failure rendered its own fallback */ });
          } else if (mounted) {
            mountedCard = mounted;
          }
        } catch (_) { /* malformed spec — leave the row standing */ }
      }
      for (const artifact of artifacts) {
        if (!artifact.fileId) continue;
        try {
          pr.appendInlineArtifact?.(
            artifact.fileId,
            artifact.mimeType ?? undefined,
            host,
            artifact.name ?? undefined,
          );
        } catch (_) { /* artifact gone server-side */ }
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
      if (mountedCard) {
        try { pr.disposeVisualization?.(mountedCard); } catch (_) { /* best effort */ }
      }
      /* Abort covers a mount still in flight; the host pass covers a card the
         tracked reference missed (e.g. a history-recovery mount). */
      try { pr.disposeVisualizations?.(host); } catch (_) { /* best effort */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.id, artifactKey, specKey]);

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
