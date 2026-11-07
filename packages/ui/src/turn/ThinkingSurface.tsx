/**
 * ThinkingSurface — the one-line thinking header and its expandable
 * vertical timeline (RN-2, design R3).
 *
 * The host supplies an observed live status and neutral settled activity
 * copy. Expanding reveals public summaries and tool records. While a turn
 * is live the host also supplies the working indicator (the web passes an
 * inline-SVG spark); the caption itself is not animated here. On the web
 * the host's stylesheet sweeps a CSS text shimmer across the live caption
 * (frontend/src/styles/features/thinking-activity.css, keyed on the
 * turn-activity-label testID), which stops when the turn settles.
 * The host passes already-public copy only (see thinkingModel).
 */
import { type ReactNode } from 'react';
import { Animated, Pressable, View, useWindowDimensions } from 'react-native';
import { R, S, focusRing, transition } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { Chevron, useReducedMotion, useReveal } from './parts';

export interface ThinkingSurfaceProps {
  label: string;
  live: boolean;
  /** Live working indicator, drawn ahead of the caption (host-rendered glyph). */
  indicator?: ReactNode;
  /** Quiet trailing facts, e.g. elapsed seconds or 「回答已开始」. */
  meta?: ReadonlyArray<string>;
  /** Leading glyph (the running tool's icon); optional. */
  icon?: ReactNode;
  expandable: boolean;
  open: boolean;
  onToggle(): void;
  /** DOM id / nativeID for aria-controls. */
  bodyId: string;
  children?: ReactNode;
}

export function ThinkingSurface({ label, live, indicator, meta = [], icon, expandable, open, onToggle, bodyId, children }: ThinkingSurfaceProps) {
  const { colors } = useUiTheme();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const { hovered, focused, handlers } = usePressFeedback();
  const reveal = useReveal(open);
  return (
    <View testID="turn-activity" style={{ alignSelf: 'stretch' }}>
      <Pressable
        testID="turn-activity-toggle"
        role="button"
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        aria-controls={expandable ? bodyId : undefined}
        aria-disabled={!expandable}
        onPress={onToggle}
        {...handlers}
        style={{
          alignSelf: 'stretch',
          minWidth: 0,
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'center',
          gap: S[75],
          minHeight: width < 768 ? 44 : 32,
          paddingLeft: S[100],
          paddingRight: expandable ? S[50] : S[100],
          marginLeft: -S[100],
          borderRadius: R.pill,
          backgroundColor: expandable && hovered ? colors.fill : 'transparent',
          ...focusRing(colors, focused),
          ...transition('background-color', reduced),
          cursor: expandable ? 'pointer' : 'auto',
        }}
      >
        {live && indicator ? <View testID="turn-activity-indicator" aria-hidden style={{ width: 18, height: 18, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>{indicator}</View> : null}
        {icon ? <View aria-hidden style={{ width: 16, flexShrink: 0, alignItems: 'center' }}>{icon}</View> : null}
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <UiText
            testID="turn-activity-label"
            variant="labelSm"
            tone={live ? 'ink' : 'secondary'}
            role={live ? 'status' : undefined}
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{ flexShrink: 1, minWidth: 0 }}
          >
            {label}
          </UiText>
        </View>
        {meta.filter(Boolean).map((part) => (
          <UiText key={part} testID="turn-activity-meta" variant="labelSm" tone="tertiary" numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1, minWidth: 0, maxWidth: '36%' }}>{part}</UiText>
        ))}
        {expandable ? <Chevron open={open} /> : null}
      </Pressable>
      <Animated.View
        testID="turn-activity-body"
        nativeID={bodyId}
        aria-hidden={!open}
        style={[{ display: open ? 'flex' : 'none', marginTop: S[75] }, reveal]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

export type TimelineEntry =
  | { kind: 'step'; key: string; title: string; summary: string; live?: boolean }
  | { kind: 'node'; key: string; node: ReactNode };

/**
 * Vertical timeline on a single hairline rail. No markers: the rail is a
 * line, the active step's segment is drawn in ink.
 */
export function ThinkingTimeline({ entries }: { entries: ReadonlyArray<TimelineEntry> }) {
  const { colors } = useUiTheme();
  return (
    <View testID="thinking-timeline" style={{ paddingLeft: S[50] }}>
      {entries.map((entry, index) => {
        const last = index === entries.length - 1;
        const active = entry.kind === 'step' && entry.live;
        return (
          <View key={entry.key} style={{ flexDirection: 'row', alignItems: 'stretch' }}>
            <View aria-hidden style={{ width: 1, marginRight: S[200], backgroundColor: active ? colors.ink : colors.hairlineStrong }} />
            <View style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : S[100], paddingTop: index === 0 ? 0 : 2 }}>
              {entry.kind === 'step' ? (
                <View testID="thinking-step" style={{ gap: 2 }} {...{ dataSet: { phase: entry.live ? 'running' : 'done' } }}>
                  {entry.title ? <UiText testID="thinking-step-title" variant="labelSm" tone="ink">{entry.title}</UiText> : null}
                  {entry.summary ? <UiText testID="thinking-step-summary" variant="bodySm" tone="secondary">{entry.summary}</UiText> : null}
                </View>
              ) : entry.node}
            </View>
          </View>
        );
      })}
    </View>
  );
}
