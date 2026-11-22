/**
 * Pill-node knowledge graph: hairline edges along the learning path, label
 * pills whose ink weight carries mastery (solid ink = internalized, ink
 * outline = fuzzy, hairline = blank). Drag to pan, pill buttons to zoom.
 * Pure DOM: no SVG dependency, so the shell and the app share it.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { dataAttributes } from '../domProps';
import { R, S, focusRing, insetRing, shadow, sheets, transition } from '../look';
import { useReducedMotion } from '../turn/parts';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import {
  GRAPH_ZOOM_STEP,
  buildKnowledgeGraph,
  clampZoom,
  fitZoom,
  type GraphNodeBox,
  type KnowledgeNodeInput,
  type KnowledgeStatus,
} from './model';
import { fill, type KnowledgeStrings } from './strings';

const BUTTON_RESET: CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  textAlign: 'inherit',
};

export function MasterySwatch({ status, label }: { status: KnowledgeStatus; label: string }) {
  const { colors } = useUiTheme();
  const look = pillLook(status, colors);
  return (
    <span
      style={{ display: 'inline-flex', flexDirection: 'row', alignItems: 'center', gap: S[75] }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 18,
          height: 10,
          borderRadius: R.pill,
          backgroundColor: look.background,
          boxShadow: look.ring,
        }}
      />
      <UiText variant="labelSm" tone="tertiary" style={{ fontWeight: '400' }}>
        {label}
      </UiText>
    </span>
  );
}

function pillLook(status: KnowledgeStatus, colors: ReturnType<typeof useUiTheme>['colors']) {
  /* Site `.demo-node`: white capsule on an inset 12% ring; the kept idea is
     the filled ink capsule. Fuzzy deepens the ring to 1.5px ink. */
  if (status === 'internalized')
    return { background: colors.ink, ring: undefined, tone: 'onInk' as const };
  if (status === 'fuzzy')
    return { background: colors.card, ring: insetRing(colors.ink, 1.5), tone: 'ink' as const };
  return {
    background: colors.card,
    ring: insetRing(colors.hairlineStrong),
    tone: 'secondary' as const,
  };
}

function GraphPill({
  box,
  strings,
  onPress,
}: {
  box: GraphNodeBox;
  strings: KnowledgeStrings;
  onPress: (index: number) => void;
}) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const { subtle } = sheets(colors);
  const { hovered, focused, handlers } = usePressFeedback();
  const look = pillLook(box.status, colors);
  const description = `${box.name}, ${strings.status[box.status]}${box.questions ? `, ${fill(strings.questions, { n: box.questions })}` : ''}`;
  return (
    <button
      type="button"
      role="button"
      aria-label={description}
      aria-current={box.active ? 'step' : undefined}
      onClick={() => onPress(box.index)}
      {...handlers}
      {...dataAttributes({
        kbGraphNode: box.index,
        kbStatus: box.status,
        kbActive: box.active ? '1' : undefined,
        kbQuestions: box.questions,
      })}
      style={{
        ...BUTTON_RESET,
        display: 'flex',
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        borderRadius: R.pill,
        backgroundColor: hovered && box.status !== 'internalized' ? subtle : look.background,
        boxShadow:
          [look.ring, box.status === 'internalized' ? undefined : '0 1px 2px rgb(0 0 0 / 4%)']
            .filter(Boolean)
            .join(', ') || undefined,
        alignItems: 'center',
        justifyContent: 'center',
        paddingInline: S[75],
        outlineStyle: focused || box.active ? 'solid' : undefined,
        outlineWidth: focused ? 2 : box.active ? 1 : 0,
        outlineColor: colors.ink,
        outlineOffset: 3,
        ...transition('background-color', reduced),
      }}
    >
      <UiText variant="eyebrow" tone={look.tone} numberOfLines={1} style={{ letterSpacing: 0 }}>
        {box.label}
      </UiText>
    </button>
  );
}

/** One segment of the zoom capsule: 28px, quiet until hovered. */
function ZoomButton({
  label,
  accessibilityLabel,
  onPress,
  data,
  wide,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  data: Record<string, string>;
  wide?: boolean;
}) {
  const { colors } = useUiTheme();
  const { hovered, focused, handlers } = usePressFeedback();
  return (
    <button
      type="button"
      role="button"
      aria-label={accessibilityLabel}
      onClick={onPress}
      {...handlers}
      {...dataAttributes(data)}
      style={{
        ...BUTTON_RESET,
        display: 'inline-flex',
        minWidth: 28,
        height: 28,
        paddingInline: wide ? S[75] : 0,
        borderRadius: R.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: hovered ? colors.fill : 'transparent',
        ...focusRing(colors, focused),
      }}
    >
      <UiText
        variant="labelSm"
        tone={wide ? 'secondary' : 'ink'}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {label}
      </UiText>
    </button>
  );
}

