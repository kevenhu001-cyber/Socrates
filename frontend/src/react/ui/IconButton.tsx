import { forwardRef, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cn } from 'cn';
import { Icon } from '../../ui/Icon';
import type { IconName } from '../../ui/iconRegistry';
import { Button, type ButtonSize, type ButtonVariant } from './Button';

export interface IconButtonProps
  extends Omit<ComponentPropsWithRef<'button'>, 'className' | 'children' | 'ref' | 'aria-label' | 'size'> {
  label: string;
  icon: IconName | ReactNode;
  className?: string;
  loading?: boolean;
  variant?: ButtonVariant;
  size?: Extract<ButtonSize, 'sm' | 'md' | 'touch' | 'desktop'>;
}

const ICON_SIZE = { sm: 'icon-sm', md: 'icon', touch: 'touch', desktop: 'icon-lg' } as const;

function isIconName(icon: IconName | ReactNode): icon is IconName {
  return typeof icon === 'string';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    variant = 'ghost',
    size = 'md',
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
  const touchWidth = size === 'touch' ? 'w-(--ui-control-touch) p-0' : '';
  return (
    <Button
      {...rest}
      ref={ref}
      type={type}
      variant={variant}
      size={ICON_SIZE[size]}
      className={cn(touchWidth, className)}
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
