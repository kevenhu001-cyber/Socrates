/**
 * ThinkingSurface — the one-line activity header and its expandable
 * step list. The current action leads; elapsed time stays secondary, and
 * the host's working glyph remains visible with the details collapsed.
 * A content-sized trigger and a nested list keep this subordinate to the
 * answer rather than looking like another message card.
 *
 * The host supplies already-public copy only (see thinkingModel).
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import { dataAttributes } from '../domProps';
import { R, S, focusRing, transition } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { Chevron, Spinner, useReducedMotion, useReveal } from './parts';

const BUTTON_RESET: CSSProperties = {
  display: 'inline-flex',
  background: 'none',
  border: 0,
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  textAlign: 'inherit',
};

export interface ThinkingSurfaceProps {
  /** Current action, or a neutral settled disclosure label. */
  label: string;
  /** Quiet elapsed time; deliberately outside the status live region. */
  durationLabel?: string;
  live: boolean;
  /** Live working indicator, drawn alongside the caption. */
  indicator?: ReactNode;
  /** A tool or site mark remains visible alongside the working indicator. */
  icon?: ReactNode;
  iconWidth?: number;
  expandable: boolean;
  open: boolean;
  onToggle(): void;
  /** DOM id / nativeID for aria-controls. */
  bodyId: string;
  children?: ReactNode;
}

export function ThinkingSurface({
  label,
  durationLabel,
  live,
  indicator,
  icon,
  iconWidth = 18,
  expandable,
  open,
  onToggle,
  bodyId,
  children,
}: ThinkingSurfaceProps) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const { hovered, focused, handlers } = usePressFeedback();
  return (
    <div data-testid="turn-activity" style={{ alignSelf: 'stretch' }}>
      <button
        type="button"
        data-testid="turn-activity-toggle"
        className="rn-turn-activity-toggle"
        role="button"
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        aria-controls={expandable ? bodyId : undefined}
        aria-disabled={!expandable}
        onClick={onToggle}
        {...handlers}
        style={{
          ...BUTTON_RESET,
          alignSelf: 'flex-start',
          maxWidth: '100%',
          minWidth: 0,
          flexWrap: 'nowrap',
          alignItems: 'center',
          gap: S[75],
          paddingInline: S[75],
          marginLeft: -S[75],
          borderRadius: R.row,
          backgroundColor: expandable && hovered ? colors.fill : 'transparent',
          ...focusRing(colors, focused),
          ...transition('background-color', reduced),
          cursor: expandable ? 'pointer' : 'auto',
        }}
      >
        {live && indicator ? (
          <span data-testid="turn-activity-indicator" aria-hidden style={headerGlyphStyle}>
            {indicator}
          </span>
        ) : null}
        {icon ? (
          <span aria-hidden style={{ ...headerGlyphStyle, width: iconWidth }}>
            {icon}
          </span>
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
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              paddingInline: 2,
              paddingBlock: 1,
              flexShrink: 0,
            }}
          >
            <UiText
              testID="turn-activity-duration"
              variant="labelSm"
              tone="secondary"
              aria-live="off"
              numberOfLines={1}
              style={{ flexShrink: 0, fontVariant: ['tabular-nums'] }}
            >
              {durationLabel}
            </UiText>
          </span>
        ) : null}
        {expandable ? <Chevron open={open} tone="tertiary" /> : null}
      </button>
      <div
        data-testid="turn-activity-body"
        id={bodyId}
        aria-hidden={!open}
        style={{
          display: open ? 'flex' : 'none',
          flexDirection: 'column',
          marginTop: S[50],
          marginBottom: S[75],
        }}
      >
        {children}
      </div>
    </div>
  );
}

const headerGlyphStyle: CSSProperties = {
  display: 'inline-flex',
  width: 18,
  height: 18,
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
};

export interface ActivityStepProps {
  /** Step glyph, drawn by the host. */
  icon?: ReactNode;
  iconWidth?: number;
  /** One line, already translated. */
  label: string;
  live?: boolean;
  /** Execution status and optional facts are available in the accessible name. */
  status?: string;
  metadata?: string;
  /** Failed steps keep the wording but take the danger ink. */
  error?: boolean;
  /** Omit to render a still row (a status line, a summary without body). */
  expandable?: boolean;
  open?: boolean;
  onToggle?(): void;
  /** Revealed beneath the row, aligned with the label. */
  detail?: ReactNode;
  /** Readable beneath the row while its full detail is closed. */
  preview?: ReactNode;
  testID?: string;
}

