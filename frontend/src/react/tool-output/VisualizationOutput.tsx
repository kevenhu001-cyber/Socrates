/**
 * react/tool-output/VisualizationOutput.tsx — a chart spec's mount lifecycle.
 *
 * The chart itself is imperative (ECharts, Plotly, Mermaid, Three, GeoGebra):
 * this component owns the host's lifetime and nothing else. On unmount, or
 * when the call id / spec content changes, it aborts the mount — a renderer
 * still loading disposes itself instead of attaching to an abandoned host —
 * disposes the card it tracked from the mount return value, and clears any
 * card left in the host.
 *
 * `specKey` is content identity, not object identity: the runtime swaps
 * `call.input` for the normalized result spec on settle, and an identity
 * dependency would dispose + remount a byte-identical chart right as the
 * answer finishes.
 */
import { useEffect } from 'react';

import { getLegacyActions } from '../legacy/gateway.js';
import {
  visualizationSpecKey,
  type VisualizationOutput as VisualizationOutputData,
} from '../tool-run/toolRunModel';

export interface VisualizationOutputProps {
  output: VisualizationOutputData;
  host: HTMLElement;
}

export function VisualizationOutput({ output, host }: VisualizationOutputProps) {
  const spec = output.spec;
  const specKey = visualizationSpecKey(spec);

  useEffect(() => {
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
      try {
        const mounted = pr.mountVisualization?.(spec, host, {
          toolCallId: output.toolCallId || undefined,
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
      } catch (_) { /* malformed spec — the boundary owns the fallback */ }
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
  }, [output.id, output.toolCallId, specKey, host]);

  return null;
}

export default VisualizationOutput;
