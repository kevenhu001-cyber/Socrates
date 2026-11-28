import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import {
  Button as AppsSdkButton,
  type ButtonProps as AppsSdkButtonProps,
} from '@openai/apps-sdk-ui/components/Button';

/* Retained strictly for non-button link styling (e.g. BrowserLoginDialog, ProfileAccountSections)
 * until those surfaces migrate to Apps SDK UI ButtonLink. */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-(--ui-button-radius) border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors duration-150 select-none focus-visible:border-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        surface: '',
        default: 'bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/75',
        outline:
          'border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-muted active:bg-accent aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'text-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        pill: 'rounded-(--ui-radius-pill) bg-secondary text-secondary-foreground hover:bg-muted hover:text-foreground',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        surface: '',
        touch: 'h-(--ui-control-touch) gap-2 px-3',
        default: 'h-(--ui-control-desktop) gap-1.5 px-2.5',
        xs: "h-6 gap-1 rounded-(--ui-radius-pill) px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-(--ui-control-sm) gap-1 rounded-(--ui-radius-pill) px-2.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-(--ui-control-md) gap-1.5 px-2.5',
        icon: 'size-8 rounded-(--ui-button-radius)',
        'icon-xs': "size-6 rounded-(--ui-radius-pill) [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-(--ui-control-sm) rounded-(--ui-radius-pill)',
        'icon-lg': 'size-9 rounded-(--ui-button-radius)',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type LegacyVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
type LegacySize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

const VARIANT_MAP: Record<
  LegacyVariant,
  { color: AppsSdkButtonProps['color']; variant: AppsSdkButtonProps['variant']; pill: boolean }
> = {
  surface: { color: 'secondary', variant: 'ghost', pill: false },
  default: { color: 'primary', variant: 'solid', pill: true },
  outline: { color: 'secondary', variant: 'outline', pill: true },
  secondary: { color: 'secondary', variant: 'soft', pill: true },
  pill: { color: 'secondary', variant: 'soft', pill: true },
  ghost: { color: 'secondary', variant: 'ghost', pill: false },
  link: { color: 'secondary', variant: 'ghost', pill: false },
  destructive: { color: 'danger', variant: 'soft', pill: true },
};

const SIZE_MAP: Record<LegacySize, { size: AppsSdkButtonProps['size']; uniform: boolean }> = {
  surface: { size: 'md', uniform: false },
  default: { size: 'md', uniform: false },
  xs: { size: '2xs', uniform: false },
  sm: { size: 'sm', uniform: false },
  lg: { size: 'lg', uniform: false },
  touch: { size: 'xl', uniform: false },
  icon: { size: 'md', uniform: true },
  'icon-xs': { size: '2xs', uniform: true },
  'icon-sm': { size: 'sm', uniform: true },
  'icon-lg': { size: 'lg', uniform: true },
};

function Button({
  className,
  variant = 'default',
  size = 'default',
  type = 'button',
  children,
  color: _htmlColor,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  const resolvedVariant = variant ?? 'default';
  const resolvedSize = size ?? 'default';

  if (resolvedVariant === 'surface' || resolvedSize === 'surface') {
    return (
      <button
        type={type}
        data-slot="button"
        data-variant={resolvedVariant}
        data-size={resolvedSize}
        className={cn(className)}
        {...props}
      >
        {children}
      </button>
    );
  }

  const mappedVariant = VARIANT_MAP[resolvedVariant];
  const mappedSize = SIZE_MAP[resolvedSize];

  return (
    <AppsSdkButton
      type={type}
      color={mappedVariant.color}
      variant={mappedVariant.variant}
      size={mappedSize.size}
      uniform={mappedSize.uniform}
      pill={mappedVariant.pill}
      data-slot="button"
      data-variant={resolvedVariant}
      data-size={resolvedSize}
      className={cn(resolvedVariant === 'link' && 'underline-offset-4 hover:underline', className)}
      {...props}
    >
      {children}
    </AppsSdkButton>
  );
}

export { Button, buttonVariants };
