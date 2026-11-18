import type { ComponentType } from 'react';
import { Switch, View, type SwitchProps } from 'react-native';
import { uiControl, uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';

export function SettingsSwitch({
  label,
  value,
  onValueChange,
  control: Control = Switch,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  control?: ComponentType<SwitchProps>;
}) {
  const { colors } = useUiTheme();
  return (
    <Control
      accessibilityLabel={label}
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: colors.hairlineStrong, true: colors.ink }}
      thumbColor={value ? colors.onInk : colors.inkSecondary}
      style={{ width: uiControl.pill, height: uiSpace[4] }}
    />
  );
}

export function AccountPageTitle({ id, title }: { id: string; title: string }) {
  const focusProps = { tabIndex: -1 as const };
  return (
    <UiText nativeID={id} role="heading" variant="title" {...focusProps}>
      {title}
    </UiText>
  );
}

export function ProfileIdentity({ initials, email }: { initials: string; email: string }) {
  const { colors } = useUiTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: uiSpace[4] }}>
      <View
        aria-hidden
        style={{
          width: 56,
          height: 56,
          borderRadius: uiRadius.pill,
          backgroundColor: colors.fill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <UiText variant="titleSm">{initials}</UiText>
      </View>
      <UiText nativeID="profileEmail" variant="body" tone="secondary" style={{ flexShrink: 1 }}>
        {email}
      </UiText>
    </View>
  );
}
