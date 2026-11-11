import { defineComponent, useIsStreaming } from '@openuidev/react-lang';
import { z } from 'zod/v4';
import { NativeVisualization } from '../NativeVisualization';
import { useServerVisualizations } from './normalizedVisualizations';

/** Reuse the existing visual engines, while OpenUI owns all control state. */
export const Visualization = defineComponent({
  name: 'Visualization',
  /* accessibilitySummary is optional: the shared normalizer derives one from
     the title, exactly as the direct tool path always did. */
  props: z.object({ template: z.string(), title: z.string(), payload: z.record(z.string(), z.unknown()), accessibilitySummary: z.string().optional(), caption: z.string().optional() }),
  /* The model reads this description, so it has to name the argument shape
     exactly. Saying "its exact template/payload contract" made the model pass
     the whole visualization envelope as the first argument, which the
     server then rejected with a field error about the payload instead. */
  description: 'Embed a native visual card from the existing template set. Use this component for static and interactive charts, function graphs, diagrams, timelines, comparisons, simulations and illustrations. The arguments are the template name, a short title, the template payload and an accessibility summary, in that order; the summary and caption are optional. The payload is the template inner data, for example {"categories":["A","B"],"series":[{"name":"Values","data":[1,2]}]}. Write values as JSON numbers (12.5, not "12.5" or "12.5%"), use null for a missing value, keep series an array of {name,data} objects, and keep each series under 5000 points (about 200 reads best). For rows of facts use Table instead. Never pass a versioned visualization envelope here: template, title, payload and accessibilitySummary are separate arguments. Payload expressions can read $state; compose this component with controls when interaction helps.',
  component: function VisualizationView({ props }) {
    const streaming = useIsStreaming();
    const serverSpecs = useServerVisualizations();
    return <NativeVisualization {...props} streaming={streaming} serverSpecs={serverSpecs} />;
  },
});