/** A quiet nested list: indentation carries the hierarchy, no rule is drawn.
 *  A rail with no node on it reads as a stray border rather than a timeline;
 *  the reference products either anchor the rail to a status node, or drop it. */
export function ThinkingTimeline({ children }: { children?: ReactNode }) {
  return (
    <div
      data-testid="thinking-timeline"
      style={{
        alignSelf: 'stretch',
        minWidth: 0,
        paddingLeft: S[75],
      }}
    >
      {children}
    </div>
  );
}

const ROW_ICON = 16;
const ROW_GAP = S[75];
const ROW_PAD = S[50];
/** The row's text and its expanded body share one left edge. */
const DETAIL_INSET = ROW_PAD + ROW_ICON + ROW_GAP;

export function ActivityStep({
  icon,
  iconWidth = ROW_ICON,
  label,
  live,
  status,
  metadata,
  error,
  expandable,
  open,
  onToggle,
  detail,
  preview,
  testID,
}: ActivityStepProps) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const { hovered, focused, handlers } = usePressFeedback();
  const reveal = useReveal(Boolean(open), 2);
  const detailId = useId();
  const interactive = Boolean(expandable && onToggle);

  const row = (
    <button
      type="button"
      data-testid={testID ?? 'thinking-step'}
      className="rn-thinking-step"
      role={interactive ? 'button' : undefined}
      disabled={!interactive}
      aria-expanded={interactive ? Boolean(open) : undefined}
      aria-controls={interactive ? detailId : undefined}
      aria-label={interactive ? [label, status, metadata].filter(Boolean).join(' · ') : undefined}
      onClick={onToggle}
      {...handlers}
      {...dataAttributes({ state: live ? 'running' : error ? 'error' : 'done' })}
      style={{
        ...BUTTON_RESET,
        alignSelf: 'flex-start',
        maxWidth: '100%',
        minWidth: 0,
        flexWrap: 'nowrap',
        alignItems: 'center',
        gap: ROW_GAP,
        paddingInline: ROW_PAD,
        borderRadius: R.row,
        backgroundColor: interactive && hovered ? colors.fill : 'transparent',
        ...focusRing(colors, focused),
        ...transition('background-color', reduced),
        cursor: interactive ? 'pointer' : 'auto',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          width: iconWidth,
          height: ROW_ICON,
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </span>
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
      {metadata ? (
        <UiText
          testID="thinking-step-meta"
          variant="labelSm"
          tone="tertiary"
          numberOfLines={1}
          style={{ flexShrink: 0 }}
        >
          {metadata}
        </UiText>
      ) : null}
      {live ? <Spinner /> : null}
      {status ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            paddingInline: 6,
            paddingBlock: 1.5,
            borderRadius: R.pill,
            backgroundColor: error
              ? 'rgba(239, 68, 68, 0.12)'
              : live
                ? 'rgba(245, 158, 11, 0.12)'
                : colors.fill,
            border: `1px solid ${
              error
                ? 'rgba(239, 68, 68, 0.25)'
                : live
                  ? 'rgba(245, 158, 11, 0.25)'
                  : colors.hairline
            }`,
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden
            style={{
              display: 'block',
              width: 5,
              height: 5,
              borderRadius: 2.5,
              backgroundColor: error ? '#ef4444' : live ? '#f59e0b' : '#10b981',
            }}
          />
          <UiText
            testID="thinking-step-status"
            variant="labelSm"
            tone={error ? 'ink' : 'secondary'}
            numberOfLines={1}
            style={{ flexShrink: 0, fontVariant: ['tabular-nums'] }}
          >
            {status}
          </UiText>
        </span>
      ) : null}
      {interactive ? <Chevron open={Boolean(open)} size={6} tone="tertiary" /> : null}
    </button>
  );

  return (
    <div style={{ minWidth: 0 }}>
      {row}
      {preview && !open ? (
        <div style={{ minWidth: 0, paddingLeft: DETAIL_INSET, paddingBottom: S[100] }}>
          {preview}
        </div>
      ) : null}
      {detail && open ? (
        <div
          data-testid="thinking-step-detail"
          id={detailId}
          style={{
            ...reveal,
            minWidth: 0,
            paddingLeft: DETAIL_INSET + iconWidth - ROW_ICON,
            paddingTop: S[50],
            paddingBottom: S[100],
          }}
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
}
