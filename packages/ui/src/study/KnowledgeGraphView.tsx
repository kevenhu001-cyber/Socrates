/**
 * Pill-node knowledge graph: hairline edges along the learning path, label
 * pills whose ink weight carries mastery (solid ink = internalized, ink
 * outline = fuzzy, hairline = blank). Drag to pan, pill buttons to zoom.
 * Pure RN Views (no SVG dependency), so the web shell and the app share it.
 */
import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { R, S, focusRing, insetRing, shadow, sheets, transition } from '../look';
import { useReducedMotion } from '../turn/parts';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { dataSet } from '../learn/parts';
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

export function MasterySwatch({ status, label }: { status: KnowledgeStatus; label: string }) {
  const { colors } = useUiTheme();
  const look = pillLook(status, colors);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: S[75] }}>
      <View aria-hidden style={{ width: 18, height: 10, borderRadius: R.pill, backgroundColor: look.background, boxShadow: look.ring }} />
      <UiText variant="labelSm" tone="tertiary" style={{ fontWeight: '400' }}>{label}</UiText>
    </View>
  );
}

function pillLook(status: KnowledgeStatus, colors: ReturnType<typeof useUiTheme>['colors']) {
  /* Site `.demo-node`: white capsule on an inset 12% ring; the kept idea is
     the filled ink capsule. Fuzzy deepens the ring to 1.5px ink. */
  if (status === 'internalized') return { background: colors.ink, ring: undefined, tone: 'onInk' as const };
  if (status === 'fuzzy') return { background: colors.card, ring: insetRing(colors.ink, 1.5), tone: 'ink' as const };
  return { background: colors.card, ring: insetRing(colors.hairlineStrong), tone: 'secondary' as const };
}

function GraphPill({ box, strings, onPress }: { box: GraphNodeBox; strings: KnowledgeStrings; onPress: (index: number) => void }) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const { subtle } = sheets(colors);
  const { hovered, focused, handlers } = usePressFeedback();
  const look = pillLook(box.status, colors);
  const description = `${box.name}, ${strings.status[box.status]}${box.questions ? `, ${fill(strings.questions, { n: box.questions })}` : ''}`;
  return (
    <Pressable
      role="button"
      aria-label={description}
      aria-current={box.active ? 'step' : undefined}
      onPress={() => onPress(box.index)}
      {...handlers}
      {...dataSet({ kbGraphNode: box.index, kbStatus: box.status, kbActive: box.active ? '1' : undefined, kbQuestions: box.questions })}
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        borderRadius: R.pill,
        backgroundColor: hovered && box.status !== 'internalized' ? subtle : look.background,
        boxShadow: [look.ring, box.status === 'internalized' ? undefined : '0 1px 2px rgb(0 0 0 / 4%)'].filter(Boolean).join(', ') || undefined,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: S[75],
        outlineStyle: focused || box.active ? 'solid' : undefined,
        outlineWidth: focused ? 2 : box.active ? 1 : 0,
        outlineColor: colors.ink,
        outlineOffset: 3,
        ...transition('background-color', reduced),
      }}
    >
      <UiText variant="eyebrow" tone={look.tone} numberOfLines={1} style={{ letterSpacing: 0 }}>{box.label}</UiText>
    </Pressable>
  );
}

/** One segment of the zoom capsule: 28px, quiet until hovered. */
function ZoomButton({ label, accessibilityLabel, onPress, data, wide }: { label: string; accessibilityLabel: string; onPress: () => void; data: Record<string, string>; wide?: boolean }) {
  const { colors } = useUiTheme();
  const { hovered, focused, handlers } = usePressFeedback();
  return (
    <Pressable
      role="button"
      aria-label={accessibilityLabel}
      onPress={onPress}
      {...handlers}
      {...dataSet(data)}
      style={{
        minWidth: 28,
        height: 28,
        paddingHorizontal: wide ? S[75] : 0,
        borderRadius: R.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: hovered ? colors.fill : 'transparent',
        ...focusRing(colors, focused),
      }}
    >
      <UiText variant="labelSm" tone={wide ? 'secondary' : 'ink'} style={{ fontVariant: ['tabular-nums'] }}>{label}</UiText>
    </Pressable>
  );
}

