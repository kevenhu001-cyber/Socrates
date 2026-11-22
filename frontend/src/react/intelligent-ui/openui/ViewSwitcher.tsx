import { defineComponent } from '@openuidev/react-lang';
import { useState } from 'react';
import { z } from 'zod/v4';
import { MathText } from '../../rn/useInlineMath';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/shadcn/tabs';
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
      <Tabs
        className="iui-view-switcher"
        value={active}
        onValueChange={(value) => {
          if (typeof value !== 'string' || !distinct.has(value)) return;
          setVisited((previous) => new Set([...previous, active, value]));
          setSelection(value);
        }}
      >
        <TabsList aria-label={props.label} className="iui-view-options">
          {views.map((view) => (
            <TabsTrigger key={view.id} value={view.id}>
              <MathText text={view.label} />
            </TabsTrigger>
          ))}
        </TabsList>
        {views.map((view) => (
          <TabsContent
            key={view.id}
            value={view.id}
            keepMounted={view.id === active || visited.has(view.id)}
          >
            <div className="iui-col iui-flow">{renderNode(view.children)}</div>
          </TabsContent>
        ))}
      </Tabs>
    );
  },
});