export function KnowledgeGraphView({
  nodes,
  activeIndex,
  selectedIndex,
  strings,
  height = 280,
  onSelect,
}: {
  nodes: readonly KnowledgeNodeInput[];
  activeIndex: number;
  selectedIndex: number | null;
  strings: KnowledgeStrings;
  height?: number;
  onSelect: (index: number) => void;
}) {
  const { colors } = useUiTheme();
  const graph = useMemo(() => buildKnowledgeGraph(nodes, activeIndex), [nodes, activeIndex]);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height });
  const [zoom, setZoom] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const fit = fitZoom(graph, viewport);
  const scale = zoom ?? fit;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const width = stage.getBoundingClientRect().width;
      setViewport((current) => (Math.abs(current.width - width) > 1 ? { width, height } : current));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [height]);

  const resetView = () => {
    setZoom(null);
    setPan({ x: 0, y: 0 });
    drag.current = null;
  };

  if (!graph.nodes.length) return null;
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: S[100] }}
      {...dataAttributes({ kbGraph: '1' })}
    >
      <div
        ref={stageRef}
        role="group"
        aria-label={strings.graphLabel}
        onClickCapture={(event) => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          suppressClick.current = false;
          drag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            baseX: pan.x,
            baseY: pan.y,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.pointerId !== event.pointerId) return;
          const dx = event.clientX - current.startX;
          const dy = event.clientY - current.startY;
          if (!current.moved && Math.abs(dx) + Math.abs(dy) > 6) current.moved = true;
          if (current.moved) setPan({ x: current.baseX + dx, y: current.baseY + dy });
        }}
        onPointerUp={() => {
          suppressClick.current = drag.current?.moved === true;
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        style={{
          position: 'relative',
          height,
          /* Site `.m-graph-stage`: the graph sits on a #f9f9f9 stage. */
          borderRadius: R.sheet,
          backgroundColor: sheets(colors).subtle,
          boxShadow: insetRing(colors.hairline),
          overflow: 'hidden',
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        {viewport.width ? (
          <div
            style={{
              position: 'absolute',
              left: (viewport.width - graph.width) / 2,
              top: (height - graph.height) / 2,
              width: graph.width,
              height: graph.height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            }}
          >
            {graph.edges.map((edge) => {
              const lit =
                selectedIndex !== null &&
                (edge.from === selectedIndex || edge.to === selectedIndex);
              return (
                <div
                  key={`${edge.from}-${edge.to}`}
                  aria-hidden
                  {...dataAttributes({ kbGraphEdge: `${edge.from}-${edge.to}` })}
                  style={{
                    position: 'absolute',
                    left: (edge.x1 + edge.x2) / 2 - edge.length / 2,
                    top: (edge.y1 + edge.y2) / 2 - 0.5,
                    width: edge.length,
                    height: 1,
                    backgroundColor: lit ? colors.ink : colors.inkTertiary,
                    opacity: lit ? 1 : 0.4,
                    transform: `rotate(${edge.angle}deg)`,
                  }}
                />
              );
            })}
            {graph.nodes.map((box) => (
              <GraphPill
                key={`${box.index}-${box.name}`}
                box={box}
                strings={strings}
                onPress={onSelect}
              />
            ))}
          </div>
        ) : null}
        {/* Zoom: one white capsule on the stage (site `.ui-seg` on white). */}
        <div
          style={{
            position: 'absolute',
            right: S[75],
            bottom: S[75],
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
            padding: 2,
            borderRadius: R.pill,
            backgroundColor: colors.card,
            boxShadow: shadow(colors, 'raised'),
          }}
        >
          <ZoomButton
            label="−"
            accessibilityLabel={strings.zoomOut}
            onPress={() => setZoom(clampZoom(scale / GRAPH_ZOOM_STEP))}
            data={{ kbZoom: 'out' }}
          />
          <ZoomButton
            label={`${Math.round(scale * 100)}%`}
            accessibilityLabel={strings.zoomFit}
            onPress={resetView}
            data={{ kbZoom: 'fit' }}
            wide
          />
          <ZoomButton
            label="+"
            accessibilityLabel={strings.zoomIn}
            onPress={() => setZoom(clampZoom(scale * GRAPH_ZOOM_STEP))}
            data={{ kbZoom: 'in' }}
          />
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: S[200],
          rowGap: S[50],
          paddingInline: S[50],
        }}
      >
        <MasterySwatch status="internalized" label={strings.status.internalized} />
        <MasterySwatch status="fuzzy" label={strings.status.fuzzy} />
        <MasterySwatch status="blank" label={strings.status.blank} />
      </div>
      {/* 两段说明只用间距分开（不用「·」）。 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          columnGap: S[100],
          paddingInline: S[50],
        }}
        {...dataAttributes({ kbEdgeKind: graph.edgeKind })}
      >
        <UiText variant="labelSm" tone="tertiary" style={{ fontWeight: '400' }}>
          {strings.captionMastery}
        </UiText>
        <UiText variant="labelSm" tone="tertiary" style={{ fontWeight: '400' }}>
          {graph.edgeKind === 'concept' ? strings.captionConcepts : strings.caption}
        </UiText>
      </div>
    </div>
  );
}
