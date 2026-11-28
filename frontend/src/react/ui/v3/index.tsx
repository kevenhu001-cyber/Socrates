import type { AriaAttributes, ComponentPropsWithRef, HTMLAttributes, ReactNode } from 'react';
import {
  Badge as AppsSdkBadge,
  type BadgeProps as AppsSdkBadgeProps,
} from '@openai/apps-sdk-ui/components/Badge';
import {
  Button as AppsSdkButton,
  type ButtonProps as AppsSdkButtonProps,
} from '@openai/apps-sdk-ui/components/Button';
import {
  Checkbox as AppsSdkCheckbox,
  type CheckboxProps as AppsSdkCheckboxProps,
} from '@openai/apps-sdk-ui/components/Checkbox';
import {
  Input as AppsSdkInput,
  type InputProps as AppsSdkInputProps,
} from '@openai/apps-sdk-ui/components/Input';
import {
  Switch as AppsSdkSwitch,
  type SwitchProps as AppsSdkSwitchProps,
} from '@openai/apps-sdk-ui/components/Switch';
import {
  Textarea as AppsSdkTextarea,
  type TextareaProps as AppsSdkTextareaProps,
} from '@openai/apps-sdk-ui/components/Textarea';

export { AppsSDKUIProvider } from '@openai/apps-sdk-ui/components/AppsSDKUIProvider';
export { Alert, type AlertProps } from '@openai/apps-sdk-ui/components/Alert';
export { Avatar, type AvatarProps } from '@openai/apps-sdk-ui/components/Avatar';
export {
  ButtonLink,
  CopyButton,
  type CopyButtonProps,
} from '@openai/apps-sdk-ui/components/Button';
export { EmptyMessage } from '@openai/apps-sdk-ui/components/EmptyMessage';
export {
  CircularProgress,
  LoadingDots,
  LoadingIndicator,
  type CircularProgressProps,
  type LoadingDotsProps,
  type LoadingIndicatorProps,
} from '@openai/apps-sdk-ui/components/Indicator';
export { Menu } from '@openai/apps-sdk-ui/components/Menu';
export { Popover } from '@openai/apps-sdk-ui/components/Popover';
export { RadioGroup, type RadioGroupProps } from '@openai/apps-sdk-ui/components/RadioGroup';
export {
  SegmentedControl,
  type SegmentedControlProps,
} from '@openai/apps-sdk-ui/components/SegmentedControl';
export { Select, type SelectProps } from '@openai/apps-sdk-ui/components/Select';
export { Slider, type SliderProps } from '@openai/apps-sdk-ui/components/Slider';
export { Tooltip, type TooltipProps } from '@openai/apps-sdk-ui/components/Tooltip';

export type ButtonProps = Omit<AppsSdkButtonProps, 'color'> & {
  color?: AppsSdkButtonProps['color'];
};

export function Button({ color = 'secondary', pill = true, ...props }: ButtonProps) {
  return <AppsSdkButton color={color} pill={pill} {...props} />;
}

export type BadgeProps = Omit<AppsSdkBadgeProps, 'variant' | 'color'> &
  Pick<HTMLAttributes<HTMLSpanElement>, 'title' | 'id' | 'role'> & {
    variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'solid' | 'soft';
    color?: AppsSdkBadgeProps['color'];
    children?: ReactNode;
  };

export function Badge({
  variant = 'soft',
  color,
  size = 'sm',
  pill = true,
  children,
  ...rest
}: BadgeProps) {
  let mappedVariant: AppsSdkBadgeProps['variant'] = 'soft';
  let mappedColor: AppsSdkBadgeProps['color'] = color ?? 'secondary';
  if (variant === 'outline') {
    mappedVariant = 'outline';
  } else if (variant === 'solid' || variant === 'default') {
    mappedVariant = 'solid';
  } else if (variant === 'destructive') {
    mappedVariant = 'soft';
    mappedColor = color ?? 'danger';
  }
  return (
    <AppsSdkBadge
      variant={mappedVariant}
      color={mappedColor}
      size={size}
      pill={pill}
      {...(rest as Record<string, unknown>)}
    >
      {children}
    </AppsSdkBadge>
  );
}

export type InputProps = Omit<ComponentPropsWithRef<'input'>, 'size'> & {
  variant?: AppsSdkInputProps['variant'];
  size?: AppsSdkInputProps['size'];
  gutterSize?: AppsSdkInputProps['gutterSize'];
  invalid?: boolean;
  pill?: boolean;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
};

export function Input({
  type,
  hidden,
  variant = 'outline',
  size = 'md',
  ref,
  ...props
}: InputProps) {
  if (type === 'file' || hidden) {
    return <input type={type} hidden={hidden} ref={ref} {...props} />;
  }
  return <AppsSdkInput type={type} variant={variant} size={size} ref={ref} {...props} />;
}

export type TextareaProps = Omit<ComponentPropsWithRef<'textarea'>, 'size'> & {
  variant?: AppsSdkTextareaProps['variant'];
  size?: AppsSdkTextareaProps['size'];
  gutterSize?: AppsSdkTextareaProps['gutterSize'];
  invalid?: boolean;
  autoResize?: boolean;
  maxRows?: number;
};

export function Textarea({
  variant = 'outline',
  size = 'md',
  ref,
  ...props
}: TextareaProps) {
  return <AppsSdkTextarea variant={variant} size={size} ref={ref} {...props} />;
}

export type SwitchProps = AppsSdkSwitchProps & AriaAttributes;

export function Switch(props: SwitchProps) {
  return <AppsSdkSwitch {...props} />;
}

export type CheckboxProps = Omit<AppsSdkCheckboxProps, 'checked'> &
  AriaAttributes & {
    checked?: boolean | 'indeterminate';
    indeterminate?: boolean;
    'data-field'?: string;
  };

export function Checkbox({ checked, indeterminate, ...rest }: CheckboxProps) {
  const resolvedChecked = indeterminate ? 'indeterminate' : checked;
  return <AppsSdkCheckbox checked={resolvedChecked} {...rest} />;
}
