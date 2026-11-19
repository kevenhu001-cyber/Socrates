import { useRef, type ComponentType } from 'react';
import { Pressable, Switch, View, type SwitchProps } from 'react-native';
import { uiControl, uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { dataSet } from '../learn/parts';

export interface SettingsSegmentedOption {
  readonly value: string;
  readonly label: string;
}

export interface SettingsSegmentedControlProps {
  readonly labelId?: string;
  readonly accessibilityLabel?: string;
  readonly value: string;
  readonly options: readonly SettingsSegmentedOption[];
  readonly onValueChange: (value: string) => void;
}

export function SettingsSegmentedControl({
  labelId,
  accessibilityLabel,
  value,
  options,
  onValueChange,
}: SettingsSegmentedControlProps) {
  const { colors } = useUiTheme();
  const itemRefs = useRef<Array<View | null>>([]);

  const focusOption = (index: number) => {
    const target = itemRefs.current[index];
    (target as unknown as { focus?: () => void } | null)?.focus?.();
  };

  return (
    <View
      role="group"
      aria-labelledby={labelId}
      aria-label={accessibilityLabel}
      {...dataSet({ slot: 'toggle-group' })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        padding: 2,
        borderRadius: uiRadius.sm,
        borderWidth: 1,
        borderColor: colors.hairline,
        backgroundColor: 'transparent',
      }}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            role="button"
            aria-pressed={selected ? 'true' : 'false'}
            tabIndex={0}
            {...dataSet({ slot: 'toggle-group-item' })}
            onPress={() => onValueChange(option.value)}
            {...{
              onKeyDown: (event: {
                key?: string;
                nativeEvent?: { key?: string };
                preventDefault?: () => void;
              }) => {
                const key = event.key ?? event.nativeEvent?.key;
                if (key === 'ArrowRight' || key === 'ArrowDown') {
                  event.preventDefault?.();
                  focusOption((index + 1) % options.length);
                } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
                  event.preventDefault?.();
                  focusOption((index - 1 + options.length) % options.length);
                } else if (
                  key === ' ' ||
                  key === 'Space' ||
                  key === 'Spacebar' ||
                  key === 'Enter'
                ) {
                  event.preventDefault?.();
                  onValueChange(option.value);
                }
              },
            }}
            style={({ pressed, hovered }: { pressed?: boolean; hovered?: boolean }) => ({
              minWidth: 32,
              height: 32,
              paddingHorizontal: 10,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: uiRadius.xs,
              backgroundColor: selected
                ? colors.fill
                : pressed
                  ? colors.fillPressed
                  : hovered
                    ? colors.fillHover
                    : 'transparent',
            })}
          >
            <UiText
              variant="bodySm"
              tone={selected ? 'ink' : 'secondary'}
              style={{ fontWeight: selected ? '600' : '500' }}
            >
              {option.label}
            </UiText>
          </Pressable>
        );
      })}
    </View>
  );
}

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
