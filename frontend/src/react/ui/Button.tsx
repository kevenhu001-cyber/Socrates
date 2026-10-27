import { forwardRef, type ComponentPropsWithRef, type CSSProperties, type ReactNode } from 'react';

/**
 * Button — the shared button primitive.
 *
 * The primitive owns the *behaviour* of a button, not a second look. It
 * renders a real `<button type="button">`, forwards its ref, carries the
 * disabled / loading states, and composes its class list out of the
 * grammar the sheets already declare plus the class the surface already
 * owns. A surface that has a class of its own keeps it, so migrating onto
 * the primitive does not repaint anything.
 *
 * The size ladder is the one declared in styles/tokens.css:
 *
 *   sm      32px   --ui-control-sm
 *   md      40px   --ui-control-md
 *   touch   44px   --ui-control-touch
 *
 * The ladder rides on the shared base (`.btn` from
 * styles/polish/buttons.css). A surface that keeps its own class keeps its
 * own geometry too, so the two are declared together: `variant` picks the
 * look, `size` picks the rung, and `variant="plain"` (the default) means
 * "this surface owns the whole button".
 */

export type ButtonSize = 'sm' | 'md' | 'touch';

/**
 * `plain`   the surface's own class owns the whole look.
 * `shared`  the `.btn` grammar from styles/polish/buttons.css.
 * `ghost`   the `.btn .btn-ghost` grammar.
 */
export type ButtonVariant = 'plain' | 'shared' | 'ghost';

interface ButtonOwnProps extends Omit<ComponentPropsWithRef<'button'>, 'className' | 'children' | 'ref'> {
  /** Classes appended after the primitive's own — the surface's own look. */
  className?: string;
  children?: ReactNode;
  /**
   * Marks the button busy: it stops taking clicks and announces itself to
   * assistive technology. The surface can key a spinner off `data-loading`.
   */
  loading?: boolean;
}

/**
 * The ladder only means something on top of the shared base, so the two are
 * declared as one union: a button that keeps its own class keeps its own
 * geometry, and a button that takes the shared base also gets the ladder.
 */
export type ButtonProps = ButtonOwnProps & (
  | { variant?: 'plain'; size?: never }
  | { variant: 'shared' | 'ghost'; size?: ButtonSize }
);

/** The shared base of each variant. */
const VARIANT_BASE: Record<'shared' | 'ghost', string> = {
  shared: 'btn',
  ghost: 'btn btn-ghost',
};

/**
 * `.btn-touch` is the shared 44px rung. The text base has no modifier of its
 * own for the 32px rung, so the small rung re-ladders the token the base
 * already reads instead of inventing a second class: `.btn` then resolves
 * to `--ui-control-sm`, the rung the sheet already declares.
 */
const TEXT_SIZE_CLASS: Partial<Record<ButtonSize, string>> = {
  touch: 'btn-touch',
};

const TEXT_SIZE_STYLE: Partial<Record<ButtonSize, CSSProperties>> = {
  sm: { '--ui-control-md': 'var(--ui-control-sm)' } as CSSProperties,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'plain',
    size,
    className,
    loading = false,
    disabled,
    type = 'button',
    children,
    style,
    'aria-busy': ariaBusy,
    ...rest
  },
  ref,
) {
  const shared = variant !== 'plain';
  const rung = size ?? 'md';
  const classes = [
    shared ? VARIANT_BASE[variant] : '',
    shared ? (TEXT_SIZE_CLASS[rung] ?? '') : '',
    className,
  ].filter(Boolean).join(' ');
  const sizeStyle = shared ? TEXT_SIZE_STYLE[rung] : undefined;
  const mergedStyle = sizeStyle || style ? { ...sizeStyle, ...style } : undefined;

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={classes || undefined}
      disabled={disabled || loading}
      aria-busy={loading ? true : ariaBusy}
      data-loading={loading ? '' : undefined}
      style={mergedStyle}
    >
      {children}
    </button>
  );
});

export default Button;
