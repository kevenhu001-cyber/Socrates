import { forwardRef, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cn } from 'cn';
import { Button as ShadcnButton } from './shadcn/button';

/** Compatibility entry for product call sites using the local shadcn recipe. */
export type ButtonSize = 'sm' | 'md' | 'touch' | 'desktop' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';
export type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';

export interface ButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'className' | 'children' | 'ref' | 'size'> {
  className?: string;
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const SHADCN_SIZE = {
  sm: 'sm', md: 'default', touch: 'touch', desktop: 'lg',
  icon: 'icon', 'icon-xs': 'icon-xs', 'icon-sm': 'icon-sm', 'icon-lg': 'icon-lg',
} as const;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'default',
    size = 'md',
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
  return (
    <ShadcnButton
      {...rest}
      ref={ref}
      type={type}
      variant={variant}
      size={SHADCN_SIZE[size]}
      className={cn(className)}
      disabled={disabled || loading}
      aria-busy={loading ? true : ariaBusy}
      data-loading={loading ? '' : undefined}
      style={style}
    >
      {children}
    </ShadcnButton>
  );
});

export default Button;
