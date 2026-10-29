import { forwardRef, type ComponentPropsWithRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from 'cn';
import { Button as ShadcnButton } from './shadcn/button';

/**
 * Button — the compatibility entry into the local shadcn button.
 * Explicit semantic variants use shadcn styles; `plain` keeps geometry in
 * the surface owner. Refs, native form intent and the existing busy/loading
 * contract survive both paths. The primitive renders native DOM so using a
 * button on the shell does not preload modal/menu interaction runtimes.
 *
 * The size ladder is the one declared in styles/tokens.css:
 *
 *   sm      32px   --ui-control-sm
 *   md      40px   --ui-control-md
 *   touch   44px   --ui-control-touch
 *   desktop 36px   --ui-control-desktop
 *
 * The ladder rides on the shared base (`.btn` from
 * styles/polish/buttons.css). A surface that keeps its own class keeps its
 * own geometry too, so the two are declared together: `variant` picks the
 * look, `size` picks the rung, and `variant="plain"` (the default) means
 * "this surface owns the whole button".
 */

export type ButtonSize = 'sm' | 'md' | 'touch' | 'desktop';

/**
 * `plain`   the surface's own class owns the whole look.
 * `shared`  the `.btn` grammar from styles/polish/buttons.css.
 * `ghost`   the `.btn .btn-ghost` grammar.
 */
export type ButtonVariant = 'plain' | 'shared' | 'ghost' | 'default' | 'secondary' | 'outline' | 'destructive' | 'link';

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
  | { variant: Exclude<ButtonVariant, 'plain'>; size?: ButtonSize }
);

/** The shared base of each variant. */
const VARIANT_BASE: Partial<Record<ButtonVariant, string>> = {
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

const SHADCN_SIZE = { sm: 'sm', md: 'lg', touch: 'touch', desktop: 'default' } as const;
const SHADCN_VARIANT = {
  plain: 'surface', shared: 'outline', ghost: 'ghost', default: 'default',
  secondary: 'secondary', outline: 'outline', destructive: 'destructive', link: 'link',
} as const;

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
  const classes = cn(
    VARIANT_BASE[variant],
    shared ? (TEXT_SIZE_CLASS[rung] ?? '') : '',
    className,
  );
  const sizeStyle = shared ? TEXT_SIZE_STYLE[rung] : undefined;
  const mergedStyle = sizeStyle || style ? { ...sizeStyle, ...style } : undefined;

  return (
    <ShadcnButton
      {...rest}
      ref={ref}
      type={type}
      variant={SHADCN_VARIANT[variant]}
      size={shared ? SHADCN_SIZE[rung] : 'surface'}
      className={classes || undefined}
      disabled={disabled || loading}
      aria-busy={loading ? true : ariaBusy}
      data-loading={loading ? '' : undefined}
      style={mergedStyle}
    >
      {children}
    </ShadcnButton>
  );
});

export default Button;
