import { useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { uiMotion, uiRadius, uiSpace } from '@socrates/theme';
import { dataAttributes, type DataSet } from '../domProps';
import { domStyle } from '../domStyle';
import { useUiTheme } from './theme';
import { UiText } from './UiText';

export type UiButtonVariant = 'primary' | 'secondary' | 'ghost';
export type UiButtonSize = 'sm' | 'md' | 'lg';

const HEIGHT: Record<UiButtonSize, number> = { sm: 32, md: 40, lg: 48 };
const PAD_X: Record<UiButtonSize, number> = { sm: uiSpace[3], md: uiSpace[4], lg: uiSpace[5] };

/** Shared press + focus feedback: a small press-in scale (the touch was
 * received) and a visible focus ring for keyboard users. Nothing else moves.
 *
 * The returned `scale` is a plain number so DOM components can use it
 * directly; the remaining `onPress*` / `onHover*` names keep the frozen shim
 * and its callers working until each surface migrates. */
export function usePressFeedback() {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);

  const press = () => setPressed(true);
  const release = () => setPressed(false);
  const enter = () => setHovered(true);
  const leave = () => {
    setHovered(false);
    setPressed(false);
  };

  return {
    scale: pressed ? 0.97 : 1,
    pressed,
    hovered,
    focused,
    handlers: {
      /* DOM names are used by migrated components. */
      onPointerDown: press,
      onPointerUp: release,
      onPointerCancel: release,
      onPointerEnter: enter,
      onPointerLeave: leave,
      onFocus: (event: unknown) => setFocused(isKeyboardFocus(event)),
      onBlur: () => setFocused(false),
      /* RN prop aliases stay on the public surface for existing callers. */
      onPressIn: press,
      onPressOut: release,
      onHoverIn: enter,
      onHoverOut: leave,
    },
  };
}

/** Ask the focused node for `:focus-visible` (the browser's own
 * keyboard-vs-pointer heuristic). Unknown hosts fall back to showing the
 * ring rather than hiding a keyboard cue. */
function isKeyboardFocus(event: unknown): boolean {
  const node = event as {
    currentTarget?: { matches?: (selector: string) => boolean };
    target?: { matches?: (selector: string) => boolean };
    nativeEvent?: { target?: { matches?: (selector: string) => boolean } };
  } | null;
  const target = node?.currentTarget ?? node?.nativeEvent?.target ?? node?.target;
  if (target && typeof target.matches === 'function') {
    try {
      return target.matches(':focus-visible');
    } catch {
      return true;
    }
  }
  return true;
}

export interface UiButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'style' | 'children'
> {
  label: string;
  variant?: UiButtonVariant;
  size?: UiButtonSize;
  /** Optional leading glyph (icon component or short text). */
  leading?: ReactNode;
  /** Marks a toggle button as on (ghost/secondary render as filled ink). */
  selected?: boolean;
  style?: unknown;
  /** RN alias kept while callers migrate. DOM callers should use onClick. */
  onPress?: (event: MouseEvent<HTMLButtonElement>) => void;
  accessibilityRole?: string;
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean; disabled?: boolean; [key: string]: unknown };
  testID?: string;
  nativeID?: string;
  dataSet?: DataSet;
  focusable?: boolean;
}

/**
 * Pill button. `primary` is the black capsule, `secondary` the pale grey
 * capsule, `ghost` a transparent capsule that fills on hover.
 *
 * React DOM by design (ADR 0027): a plain `<button>` with an inline flex
 * label, no React Native layer.
 */
export function UiButton({
  label,
  variant = 'primary',
  size = 'md',
  leading,
  selected,
  style,
  onPress,
  accessibilityRole,
  accessibilityLabel,
  accessibilityState,
  testID,
  nativeID,
  dataSet,
  focusable,
  disabled,
  type,
  onClick,
  ...rest
}: UiButtonProps) {
  const { colors } = useUiTheme();
  const { scale, hovered, focused, handlers } = usePressFeedback();
  const inked = variant === 'primary' || selected === true;
  const background = inked
    ? hovered
      ? colors.inkHover
      : colors.ink
    : variant === 'secondary'
      ? hovered
        ? colors.fillHover
        : colors.fill
      : hovered
        ? colors.fill
        : 'transparent';
  const pressedState =
    (accessibilityState && 'selected' in accessibilityState
      ? accessibilityState.selected
      : selected) ?? (rest['aria-pressed'] as boolean | undefined);
  const disabledState = accessibilityState?.disabled;

  return (
    <button
      {...rest}
      type={type ?? 'button'}
      disabled={disabled}
      id={nativeID || (rest.id as string | undefined)}
      data-testid={testID}
      role={accessibilityRole ?? (rest.role as string | undefined) ?? 'button'}
      aria-label={accessibilityLabel ?? (rest['aria-label'] as string | undefined)}
      aria-pressed={pressedState}
      aria-disabled={disabledState || undefined}
      tabIndex={focusable === false ? -1 : rest.tabIndex}
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
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: uiSpace[2],
          /* The host may raise the touch target without changing the visual
             size of every button on the surface. */
          height: `var(--ui-button-height, ${HEIGHT[size]}px)`,
          paddingLeft: PAD_X[size],
          paddingRight: PAD_X[size],
          borderRadius: uiRadius.pill,
          backgroundColor: background,
          transform: `scale(${scale})`,
          transition: `transform ${uiMotion.fast}ms ease`,
        }}
      >
        {leading}
        <UiText
          variant={size === 'sm' ? 'labelSm' : 'label'}
          tone={inked ? 'onInk' : 'ink'}
          numberOfLines={1}
        >
          {label}
        </UiText>
      </span>
    </button>
  );
}
