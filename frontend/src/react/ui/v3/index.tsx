import type { AriaAttributes } from 'react';
import {
  Switch as AppsSdkSwitch,
  type SwitchProps as AppsSdkSwitchProps,
} from '@openai/apps-sdk-ui/components/Switch';
import {
  Checkbox as AppsSdkCheckbox,
  type CheckboxProps as AppsSdkCheckboxProps,
} from '@openai/apps-sdk-ui/components/Checkbox';

export { AppsSDKUIProvider } from '@openai/apps-sdk-ui/components/AppsSDKUIProvider';
export { Alert, type AlertProps } from '@openai/apps-sdk-ui/components/Alert';
export { Avatar, type AvatarProps } from '@openai/apps-sdk-ui/components/Avatar';
export { Badge, type BadgeProps } from '@openai/apps-sdk-ui/components/Badge';
export {
  Button,
  ButtonLink,
  CopyButton,
  type ButtonProps,
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
export { Input, type InputProps } from '@openai/apps-sdk-ui/components/Input';
export { Menu } from '@openai/apps-sdk-ui/components/Menu';
export { Popover } from '@openai/apps-sdk-ui/components/Popover';
export { RadioGroup, type RadioGroupProps } from '@openai/apps-sdk-ui/components/RadioGroup';
export {
  SegmentedControl,
  type SegmentedControlProps,
} from '@openai/apps-sdk-ui/components/SegmentedControl';
export { Select, type SelectProps } from '@openai/apps-sdk-ui/components/Select';
export { Slider, type SliderProps } from '@openai/apps-sdk-ui/components/Slider';
export { Textarea, type TextareaProps } from '@openai/apps-sdk-ui/components/Textarea';
export { Tooltip, type TooltipProps } from '@openai/apps-sdk-ui/components/Tooltip';

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
