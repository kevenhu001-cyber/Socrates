import { defineComponent, useIsStreaming } from '@openuidev/react-lang';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { z } from 'zod/v4';
import { normalizeVisualizationSpec } from '@socrates/core/visualizationNormalize';
import { getLegacyActions } from '../../legacy/gateway';
import { asVisualizationSpec } from '../../../render/visualizationSpec';
import { reportSwallow } from '../../../util/reportSwallow';
import {
  VisualizationFailure,
  VisualizationSkeleton,
  reasonFromRenderError,
  type VizFailureReason,
} from '../../visualization/VisualizationStates';
import { matchServerVisualization, useServerVisualizations } from './normalizedVisualizations';

interface MountedCard { _visualizationUpdate?: (spec: Record<string, unknown>) => boolean }

type MountPhase = { kind: 'loading' } | { kind: 'ready' } | { kind: 'failed'; reason: VizFailureReason; details: string };

function repairPrompt(spec: Record<string, unknown>, reason: string): string {
  return `Repair this visualization with render_intelligent_ui. It could not be drawn: ${reason}. Keep the same template unless it cannot show this data, write values as JSON numbers (null for a missing value), keep series as an array of {name,data}, and keep each series under 5000 points.\n\n${JSON.stringify(spec).slice(0, 8000)}`;
}

/** Reuse the existing visual engines, while OpenUI owns all control state. */
export const Visualization = defineComponent({
  name: 'Visualization',
  /* accessibilitySummary is optional: the shared normalizer derives one from
     the title, exactly as the direct tool path always did. */
  props: z.object({ template: z.string(), title: z.string(), payload: z.record(z.string(), z.unknown()), accessibilitySummary: z.string().optional(), caption: z.string().optional() }),
  /* The model reads this description, so it has to name the argument shape
     exactly. Saying "its exact template/payload contract" made the model pass
     the whole render_visualization envelope as the first argument, which the
     server then rejected with a field error about the payload instead. */
  description: 'Embed a native visual card from the existing template set. Use this component for static and interactive charts, function graphs, diagrams, timelines, comparisons, simulations and illustrations. The arguments are the template name, a short title, the template payload and an accessibility summary, in that order; the summary and caption are optional. The payload is the template inner data, for example {"categories":["A","B"],"series":[{"name":"Values","data":[1,2]}]}. Write values as JSON numbers (12.5, not "12.5" or "12.5%"), use null for a missing value, keep series an array of {name,data} objects, and keep each series under 5000 points (about 200 reads best). For rows of facts use Table instead. Never pass a versioned visualization envelope here: template, title, payload and accessibilitySummary are separate arguments. Payload expressions can read $state; compose this component with controls when interaction helps.',
  component: function VisualizationView({ props }) {
    const host = useRef<HTMLDivElement>(null);
    const mounted = useRef<MountedCard | null>(null);
    const generation = useRef(0);
    const active = useRef<AbortController | null>(null);
    const id = useId();
    const streaming = useIsStreaming();
    const serverSpecs = useServerVisualizations();
    const [attempt, setAttempt] = useState(0);
    const [phase, setPhase] = useState<MountPhase>({ kind: 'loading' });
    const propsKey = JSON.stringify({ version: 1, ...props });
    /* The server's normalized spec describes the program's INITIAL state.
       Once local controls change the props it no longer applies. */
    const initialKey = useRef<string | null>(null);
    if (!streaming && initialKey.current === null) initialKey.current = propsKey;
    const specKey = useMemo(() => {
      const server = propsKey === initialKey.current ? matchServerVisualization(serverSpecs, props.template, props.title) : null;
      const source = server ? { ...server, nodeId: undefined, index: undefined } : JSON.parse(propsKey);
      return JSON.stringify(normalizeVisualizationSpec(source).spec);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- props are fully captured by propsKey
    }, [propsKey, serverSpecs]);

    useEffect(() => {
      /* Mount once the data is complete: a half-streamed payload would draw,
         remount on every token, and flash wrong values. */
      if (streaming) return;
      const container = host.current;
      if (!container) return;
      // Retry can start while React still marks the previous failure hidden.
      // Engines must measure a visible host before initializing their canvas.
      container.hidden = false;
      const bridge = getLegacyActions().postRender;
      const spec = asVisualizationSpec(JSON.parse(specKey));
      if (!spec) {
        setPhase({ kind: 'failed', reason: 'unknownTemplate', details: 'template is missing' });
        return;
      }
      if (mounted.current?._visualizationUpdate?.(spec)) return;
      const revision = ++generation.current;
      active.current?.abort();
      if (mounted.current) bridge.disposeVisualization?.(mounted.current);
      bridge.disposeVisualizations?.(container);
      mounted.current = null;
      const controller = new AbortController();
      active.current = controller;
      setPhase({ kind: 'loading' });
      Promise.resolve().then(() => {
        if (controller.signal.aborted) return null;
        if (!bridge.mountVisualization) throw new Error('visualization renderer is not available');
        return bridge.mountVisualization(spec, container, { toolCallId: `openui-${id}-${revision}-${attempt}`, signal: controller.signal });
      }).then((card) => {
        if (controller.signal.aborted || generation.current !== revision) {
          if (card) bridge.disposeVisualization?.(card);
          return;
        }
        if (!card) throw new Error('renderer returned no card');
        mounted.current = card as MountedCard;
        setPhase({ kind: 'ready' });
      }).catch((error: unknown) => {
        if (controller.signal.aborted || generation.current !== revision) return;
        reportSwallow(error, `visualization/${spec.template}/openui_mount_failure`, 'recoverable');
        setPhase({ kind: 'failed', reason: reasonFromRenderError(error), details: String((error as Error)?.message || error).slice(0, 300) });
      });
    }, [specKey, id, streaming, attempt]);
    useEffect(() => () => {
      ++generation.current;
      active.current?.abort();
      if (mounted.current) getLegacyActions().postRender.disposeVisualization?.(mounted.current);
      mounted.current = null;
    }, []);

    const spec = JSON.parse(specKey) as Record<string, unknown>;
    return (
      <div className="openui-visualization" data-openui-visualization={props.template} data-viz-phase={streaming ? 'receiving' : phase.kind}>
        {streaming ? <VisualizationSkeleton title={props.title} phase="receiving" /> : null}
        {/* While loading, the card shell itself shows the real title and a
            progress line in its reserved stage (see mountVisualization). */}
        {!streaming && phase.kind === 'failed' ? (
          <VisualizationFailure
            title={props.title}
            reason={phase.reason}
            data={spec}
            details={phase.details}
            onRetry={() => setAttempt((value) => value + 1)}
            fixPrompt={repairPrompt(spec, phase.details)}
          />
        ) : null}
        <div ref={host} className="openui-visualization-host" hidden={streaming || phase.kind === 'failed'} />
      </div>
    );
  },
});
