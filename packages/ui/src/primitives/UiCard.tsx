import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { uiRadius, uiSpace } from '@socrates/theme';
import { dataAttributes, type DataSet } from '../domProps';
import { domStyle, type ViewStyle } from '../domStyle';
import { useUiTheme } from './theme';
import { usePressFeedback } from './UiButton';

export type UiCardTone = 'raised' | 'fill';

function cardStyle(
  tone: UiCardTone,
  colors: ReturnType<typeof useUiTheme>['colors'],
  hovered: boolean,
): ViewStyle {
  return {
    borderRadius: uiRadius.card,
    padding: uiSpace[5],
    backgroundColor: tone === 'raised' ? colors.card : hovered ? colors.fillHover : colors.fill,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor:
      tone === 'raised' ? (hovered ? colors.hairlineStrong : colors.hairline) : 'transparent',
  };
}

/** Rounded card. `raised` is white with a hairline; `fill` is pale grey. */
export function UiCard({
  tone = 'raised',
  style,
  children,
}: {
  tone?: UiCardTone;
  style?: unknown;
  children?: ReactNode;
}) {
  const { colors } = useUiTheme();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        ...cardStyle(tone, colors, false),
        ...domStyle(style),
      }}
    >
      {children}
    </div>
  );
}

export interface UiPressableCardProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'style' | 'children'
> {
  tone?: UiCardTone;
  style?: unknown;
  children?: ReactNode;
  /** RN alias kept while callers migrate. */
  onPress?: (event: MouseEvent<HTMLButtonElement>) => void;
  accessibilityRole?: string;
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean; disabled?: boolean; [key: string]: unknown };
  testID?: string;
  nativeID?: string;
  dataSet?: DataSet;
}

/** A card that is one button: hover darkens the hairline, press scales slightly. */
export function UiPressableCard({
  tone = 'raised',
  style,
  children,
  onPress,
  accessibilityRole,
  accessibilityLabel,
  accessibilityState,
  testID,
  nativeID,
  dataSet,
  disabled,
  onClick,
  ...rest
}: UiPressableCardProps) {
  const { colors } = useUiTheme();
  const { scale, hovered, focused, handlers } = usePressFeedback();
  const pressedState =
    (accessibilityState && 'selected' in accessibilityState
      ? accessibilityState.selected
      : undefined) ?? (rest['aria-pressed'] as boolean | undefined);

  return (
    <button
      {...rest}
      type="button"
      disabled={disabled}
      id={nativeID || (rest.id as string | undefined)}
      data-testid={testID}
      role={accessibilityRole ?? (rest.role as string | undefined) ?? 'button'}
      aria-label={accessibilityLabel ?? (rest['aria-label'] as string | undefined)}
      aria-pressed={pressedState}
      aria-disabled={accessibilityState?.disabled || undefined}
      {...dataAttributes(dataSet)}
      {...handlers}
      onClick={onPress ?? onClick}
      style={{
        appearance: 'none',
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        font: 'inherit',
        color: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        ...domStyle(style),
        ...(focused ? { outline: `2px solid ${colors.ink}`, outlineOffset: 2 } : {}),
      }}
    >
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          ...cardStyle(tone, colors, hovered),
          flexGrow: 1,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </span>
    </button>
  );
}
