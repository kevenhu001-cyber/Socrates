import { defineComponent } from '@openuidev/react-lang';
import { useState } from 'react';
import { z } from 'zod/v4';
import { MathText } from '../../rn/useInlineMath';
import { SegmentedControl } from '../../ui/v3';
import { children } from './style';

export const ViewSwitcher = defineComponent({
  name: 'ViewSwitcher',
  props: z.object({
    label: z.string(),
    views: z
      .array(z.object({ id: z.string(), label: z.string(), children }))
      .min(2)
      .max(4),
  }),
  description:
    'Switch between 2–4 alternative views of the same subject, such as a chart and its dataset, or two scenarios. Each view needs a distinct stable id and a short label. The first view opens by default. Keep primary controls outside the switcher if they apply to every view.',
  component: function ViewSwitcherView({ props, renderNode }) {
    const distinct = new Map<string, NonNullable<typeof props.views>[number]>();
    for (const view of (props.views ?? []).slice(0, 4)) {
      if (view?.id && view.label && !distinct.has(view.id)) distinct.set(view.id, view);
    }
    const views = Array.from(distinct.values());
    const [selection, setSelection] = useState('');
    const [visited, setVisited] = useState(() => new Set<string>());
    const active = distinct.has(selection) ? selection : views[0]?.id;
    if (!active) return null;
    if (views.length === 1) return <>{renderNode(views[0].children)}</>;
    return (
      <div className="iui-view-switcher flex flex-col gap-3">
        <SegmentedControl
          aria-label={props.label}
          className="iui-view-options"
          size="sm"
          pill
          value={active}
          onChange={(value) => {
            if (!distinct.has(value)) return;
            setVisited((previous) => new Set([...previous, active, value]));
            setSelection(value);
          }}
        >
          {views.map((view) => (
            <SegmentedControl.Option key={view.id} value={view.id}>
              <MathText text={view.label} />
            </SegmentedControl.Option>
          ))}
        </SegmentedControl>
        {views.map((view) => {
          const isCurrent = view.id === active;
          if (!isCurrent && !visited.has(view.id)) return null;
          return (
            <div key={view.id} role="tabpanel" hidden={!isCurrent}>
              <div className="iui-col iui-flow">{renderNode(view.children)}</div>
            </div>
          );
        })}
      </div>
    );
  },
});
