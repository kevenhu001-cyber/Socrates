/**
 * ThinkingSurface — the one-line thinking header and its expandable
 * vertical timeline (RN-2, design R3).
 *
 * Live:  「思考中 · 第 N 步」 over a travelling progress hairline.
 * Done:  「思考 Xs · N 步」 with a chevron; expanding reveals the timeline.
 * The host passes already-public copy only (see thinkingModel).
 */
import { type ReactNode } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { Chevron, ProgressHairline, useBreathing, useReveal } from './parts';

export interface ThinkingSurfaceProps {
  label: string;
  live: boolean;
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

export function ThinkingSurface({ label, live, meta = [], icon, expandable, open, onToggle, bodyId, children }: ThinkingSurfaceProps) {
  const { colors } = useUiTheme();
  const { hovered, focused, handlers } = usePressFeedback();
  const breathing = useBreathing(live);
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
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: uiSpace[2],
          minHeight: 32,
          paddingLeft: uiSpace[2],
          paddingRight: expandable ? uiSpace[1] : uiSpace[3],
          marginLeft: -uiSpace[2],
          borderRadius: uiRadius.pill,
          backgroundColor: expandable && hovered ? colors.fill : 'transparent',
          outlineStyle: focused ? 'solid' : undefined,
          outlineWidth: focused ? 2 : 0,
          outlineColor: colors.ink,
          cursor: expandable ? 'pointer' : 'auto',
        }}
      >
        {icon ? <View aria-hidden style={{ width: 16, alignItems: 'center' }}>{icon}</View> : null}
        <Animated.View style={{ opacity: breathing }}>
          <UiText
            testID="turn-activity-label"
            variant="labelSm"
            tone={live ? 'ink' : 'secondary'}
            role={live ? 'status' : undefined}
            numberOfLines={1}
          >
            {label}
          </UiText>
        </Animated.View>
        {meta.filter(Boolean).map((part) => (
          <UiText key={part} testID="turn-activity-meta" variant="labelSm" tone="tertiary" numberOfLines={1}>{part}</UiText>
        ))}
        {expandable ? <Chevron open={open} /> : null}
      </Pressable>
      {live ? <View style={{ maxWidth: 220, marginTop: 2 }}><ProgressHairline active testID="turn-activity-progress" /></View> : null}
      <Animated.View
        testID="turn-activity-body"
        nativeID={bodyId}
        aria-hidden={!open}
        style={[{ display: open ? 'flex' : 'none', marginTop: uiSpace[2] }, reveal]}
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
    <View testID="thinking-timeline" style={{ paddingLeft: uiSpace[1] }}>
      {entries.map((entry, index) => {
        const last = index === entries.length - 1;
        const active = entry.kind === 'step' && entry.live;
        return (
          <View key={entry.key} style={{ flexDirection: 'row', alignItems: 'stretch' }}>
            <View aria-hidden style={{ width: 1, marginRight: uiSpace[4], backgroundColor: active ? colors.inkSecondary : colors.hairlineStrong }} />
            <View style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : uiSpace[3], paddingTop: index === 0 ? 0 : 2 }}>
              {entry.kind === 'step' ? (
                <View testID="thinking-step" {...{ dataSet: { phase: entry.live ? 'running' : 'done' } }}>
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
