/**
 * Pill-node knowledge graph: hairline edges along the learning path, label
 * pills whose ink weight carries mastery (solid ink = internalized, ink
 * outline = fuzzy, hairline = blank). Drag to pan, pill buttons to zoom.
 * Pure RN Views (no SVG dependency), so the web shell and the app share it.
 */
import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { PillAction, dataSet } from '../learn/parts';
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: uiSpace[1] }}>
      <View aria-hidden style={{ width: 16, height: 10, borderRadius: uiRadius.pill, backgroundColor: look.background, borderWidth: look.borderWidth, borderColor: look.borderColor }} />
      <UiText variant="eyebrow" tone="tertiary" style={{ letterSpacing: 0 }}>{label}</UiText>
    </View>
  );
}

function pillLook(status: KnowledgeStatus, colors: ReturnType<typeof useUiTheme>['colors']) {
  if (status === 'internalized') return { background: colors.ink, borderColor: colors.ink, borderWidth: 1, tone: 'onInk' as const };
  if (status === 'fuzzy') return { background: colors.card, borderColor: colors.ink, borderWidth: 1.5, tone: 'ink' as const };
  return { background: colors.card, borderColor: colors.hairlineStrong, borderWidth: 1, tone: 'tertiary' as const };
}

function GraphPill({ box, strings, onPress }: { box: GraphNodeBox; strings: KnowledgeStrings; onPress: (index: number) => void }) {
  const { colors } = useUiTheme();
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
        borderRadius: uiRadius.pill,
        backgroundColor: hovered && box.status !== 'internalized' ? colors.fill : look.background,
        borderWidth: look.borderWidth,
        borderColor: look.borderColor,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: uiSpace[2],
        outlineStyle: focused || box.active ? 'solid' : undefined,
        outlineWidth: focused ? 2 : box.active ? 1 : 0,
        outlineColor: colors.ink,
        outlineOffset: 3,
      }}
    >
      <UiText variant="eyebrow" tone={look.tone} numberOfLines={1} style={{ letterSpacing: 0 }}>{box.label}</UiText>
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
    <View style={{ gap: uiSpace[2] }} {...dataSet({ kbGraph: '1' })}>
      <View
        onLayout={onLayout}
        role="group"
        aria-label={strings.graphLabel}
        {...responder.panHandlers}
        style={{
          height,
          borderRadius: uiRadius.lg,
          borderWidth: 1,
          borderColor: colors.hairline,
          backgroundColor: colors.card,
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
                    opacity: lit ? 1 : 0.55,
                    transform: [{ rotate: `${edge.angle}deg` }],
                  }}
                />
              );
            })}
            {graph.nodes.map((box) => <GraphPill key={`${box.index}-${box.name}`} box={box} strings={strings} onPress={onSelect} />)}
          </Animated.View>
        ) : null}
        <View style={{ position: 'absolute', right: uiSpace[2], bottom: uiSpace[2], flexDirection: 'row', gap: uiSpace[1] }}>
          <PillAction tone="soft" label="−" accessibilityLabel={strings.zoomOut} onPress={() => setZoom(clampZoom(scale / GRAPH_ZOOM_STEP))} data={{ kbZoom: 'out' }} />
          <PillAction tone="soft" label={`${Math.round(scale * 100)}%`} accessibilityLabel={strings.zoomFit} onPress={resetView} data={{ kbZoom: 'fit' }} />
          <PillAction tone="soft" label="+" accessibilityLabel={strings.zoomIn} onPress={() => setZoom(clampZoom(scale * GRAPH_ZOOM_STEP))} data={{ kbZoom: 'in' }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: uiSpace[3], rowGap: uiSpace[1] }}>
        <MasterySwatch status="internalized" label={strings.status.internalized} />
        <MasterySwatch status="fuzzy" label={strings.status.fuzzy} />
        <MasterySwatch status="blank" label={strings.status.blank} />
      </View>
      <UiText variant="eyebrow" tone="tertiary" style={{ letterSpacing: 0 }}>{strings.caption}</UiText>
    </View>
  );
}