export function KnowledgeGraphView({ nodes, activeIndex, selectedIndex, strings, height = 280, onSelect }: {
  nodes: readonly KnowledgeNodeInput[];
  activeIndex: number;
  selectedIndex: number | null;
  strings: KnowledgeStrings;
  height?: number;
  onSelect: (index: number) => void;
}) {
  const { colors } = useUiTheme();
  const graph = useMemo(() => buildKnowledgeGraph(nodes, activeIndex), [nodes, activeIndex]);
  const [viewport, setViewport] = useState({ width: 0, height });
  const [zoom, setZoom] = useState<number | null>(null);
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const panStart = useRef({ x: 0, y: 0 });
  const fit = fitZoom(graph, viewport);
  const scale = zoom ?? fit;

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 6,
    onPanResponderGrant: () => {
      pan.stopAnimation((value) => { panStart.current = value; });
    },
    onPanResponderMove: (_event, gesture) => {
      pan.setValue({ x: panStart.current.x + gesture.dx, y: panStart.current.y + gesture.dy });
    },
  }), [pan]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (Math.abs(width - viewport.width) > 1) setViewport({ width, height });
  };
  const resetView = () => {
    setZoom(null);
    pan.setValue({ x: 0, y: 0 });
    panStart.current = { x: 0, y: 0 };
  };

  if (!graph.nodes.length) return null;
  return (
    <View style={{ gap: S[100] }} {...dataSet({ kbGraph: '1' })}>
      <View
        onLayout={onLayout}
        role="group"
        aria-label={strings.graphLabel}
        {...responder.panHandlers}
        style={{
          height,
          /* Site `.m-graph-stage`: the graph sits on a #f9f9f9 stage. */
          borderRadius: R.sheet,
          backgroundColor: sheets(colors).subtle,
          boxShadow: insetRing(colors.hairline),
          overflow: 'hidden',
        }}
      >
        {viewport.width ? (
          <Animated.View
            style={{
              position: 'absolute',
              left: (viewport.width - graph.width) / 2,
              top: (height - graph.height) / 2,
              width: graph.width,
              height: graph.height,
              transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }],
            }}
          >
            {graph.edges.map((edge) => {
              const lit = selectedIndex !== null && (edge.from === selectedIndex || edge.to === selectedIndex);
              return (
                <View
                  key={`${edge.from}-${edge.to}`}
                  aria-hidden
                  {...dataSet({ kbGraphEdge: `${edge.from}-${edge.to}` })}
                  style={{
                    position: 'absolute',
                    left: (edge.x1 + edge.x2) / 2 - edge.length / 2,
                    top: (edge.y1 + edge.y2) / 2 - 0.5,
                    width: edge.length,
                    height: 1,
                    backgroundColor: lit ? colors.ink : colors.inkTertiary,
                    opacity: lit ? 1 : 0.4,
                    transform: [{ rotate: `${edge.angle}deg` }],
                  }}
                />
              );
            })}
            {graph.nodes.map((box) => <GraphPill key={`${box.index}-${box.name}`} box={box} strings={strings} onPress={onSelect} />)}
          </Animated.View>
        ) : null}
        {/* Zoom: one white capsule on the stage (site `.ui-seg` on white). */}
        <View style={{ position: 'absolute', right: S[75], bottom: S[75], flexDirection: 'row', alignItems: 'center', gap: 2, padding: 2, borderRadius: R.pill, backgroundColor: colors.card, boxShadow: shadow(colors, 'raised') }}>
          <ZoomButton label="−" accessibilityLabel={strings.zoomOut} onPress={() => setZoom(clampZoom(scale / GRAPH_ZOOM_STEP))} data={{ kbZoom: 'out' }} />
          <ZoomButton label={`${Math.round(scale * 100)}%`} accessibilityLabel={strings.zoomFit} onPress={resetView} data={{ kbZoom: 'fit' }} wide />
          <ZoomButton label="+" accessibilityLabel={strings.zoomIn} onPress={() => setZoom(clampZoom(scale * GRAPH_ZOOM_STEP))} data={{ kbZoom: 'in' }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: S[200], rowGap: S[50], paddingHorizontal: S[50] }}>
        <MasterySwatch status="internalized" label={strings.status.internalized} />
        <MasterySwatch status="fuzzy" label={strings.status.fuzzy} />
        <MasterySwatch status="blank" label={strings.status.blank} />
      </View>
      <UiText variant="labelSm" tone="tertiary" style={{ fontWeight: '400', paddingHorizontal: S[50] }} {...dataSet({ kbEdgeKind: graph.edgeKind })}>{graph.edgeKind === 'concept' ? strings.captionConcepts : strings.caption}</UiText>
    </View>
  );
}
