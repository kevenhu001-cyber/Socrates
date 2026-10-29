import React from 'react';
import { Button } from '../ui/shadcn/button';

/* The toolbar glyph button, shared by the toolbar row (`MessageToolbar.tsx`)
 * and its overflow trigger (`MessageOverflow.tsx`).
 *
 * The primitive carries the whole geometry through `--ui-*` tokens so the
 * transcript stylesheets no longer own `.msg-toolbar-btn` (ADR 0024:
 * structure in the component, geometry from tokens). The class stays on the
 * node because the tooltip (`::after` on `attr(aria-label)`), the state skins
 * (`.active`, `.is-speaking`, `.is-copied`), the phone `::before` hit area and
 * the 16 → 18px glyph rung are affordances rather than geometry, and they are
 * still product-owned. */
const TOOL_BUTTON = [
  'msg-toolbar-btn relative inline-grid place-items-center',
].join(' ');

export interface ToolButtonProps extends Omit<React.ComponentProps<typeof Button>, 'aria-label'> {
  /** The accessible name. The `::after` tooltip reads it back. */
  label: string;
}

/** Every toolbar control is the same primitive with the same geometry. */
function ToolButton({ label, className, children, ...rest }: ToolButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className ? `${TOOL_BUTTON} ${className}` : TOOL_BUTTON}
      aria-label={label}
      {...rest}
    >
      {children}
    </Button>
  );
}

export { TOOL_BUTTON, ToolButton };
