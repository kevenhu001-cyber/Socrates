import { defineComponent } from '@openuidev/react-lang';
import { useEffect, useId, useRef } from 'react';
import { z } from 'zod/v4';
import { getLegacyActions } from '../../legacy/gateway';
import { asVisualizationSpec } from '../../../render/visualizationSpec';

interface MountedCard { _visualizationUpdate?: (spec: Record<string, unknown>) => boolean }

/** Reuse the existing visual engines, while OpenUI owns all control state. */
export const Visualization = defineComponent({
  name: 'Visualization',
  props: z.object({ template: z.string(), title: z.string(), payload: z.record(z.string(), z.unknown()), accessibilitySummary: z.string(), caption: z.string().optional() }),
  description: 'Embed a native render_visualization card using its exact template/payload contract. Payload expressions can read $state; controls update the visual locally. Prefer Chart for simple charts.',
  component: function VisualizationView({ props }) {
    const host = useRef<HTMLDivElement>(null);
    const mounted = useRef<MountedCard | null>(null);
    const generation = useRef(0);
    const active = useRef<AbortController | null>(null);
    const id = useId();
    const specKey = JSON.stringify({ version: 1, ...props });
    useEffect(() => {
      const container = host.current;
      if (!container) return;
      const bridge = getLegacyActions().postRender;
      const spec = asVisualizationSpec(JSON.parse(specKey));
      if (!spec) return;
      if (mounted.current?._visualizationUpdate?.(spec)) return;
      const revision = ++generation.current;
      active.current?.abort();
      if (mounted.current) bridge.disposeVisualization?.(mounted.current);
      bridge.disposeVisualizations?.(container);
      mounted.current = null;
      const controller = new AbortController();
      active.current = controller;
      Promise.resolve().then(() => {
        if (controller.signal.aborted) return null;
        return bridge.mountVisualization?.(spec, container, { toolCallId: `openui-${id}-${revision}`, signal: controller.signal });
      }).then((card) => {
        if (!card) return;
        if (controller.signal.aborted || generation.current !== revision) bridge.disposeVisualization?.(card);
        else mounted.current = card as MountedCard;
      }).catch(() => { /* The visualization renderer owns its error and repair UI. */ });
    }, [specKey, id]);
    useEffect(() => () => {
      ++generation.current;
      active.current?.abort();
      if (mounted.current) getLegacyActions().postRender.disposeVisualization?.(mounted.current);
      mounted.current = null;
    }, []);
    return <div ref={host} data-openui-visualization={props.template} />;
  },
});
