/**
 * RN-10 — one row of the sidebar's conversation history, and the group
 * headings between rows (time buckets, project names).
 *
 * Language: the RN-7 sidebar (Sidebar.tsx). Rows round to 12; hover and an
 * open ⋯ menu take the 4% fill; the current chat is a small white card (a
 * hairline ring plus a very soft lift). Nothing here draws a dot: the meta
 * line is separated by space, the pinned mark is an outline glyph.
 *
 * The paint is state-driven (`conversationRowPaint`): hover is tracked from
 * pointer events, the menu / drag / rename states come from the host. Only
 * that paint is inline; geometry sits in `StyleSheet.create`, which compiles
 * to plain classes on the web, so the shell CSS (phone drawer, collapsed
 * rail) can still re-shape the row.
 *
 * What stays with the host, by design:
 *   - the rename field (`renameSlot`), the ⋯ trigger and its menu (`actions`)
 *     and the tag pills (`tags`): they are web form / menu primitives;
 *   - native drag and drop: react-native-web forwards neither `draggable` nor
 *     drag events, so the host wires them on the row node;
 *   - the row's `button` role: on the web an RN `role="button"` renders a
 *     `<button>`, and the ⋯ trigger inside it would then be a button nested
 *     in a button. The host sets the role on the row node instead.
 *
 * DOM-free: the host passes ids, labels, i18n keys (forwarded as `data-*`),
 * press handlers and, on the web, its structural class hooks through `parts`.
 */
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { uiMotion, uiRadius, uiStep } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiIcon } from '../primitives/UiIcon';
import { dataSet } from '../learn/parts';
import { conversationRowPaint, isRowActivationKey } from './conversationRowModel';

/* Text inherits the shell's type: the rows keep the sizes the sidebar CSS sets. */
const inheritType = { fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', color: 'inherit' } as unknown as TextStyle;

const styles = StyleSheet.create({
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: uiStep[50] + 2,
    width: '100%',
    height: 36,
    minHeight: 36,
    paddingHorizontal: uiStep[75] + 2,
    borderRadius: uiRadius.md,
    cursor: 'pointer',
  },
  main: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: uiStep[25], minWidth: 0 },
  title: { ...inheritType, flexShrink: 1, minWidth: 0 },
  pin: { flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  label: { ...inheritType, flexShrink: 0 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: uiStep[75], minWidth: 0 },
  metaItem: { ...inheritType },
  badge: { ...inheritType },
  actions: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  heading: { ...inheritType },
});

export type ConversationRowPart =
  | 'row' | 'badge' | 'main' | 'titleRow' | 'title' | 'pin' | 'label' | 'meta' | 'tags' | 'actions';

/** Web structural hooks, one compiled style per part (RNW `$$css`). */
export type ConversationRowParts = Partial<Record<ConversationRowPart, StyleProp<ViewStyle & TextStyle>>>;

/** Web keyboard / click events, as react-native-web hands them over. */
interface RowKeyEvent { key?: string; target?: unknown; currentTarget?: unknown; preventDefault?: () => void }

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
  rowRef?: (node: unknown) => void;
}

export function ConversationRow({
  rowId, conversationId, title, active, pinned = false, pinnedLabel, pinnedI18nKey, mode, label, meta, error,
  menuOpen = false, dragging = false, renaming = false, renameSlot, tags, actions, activeShadow, parts = {},
  onPress, onIntent, rowRef,
}: ConversationRowProps) {
  const { colors } = useUiTheme();
  const [hovered, setHovered] = useState(false);
  const paint = conversationRowPaint({ active, hovered, menuOpen, dragging }, colors, activeShadow);
  /* Web-only props react-native-web forwards to the row node. */
  const web: object = {
    tabIndex: renaming ? -1 : 0,
    'aria-current': active ? 'true' : undefined,
    onClick: () => onPress(),
    onKeyDown: (event: RowKeyEvent) => {
      if (!isRowActivationKey(event.key, event.target === event.currentTarget, renaming)) return;
      event.preventDefault?.();
      onPress();
    },
  };
  return (
    <View
      ref={rowRef as never}
      {...dataSet({ recentId: rowId, recentActual: conversationId })}
      {...web}
      onPointerEnter={() => { setHovered(true); onIntent?.(); }}
      onPointerLeave={() => setHovered(false)}
      onTouchStart={() => onIntent?.()}
      style={[
        styles.row,
        parts.row,
        paint as ViewStyle | null,
        { transitionProperty: 'background-color, box-shadow, opacity', transitionDuration: `${uiMotion.fast}ms` } as object,
      ]}
    >
      {mode ? (
        <Text {...dataSet({ i18nKey: mode.i18nKey, i18nTitle: mode.i18nKey })} style={[styles.badge, parts.badge]}>{mode.label}</Text>
      ) : null}
      <View style={[styles.main, parts.main]}>
        <View style={[styles.titleRow, parts.titleRow]}>
          {pinned ? (
            <View
              role="img"
              aria-label={pinnedLabel}
              {...dataSet({ i18nTitle: pinnedI18nKey, i18nAria: pinnedI18nKey })}
              style={[styles.pin, parts.pin]}
            >
              <UiIcon name="pin" size={12} color={colors.inkTertiary} />
            </View>
          ) : null}
          {renaming && renameSlot ? renameSlot : (
            <Text numberOfLines={1} style={[styles.title, parts.title]}>{title}</Text>
          )}
          {error ? <Text role="alert" style={styles.metaItem}>{error}</Text> : null}
          {label ? <Text numberOfLines={1} style={[styles.label, parts.label]}>{label}</Text> : null}
        </View>
        <View style={[styles.meta, parts.meta]}>
          {(meta ?? []).map((item, index) => <Text key={index} style={styles.metaItem}>{item}</Text>)}
        </View>
        {tags ? <View style={[styles.meta, parts.tags]}>{tags}</View> : null}
      </View>
      <View style={[styles.actions, parts.actions]}>{actions}</View>
    </View>
  );
}

/* ── Group heading ───────────────────────────────────────────────────── */

export interface ConversationGroupHeadingProps {
  label: string;
  /** `time` for Today / Yesterday / months, `project` for a project's name. */
  kind: 'time' | 'project';
  hostStyle?: StyleProp<TextStyle>;
}

/** The heading over a run of rows. A level-3 heading, set in the shell's quiet label type. */
export function ConversationGroupHeading({ label, kind, hostStyle }: ConversationGroupHeadingProps) {
  return (
    <Text role="heading" aria-level={3} numberOfLines={kind === 'project' ? 1 : undefined} {...dataSet({ groupKind: kind })} style={[styles.heading, hostStyle]}>
      {label}
    </Text>
  );
}
