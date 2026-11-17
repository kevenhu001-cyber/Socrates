import type { ComponentType } from 'react';
import { Switch, type SwitchProps } from 'react-native';
import { uiControl, uiSpace } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';

export function SettingsSwitch({ label, value, onValueChange, control: Control = Switch }: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  control?: ComponentType<SwitchProps>;
}) {
  const { colors } = useUiTheme();
  return <Control
    accessibilityLabel={label}
    value={value}
    onValueChange={onValueChange}
    trackColor={{ false: colors.hairlineStrong, true: colors.ink }}
    thumbColor={value ? colors.onInk : colors.inkSecondary}
    style={{ width: uiControl.pill, height: uiSpace[4] }}
  />;
}
