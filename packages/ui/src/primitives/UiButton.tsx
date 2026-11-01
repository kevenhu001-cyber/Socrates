import { useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { uiMotion, uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from './theme';
import { UiText } from './UiText';

export type UiButtonVariant = 'primary' | 'secondary' | 'ghost';
export type UiButtonSize = 'sm' | 'md' | 'lg';

const HEIGHT: Record<UiButtonSize, number> = { sm: 32, md: 40, lg: 48 };
const PAD_X: Record<UiButtonSize, number> = { sm: uiSpace[3], md: uiSpace[4], lg: uiSpace[5] };

/** Shared press + focus feedback: a small press-in scale (the touch was
 * received) and a visible focus ring for keyboard users. Nothing else moves. */
export function usePressFeedback() {
  const scale = useRef(new Animated.Value(1)).current;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  /* Pointer presses focus the control too; only keyboard focus shows the
     ring (focus-visible), so a click never leaves a black outline behind. */
  const pointer = useRef(false);
  const native = Platform.OS !== 'web';
  const to = (value: number) => Animated.timing(scale, {
    toValue: value,
    duration: uiMotion.fast,
    useNativeDriver: native,
  }).start();
  return {
    scale,
    hovered,
    focused,
    handlers: {
      onPressIn: () => {
        pointer.current = true;
        setFocused(false);
        to(0.97);
      },
      onPressOut: () => to(1),
      onHoverIn: () => setHovered(true),
      onHoverOut: () => setHovered(false),
      onFocus: (event: unknown) => setFocused(isKeyboardFocus(event, pointer.current)),
      onBlur: () => {
        pointer.current = false;
        setFocused(false);
      },
    },
  };
}

/** Web: ask the focused node for `:focus-visible` (the browser's own
 * keyboard-vs-pointer heuristic). Native: focus without a press is keyboard. */
function isKeyboardFocus(event: unknown, pressed: boolean): boolean {
  const target = (event as { nativeEvent?: { target?: { matches?: (selector: string) => boolean } } } | null)?.nativeEvent?.target;
  if (target && typeof target.matches === 'function') {
    try {
      return target.matches(':focus-visible');
    } catch (_) {
      return !pressed;
    }
  }
  return !pressed;
}

export interface UiButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: UiButtonVariant;
  size?: UiButtonSize;
  /** Optional leading glyph (icon component or short text). */
  leading?: ReactNode;
  /** Marks a toggle button as on (ghost/secondary render as filled ink). */
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Pill button. `primary` is the black capsule, `secondary` the pale grey
 * capsule, `ghost` a transparent capsule that fills on hover.
 */
export function UiButton({ label, variant = 'primary', size = 'md', leading, selected, style, ...rest }: UiButtonProps) {
  const { colors } = useUiTheme();
  const { scale, hovered, focused, handlers } = usePressFeedback();
  const inked = variant === 'primary' || selected === true;
  const background = inked
    ? (hovered ? colors.inkHover : colors.ink)
    : variant === 'secondary'
      ? (hovered ? colors.fillHover : colors.fill)
      : (hovered ? colors.fill : 'transparent');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      {...rest}
      {...handlers}
      style={style}
    >
      <Animated.View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: uiSpace[2],
          height: HEIGHT[size],
          paddingHorizontal: PAD_X[size],
          borderRadius: uiRadius.pill,
          backgroundColor: background,
          outlineStyle: focused ? 'solid' : undefined,
          outlineWidth: focused ? 2 : 0,
          outlineColor: colors.ink,
          outlineOffset: 2,
          transform: [{ scale }],
        }}
      >
        {leading}
        <UiText variant={size === 'sm' ? 'labelSm' : 'label'} tone={inked ? 'onInk' : 'ink'} numberOfLines={1}>
          {label}
        </UiText>
      </Animated.View>
    </Pressable>
  );
}
