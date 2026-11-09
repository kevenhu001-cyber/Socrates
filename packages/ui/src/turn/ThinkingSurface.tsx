/**
 * ThinkingSurface — the one-line activity header and its expandable
 * step list (RN-2, design R3).
 *
 * The header is quiet: the observed run duration and a chevron. It carries
 * no working glyph and no shimmer — liveness lives on the rows below it,
 * where the running step spins and every other row stays still. That is the
 * whole point of the shape: a reader scans one line of time, then a list of
 * things that happened, instead of reading a status sentence that rewrites
 * itself while an answer streams.
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
  /** The quiet headline: run duration, or a neutral fallback. */
  label: string;
  live: boolean;
  expandable: boolean;
  open: boolean;
  onToggle(): void;
  /** DOM id / nativeID for aria-controls. */
  bodyId: string;
  children?: ReactNode;
}

export function ThinkingSurface({ label, live, expandable, open, onToggle, bodyId, children }: ThinkingSurfaceProps) {
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
          alignSelf: 'stretch',
          minWidth: 0,
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'center',
          gap: S[50],
          minHeight: width < 768 ? 44 : 32,
          paddingLeft: S[100],
          paddingRight: expandable ? S[50] : S[100],
          marginLeft: -S[100],
          borderRadius: R.row,
          backgroundColor: expandable && hovered ? colors.fill : 'transparent',
          ...focusRing(colors, focused),
          ...transition('background-color', reduced),
          cursor: expandable ? 'pointer' : 'auto',
        }}
      >
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
        {expandable ? <Chevron open={open} tone="tertiary" /> : null}
      </Pressable>
      <Animated.View
        testID="turn-activity-body"
        nativeID={bodyId}
        aria-hidden={!open}
        style={[{ display: open ? 'flex' : 'none', marginTop: S[25] }, reveal]}
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

/**
 * Vertical timeline on a single hairline rail. The rail is the line, the
 * active step's segment is drawn in ink, and every row is one icon plus one
 * line of text — no cards, no status words, no per-row durations.
 */
export function ThinkingTimeline({ children }: { children?: ReactNode }) {
  return (
    <View testID="thinking-timeline" style={{ alignSelf: 'stretch' }}>
      {children}
    </View>
  );
}

const ROW_ICON = 16;
const ROW_GAP = S[75];
const ROW_PAD = S[100];
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
        alignSelf: 'stretch',
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
    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
      <View
        aria-hidden
        style={{ width: 1, flexShrink: 0, marginRight: S[200], backgroundColor: live ? colors.ink : colors.hairlineStrong }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        {row}
        {detail && open ? (
          <Animated.View
            testID="thinking-step-detail"
            nativeID={detailId}
            style={[{ paddingLeft: DETAIL_INSET, paddingBottom: S[100] }, reveal]}
          >
            {detail}
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}
