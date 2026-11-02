/**
 * RN-10 — state → paint for one sidebar conversation row.
 *
 * Kept apart from the component so the rule is testable without a renderer:
 * the current chat is a small white card (hairline ring plus a very soft
 * lift), hover and an open ⋯ menu take the 4% fill, a row being dragged
 * fades. Resting rows return no paint at all, so the host's own CSS
 * (keyboard focus-within, the phone drawer's press wash) still applies.
 */
export interface ConversationRowState {
  active: boolean;
  hovered: boolean;
  menuOpen: boolean;
  dragging: boolean;
}

export interface ConversationRowPalette {
  card: string;
  fill: string;
  hairline: string;
}

export interface ConversationRowPaint {
  backgroundColor?: string;
  boxShadow?: string;
  opacity?: number;
}

/** Opacity of the row while it is the drag source. */
export const CONVERSATION_ROW_DRAG_OPACITY = 0.4;

export function conversationRowPaint(
  state: ConversationRowState,
  palette: ConversationRowPalette,
  activeShadow?: string,
): ConversationRowPaint | null {
  const paint: ConversationRowPaint = {};
  if (state.active) {
    paint.backgroundColor = palette.card;
    paint.boxShadow = activeShadow ?? `0 0 0 1px ${palette.hairline}`;
  } else if (state.hovered || state.menuOpen) {
    paint.backgroundColor = palette.fill;
  }
  if (state.dragging) paint.opacity = CONVERSATION_ROW_DRAG_OPACITY;
  return Object.keys(paint).length ? paint : null;
}

/** Keyboard activation: Enter or Space on the row itself, never on a child control. */
export function isRowActivationKey(key: string | undefined, onRowItself: boolean, renaming: boolean): boolean {
  if (renaming || !onRowItself) return false;
  return key === 'Enter' || key === ' ';
}
