import {
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { uiControl, uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { dataAttributes } from '../domProps';

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
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusOption = (index: number) => {
    itemRefs.current[index]?.focus();
  };

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-label={accessibilityLabel}
      {...dataAttributes({ slot: 'toggle-group' })}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        padding: 2,
        borderRadius: uiRadius.sm,
        border: `1px solid ${colors.hairline}`,
        backgroundColor: 'transparent',
      }}
    >
      {options.map((option, index) => (
        <SegmentedOption
          key={option.value}
          ref={(node) => {
            itemRefs.current[index] = node;
          }}
          selected={option.value === value}
          onPick={() => onValueChange(option.value)}
          onKeyNav={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              event.preventDefault();
              focusOption((index + 1) % options.length);
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              event.preventDefault();
              focusOption((index - 1 + options.length) % options.length);
            } else if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault();
              onValueChange(option.value);
            }
          }}
        >
          {option.label}
        </SegmentedOption>
      ))}
    </div>
  );
}

function SegmentedOption({
  ref,
  selected,
  onPick,
  onKeyNav,
  children,
}: {
  ref: (node: HTMLButtonElement | null) => void;
  selected: boolean;
  onPick: () => void;
  onKeyNav: (event: KeyboardEvent<HTMLButtonElement>) => void;
  children: string;
}) {
  const { colors } = useUiTheme();
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <button
      ref={ref}
      type="button"
      role="button"
      aria-pressed={selected ? 'true' : 'false'}
      tabIndex={0}
      {...dataAttributes({ slot: 'toggle-group-item' })}
      onClick={onPick}
      onKeyDown={onKeyNav}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        minWidth: 32,
        height: 32,
        paddingLeft: 10,
        paddingRight: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 0,
        cursor: 'pointer',
        borderRadius: uiRadius.xs,
        backgroundColor: selected
          ? colors.fill
          : pressed
            ? colors.fillPressed
            : hovered
              ? colors.fillHover
              : 'transparent',
      }}
    >
      <UiText
        variant="bodySm"
        tone={selected ? 'ink' : 'secondary'}
        style={{ fontWeight: selected ? '600' : '500' }}
      >
        {children}
      </UiText>
    </button>
  );
}

export interface SettingsSwitchControlProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel?: string;
  trackColor?: { false?: string; true?: string };
  thumbColor?: string;
  activeThumbColor?: string;
  style?: CSSProperties;
}

function DefaultSwitch({
  value,
  onValueChange,
  accessibilityLabel,
  trackColor,
  style,
}: SettingsSwitchControlProps) {
  return (
    <input
      type="checkbox"
      role="switch"
      aria-label={accessibilityLabel}
      checked={value}
      onChange={(event) => onValueChange(event.target.checked)}
      style={{
        accentColor: trackColor?.true,
        width: uiControl.pill,
        height: uiSpace[4],
        cursor: 'pointer',
        ...style,
      }}
    />
  );
}

export function SettingsSwitch({
  label,
  value,
  onValueChange,
  control: Control = DefaultSwitch,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  control?: ComponentType<SettingsSwitchControlProps>;
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
  return (
    <UiText nativeID={id} role="heading" variant="title" tabIndex={-1}>
      {title}
    </UiText>
  );
}

export function ProfileIdentity({ initials, email }: { initials: string; email: string }) {
  const { colors } = useUiTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: uiSpace[4] }}>
      <div
        aria-hidden
        style={{
          width: 56,
          height: 56,
          borderRadius: uiRadius.pill,
          backgroundColor: colors.fill,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <UiText variant="titleSm">{initials}</UiText>
      </div>
      <UiText nativeID="profileEmail" variant="body" tone="secondary" style={{ flexShrink: 1 }}>
        {email}
      </UiText>
    </div>
  );
}
