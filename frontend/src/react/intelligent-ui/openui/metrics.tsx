import { defineComponent } from '@openuidev/react-lang';
import { VisualMeter, VisualMetric } from '@socrates/ui/visual-components';
import { z } from 'zod/v4';
import { MathText } from '../../rn/useInlineMath';

export const Metric = defineComponent({
  name: 'Metric',
  props: z.object({
    label: z.string(),
    value: z.union([z.number(), z.string()]),
    detail: z.string().optional(),
  }),
  description:
    'Highlight a measured or computed value. Group related metrics in Grid. Keep units in the label or value.',
  component: ({ props }) => (
    <div data-iui-result>
      <VisualMetric
        label={<MathText text={props.label} />}
        value={<MathText text={String(props.value)} />}
        detail={props.detail ? <MathText text={props.detail} /> : undefined}
      />
    </div>
  ),
});

export const Meter = defineComponent({
  name: 'Meter',
  props: z.object({
    label: z.string(),
    value: z.number(),
    max: z.number(),
    min: z.number().optional(),
    unit: z.string().optional(),
  }),
  description:
    'Show a measured or computed value as a horizontal bar against a stated range. Min defaults to 0 and max must exceed min. Unit is an optional display suffix.',
  component: ({ props }) => (
    <div data-iui-result>
      <VisualMeter
        label={<MathText text={props.label} />}
        labelText={props.label}
        value={props.value}
        min={props.min ?? 0}
        max={props.max}
        unit={props.unit}
      />
    </div>
  ),
});

export const ComparisonBars = defineComponent({
  name: 'ComparisonBars',
  props: z.object({
    items: z
      .array(z.object({ label: z.string(), value: z.number().nonnegative() }))
      .min(1)
      .max(12),
    unit: z.string().optional(),
    scaleMax: z.number().positive().optional(),
  }),
  description:
    'Compare up to 12 nonnegative values in the same units. Bars share a zero baseline and a maximum equal to the largest value, or scaleMax when it is higher. Use scaleMax to hold the scale steady while inputs change.',
  component: ({ props }) => {
    const items = (props.items ?? [])
      .slice(0, 12)
      .filter((item) => item && Number.isFinite(item.value) && item.value >= 0);
    const max = Math.max(props.scaleMax ?? 0, ...items.map((item) => item.value)) || 1;
    return (
      <div className="iui-col iui-flow" data-iui-result>
        {items.map((item, index) => (
          <VisualMeter
            key={`${item.label}-${index}`}
            label={<MathText text={item.label} />}
            labelText={item.label}
            value={item.value}
            min={0}
            max={max}
            unit={props.unit}
            showRange={false}
          />
        ))}
      </div>
    );
  },
});
