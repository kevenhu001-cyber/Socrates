import { forwardRef, type ComponentPropsWithRef, type ReactNode } from 'react';
import { Icon } from '../../ui/Icon';
import type { IconName } from '../../ui/iconRegistry';
import { Button, type ButtonSize } from './Button';

/**
 * IconButton — the shared icon-only button.
 *
 * An icon button has no text to fall back on, so the accessible name is
 * required rather than optional: `label` becomes the button's `aria-label`.
 * The glyph comes from the shared icon set in src/ui/Icon.tsx, or from a
 * node when the surface owns a glyph of its own.
 *
 * The size ladder is the one declared in styles/tokens.css and it rides on
 * the shared `.btn .btn-icon` base from styles/polish/buttons.css:
 *
 *   sm      32px   --ui-control-sm    `.btn-icon.sm`
 *   md      40px   --ui-control-md    `.btn-icon`
 *   touch   44px   --ui-control-touch `.btn-touch`
 */

export interface IconButtonOwnProps
  extends Omit<ComponentPropsWithRef<'button'>, 'className' | 'children' | 'ref' | 'aria-label'> {
  /** The accessible name. An icon-only button has no text to fall back on. */
  label: string;
  /** The glyph: a registered icon name, or a node when the surface owns its SVG. */
  icon: IconName | ReactNode;
  /** Classes appended after the primitive's own — the surface's own look. */
  className?: string;
  /** Marks the button busy: it stops taking clicks and announces itself. */
  loading?: boolean;
}

/**
 * The ladder only means something on top of the shared base, so the two are
 * declared as one union: a surface that keeps its own class keeps its own
 * geometry, and a surface that takes the shared base also gets the ladder.
 */
export type IconButtonProps = IconButtonOwnProps & (
  | { variant?: 'plain'; size?: never }
  | { variant: 'shared'; size?: ButtonSize }
);

/** The shared base of the icon grammar. */
const SHARED_BASE = 'btn btn-icon';

/**
 * `.btn-icon.sm` is the 32px rung of the icon base, `.btn-touch` the 44px
 * one. The middle rung is the base itself.
 */
const ICON_SIZE_CLASS: Partial<Record<ButtonSize, string>> = {
  sm: 'sm',
  touch: 'btn-touch',
};

/* `IconName` is a string union, so a plain `typeof` check would widen the
 * name to `string`. The predicate keeps the registered names typed. */
function isIconName(icon: IconName | ReactNode): icon is IconName {
  return typeof icon === 'string';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    variant = 'plain',
    size,
    className,
    loading = false,
    disabled,
    type = 'button',
    style,
    'aria-busy': ariaBusy,
    ...rest
  },
  ref,
) {
  const shared = variant !== 'plain';
  const rung = size ?? 'md';
  const classes = [
    shared ? SHARED_BASE : '',
    shared ? (ICON_SIZE_CLASS[rung] ?? '') : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <Button
      {...rest}
      ref={ref}
      type={type}
      className={classes || undefined}
      aria-label={label}
      disabled={disabled}
      loading={loading}
      aria-busy={ariaBusy}
      style={style}
    >
      {isIconName(icon) ? <Icon name={icon} /> : icon}
    </Button>
  );
});

export default IconButton;
