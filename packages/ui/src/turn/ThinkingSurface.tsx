/**
 * ThinkingSurface — the one-line activity header and its expandable
 * step list. The current action leads; elapsed time stays secondary, and
 * the host's working glyph remains visible with the details collapsed.
 * A content-sized trigger and a single quiet rail keep this subordinate
 * to the answer rather than looking like another message card.
 *
 * The host supplies already-public copy only (see thinkingModel).
 */
import { useId, type ReactNode } from 'react';
import { Animated, Pressable, View, useWindowDimensions } from 'react-native';
import { R, S, focusRing, transition } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { Chevron, Spinner, useReducedMotion, useReveal } from './parts';

export interface ThinkingSurfaceProps {
  /** Current action, or a neutral settled disclosure label. */
  label: string;
  /** Quiet elapsed time; deliberately outside the status live region. */
  durationLabel?: string;
  live: boolean;
  /** Live working indicator, drawn ahead of the caption (host-rendered glyph). */
  indicator?: ReactNode;
  expandable: boolean;
  open: boolean;
  onToggle(): void;
  /** DOM id / nativeID for aria-controls. */
  bodyId: string;
  children?: ReactNode;
}

export function ThinkingSurface({ label, durationLabel, live, indicator, expandable, open, onToggle, bodyId, children }: ThinkingSurfaceProps) {
  const { colors } = useUiTheme();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const { hovered, focused, handlers } = usePressFeedback();
  const reveal = useReveal(open, 2);
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
          maxWidth: '100%',
          minWidth: 0,
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'center',
          gap: S[75],
          minHeight: width < 768 ? 44 : 32,
          paddingHorizontal: S[75],
          marginLeft: -S[75],
          borderRadius: R.row,
          backgroundColor: expandable && hovered ? colors.fill : 'transparent',
          ...focusRing(colors, focused),
          ...transition('background-color', reduced),
          cursor: expandable ? 'pointer' : 'auto',
        }}
      >
        {live && indicator ? (
          <View testID="turn-activity-indicator" aria-hidden style={{ width: 18, height: 18, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
            {indicator}
          </View>
        ) : null}
        <UiText
          testID="turn-activity-label"
          variant="bodySm"
          tone="secondary"
          role={live ? 'status' : undefined}
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{ flexShrink: 1, minWidth: 0, fontVariant: ['tabular-nums'] }}
        >
          {label}
        </UiText>
        {durationLabel ? (
          <UiText
            testID="turn-activity-duration"
            variant="labelSm"
            tone="tertiary"
            aria-live="off"
            numberOfLines={1}
            style={{ flexShrink: 0, fontVariant: ['tabular-nums'] }}
          >
            {durationLabel}
          </UiText>
        ) : null}
        {expandable ? <Chevron open={open} tone="tertiary" /> : null}
      </Pressable>
      <Animated.View
        testID="turn-activity-body"
        nativeID={bodyId}
        aria-hidden={!open}
        style={[{ display: open ? 'flex' : 'none', marginTop: S[50], marginBottom: S[75] }, reveal]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

export interface ActivityStepProps {
  /** Step glyph, drawn by the host. Ignored while `live` (a spinner leads). */
  icon?: ReactNode;
  /** One line, already translated. */
  label: string;
  live?: boolean;
  /** Failed steps keep the wording but take the danger ink. */
  error?: boolean;
  /** Omit to render a still row (a status line, a summary without body). */
  expandable?: boolean;
  open?: boolean;
  onToggle?(): void;
  /** Revealed beneath the row, aligned with the label. */
  detail?: ReactNode;
  testID?: string;
}

/** One continuous muted rail, not a heavy active segment for every row. */
export function ThinkingTimeline({ children }: { children?: ReactNode }) {
  const { colors } = useUiTheme();
  return (
    <View
      testID="thinking-timeline"
      style={{ alignSelf: 'stretch', minWidth: 0, marginLeft: S[75], paddingLeft: S[75], borderLeftWidth: 1, borderLeftColor: colors.hairline }}
    >
      {children}
    </View>
  );
}

const ROW_ICON = 16;
const ROW_GAP = S[75];
const ROW_PAD = S[50];
/** The row's text and its expanded body share one left edge. */
const DETAIL_INSET = ROW_PAD + ROW_ICON + ROW_GAP;

export function ActivityStep({ icon, label, live, error, expandable, open, onToggle, detail, testID }: ActivityStepProps) {
  const { colors } = useUiTheme();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const { hovered, focused, handlers } = usePressFeedback();
  const reveal = useReveal(Boolean(open), 2);
  const detailId = useId();
  const interactive = Boolean(expandable && onToggle);

  const row = (
    <Pressable
      testID={testID ?? 'thinking-step'}
      role={interactive ? 'button' : undefined}
      disabled={!interactive}
      aria-expanded={interactive ? Boolean(open) : undefined}
      aria-controls={interactive ? detailId : undefined}
      aria-label={label}
      onPress={onToggle}
      {...handlers}
      {...{ dataSet: { state: live ? 'running' : error ? 'error' : 'done' } }}
      style={{
        alignSelf: 'flex-start',
        maxWidth: '100%',
        minWidth: 0,
        flexDirection: 'row',
        flexWrap: 'nowrap',
        alignItems: 'center',
        gap: ROW_GAP,
        minHeight: width < 768 ? 44 : 32,
        paddingHorizontal: ROW_PAD,
        borderRadius: R.row,
        backgroundColor: interactive && hovered ? colors.fill : 'transparent',
        ...focusRing(colors, focused),
        ...transition('background-color', reduced),
        cursor: interactive ? 'pointer' : 'auto',
      }}
    >
      <View aria-hidden style={{ width: ROW_ICON, height: ROW_ICON, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
        {live ? <Spinner /> : icon}
      </View>
      <UiText
        testID="thinking-step-title"
        variant="bodySm"
        tone={error ? 'ink' : 'secondary'}
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{ flexShrink: 1, minWidth: 0 }}
      >
        {label}
      </UiText>
      {interactive ? <Chevron open={Boolean(open)} size={6} tone="tertiary" /> : null}
    </Pressable>
  );

  return (
    <View style={{ minWidth: 0 }}>
      {row}
      {detail && open ? (
        <Animated.View
          testID="thinking-step-detail"
          nativeID={detailId}
          style={[{ minWidth: 0, paddingLeft: DETAIL_INSET, paddingTop: S[50], paddingBottom: S[100] }, reveal]}
        >
          {detail}
        </Animated.View>
      ) : null}
    </View>
  );
}
