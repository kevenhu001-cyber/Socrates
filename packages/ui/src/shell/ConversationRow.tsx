/**
 * One row of the sidebar's conversation history, and the group headings
 * between rows (time buckets, project names).
 *
 * Language: the sidebar's own chrome. Rows round to 12; hover and an open ⋯
 * menu take the 4% fill; the current chat is a small white card (a hairline
 * ring plus a very soft lift). Nothing here draws a dot: the meta line is
 * separated by space, the pinned mark is an outline glyph.
 *
 * React DOM by design (ADR 0027). The host still owns the rename field, the
 * ⋯ menu, tags and native drag and drop; those are web form / menu primitives
 * and must not be nested inside a shared button. The row is a focusable
 * `div` with `role="button"` supplied by the host, because it contains its own
 * buttons.
 *
 * DOM-free: the host passes ids, labels, i18n keys (forwarded as `data-*`),
 * press handlers and structural class hooks through `parts`.
 */
import { useState, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { uiMotion, uiStep } from '@socrates/theme';
import { dataAttributes } from '../domProps';
import { domClassName, domStyle, type TextStyle, type ViewStyle } from '../domStyle';
import { useUiTheme } from '../primitives/theme';
import { UiIcon } from '../primitives/UiIcon';
import { conversationRowPaint, isRowActivationKey } from './conversationRowModel';

/* Text inherits the shell's type: the rows keep the sizes the sidebar CSS sets. */
const inheritType: TextStyle = {
  fontFamily: 'inherit',
  fontSize: 'inherit',
  lineHeight: 'inherit',
  color: 'inherit',
};

const styles: Record<string, ViewStyle> = {
  /* Row geometry (height, 44px phone rung, padding, radius, gap) belongs to
     the shell CSS: an inline height would beat the phone media query. */
  row: {
    cursor: 'pointer',
  },
  main: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  titleRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: uiStep[25],
    minWidth: 0,
  },
  title: { ...inheritType, flexShrink: 1, minWidth: 0 },
  pin: { flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  label: { ...inheritType, flexShrink: 0 },
  meta: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: uiStep[75],
    minWidth: 0,
  },
  metaItem: { ...inheritType },
  badge: { ...inheritType },
  actions: { display: 'flex', flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  heading: { ...inheritType },
};

export type ConversationRowPart =
  'row' | 'badge' | 'main' | 'titleRow' | 'title' | 'pin' | 'label' | 'meta' | 'tags' | 'actions';

/** Web structural hooks, one compiled style per part (RNW `$$css`). */
export type ConversationRowParts = Partial<Record<ConversationRowPart, unknown>>;

export interface ConversationRowProps {
  /** Stable row id, published as `data-recent-id`. */
  rowId: string;
  /** The conversation id, published as `data-recent-actual`. */
  conversationId: string;
  title: string;
  active: boolean;
  pinned?: boolean;
  /** Pinned-mark name and its i18n key (the web pass re-applies it). */
  pinnedLabel?: string;
  pinnedI18nKey?: string;
  /** The chat's mode, as a word (hidden by the shell CSS; kept for i18n and tooling). */
  mode?: { label: string; i18nKey: string };
  /** A short label after the title (the host's own tag text). */
  label?: string;
  /** Secondary line items (time, message count). Spaced, never dotted. */
  meta?: readonly string[];
  /** Inline save error from the host's rename / move actions. */
  error?: string;
  /** Optional decorative content before the title column. */
  leading?: ReactNode;
  menuOpen?: boolean;
  dragging?: boolean;
  renaming?: boolean;
  /** The host's rename field, shown in place of the title while renaming. */
  renameSlot?: ReactNode;
  /** The host's tag pills. */
  tags?: ReactNode;
  /** The host's ⋯ trigger and menu. */
  actions?: ReactNode;
  /** Web: `var(--ui-elevation-raised)`, so the active theme decides the lift. */
  activeShadow?: string;
  parts?: ConversationRowParts;
  /** Opens the conversation (click, Enter, Space). */
  onPress: () => void;
  /** First intent to open (pointer enter, touch start): the host prefetches. */
  onIntent?: () => void;
  /** Gives the host the row node, where it wires native drag and the button role. */
  rowRef?: Ref<HTMLDivElement>;
}

function clamp(lines?: number): CSSProperties | undefined {
  if (!lines || lines < 1) return undefined;
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
}

export function ConversationRow({
  rowId,
  conversationId,
  title,
  active,
  pinned = false,
  pinnedLabel,
  pinnedI18nKey,
  mode,
  label,
  meta,
  error,
  leading,
  menuOpen = false,
  dragging = false,
  renaming = false,
  renameSlot,
  tags,
  actions,
  activeShadow,
  parts = {},
  onPress,
  onIntent,
  rowRef,
}: ConversationRowProps) {
  const { colors } = useUiTheme();
  const [hovered, setHovered] = useState(false);
  const paint = conversationRowPaint({ active, hovered, menuOpen, dragging }, colors, activeShadow);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isRowActivationKey(event.key, event.target === event.currentTarget, renaming)) return;
    event.preventDefault();
    onPress();
  };

  return (
    <div
      ref={rowRef}
      {...dataAttributes({ recentId: rowId, recentActual: conversationId })}
      tabIndex={renaming ? -1 : 0}
      aria-current={active ? 'true' : undefined}
      onClick={() => onPress()}
      onKeyDown={onKeyDown}
      onPointerEnter={() => {
        setHovered(true);
        onIntent?.();
      }}
      onPointerLeave={() => setHovered(false)}
      onTouchStart={() => onIntent?.()}
      className={domClassName(parts.row)}
      style={domStyle([
        styles.row,
        parts.row,
        paint as ViewStyle | null,
        {
          transitionProperty: 'background-color, box-shadow, opacity',
          transitionDuration: `${uiMotion.fast}ms`,
        },
      ])}
    >
      {mode ? (
        <span
          {...dataAttributes({ i18nKey: mode.i18nKey, i18nTitle: mode.i18nKey })}
          className={domClassName(parts.badge)}
          style={domStyle([styles.badge, parts.badge])}
        >
          {mode.label}
        </span>
      ) : null}
      {leading}
      <div className={domClassName(parts.main)} style={domStyle([styles.main, parts.main])}>
        <div
          className={domClassName(parts.titleRow)}
          style={domStyle([styles.titleRow, parts.titleRow])}
        >
          {pinned ? (
            <div
              role="img"
              aria-label={pinnedLabel}
              {...dataAttributes({ i18nTitle: pinnedI18nKey, i18nAria: pinnedI18nKey })}
              className={domClassName(parts.pin)}
              style={domStyle([styles.pin, parts.pin])}
            >
              <UiIcon name="pin" size={12} color={colors.inkTertiary} />
            </div>
          ) : null}
          {renaming && renameSlot ? (
            renameSlot
          ) : (
            <span
              className={domClassName(parts.title)}
              style={domStyle([styles.title, parts.title, clamp(1)])}
            >
              {title}
            </span>
          )}
          {error ? (
            <span role="alert" style={domStyle([styles.metaItem])}>
              {error}
            </span>
          ) : null}
          {label ? (
            <span
              className={domClassName(parts.label)}
              style={domStyle([styles.label, parts.label, clamp(1)])}
            >
              {label}
            </span>
          ) : null}
        </div>
        <div className={domClassName(parts.meta)} style={domStyle([styles.meta, parts.meta])}>
          {(meta ?? []).map((item, index) => (
            <span key={index} style={domStyle([styles.metaItem])}>
              {item}
            </span>
          ))}
        </div>
        {tags ? (
          <div className={domClassName(parts.tags)} style={domStyle([styles.meta, parts.tags])}>
            {tags}
          </div>
        ) : null}
      </div>
      <div
        className={domClassName(parts.actions)}
        style={domStyle([styles.actions, parts.actions])}
      >
        {actions}
      </div>
    </div>
  );
}

/* ── Group heading ───────────────────────────────────────────────────── */

export interface ConversationGroupHeadingProps {
  label: string;
  /** `time` for Today / Yesterday / months, `project` for a project's name. */
  kind: 'time' | 'project';
  hostStyle?: unknown;
}

/** The heading over a run of rows. A level-3 heading, set in the shell's quiet label type. */
export function ConversationGroupHeading({
  label,
  kind,
  hostStyle,
}: ConversationGroupHeadingProps) {
  return (
    <span
      role="heading"
      aria-level={3}
      {...dataAttributes({ groupKind: kind })}
      className={domClassName(hostStyle)}
      style={domStyle([styles.heading, hostStyle, clamp(kind === 'project' ? 1 : undefined)])}
    >
      {label}
    </span>
  );
}
