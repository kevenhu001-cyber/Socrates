import React, { useRef, useState } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { motionEasing, withAlpha } from '../theme/theme';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

interface Props extends PressableProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scale?: number;
  /** Resting scale (default 1). The press spring runs between
   *  `restingScale` and `scale`, so e.g. frontend's
   *  `.send-btn.active { transform: scale(1.05) }` composes with the
   *  `.92` press dip instead of being overridden by it. */
  restingScale?: number;
  /** Opacity applied when `disabled`. Defaults to 1 (no visual change);
   *  pass e.g. 0.5 to mirror frontend's `:disabled { opacity: .3–.6 }`. */
  disabledOpacity?: number;
  /** Keyboard focus ring. Defaults to true to mirror frontend's global
   *  `:focus-visible` accent outline. Ignored while `disabled`. */
  focusRing?: boolean;
}

export function AnimatedPressable({ children, style, scale = 0.975, restingScale = 1, disabledOpacity = 1, focusRing = true, onPressIn, onPressOut, onFocus, onBlur, ...props }: Props) {
  const { colors } = useTheme();
  const value = useRef(new Animated.Value(restingScale)).current;
  const [focused, setFocused] = useState(false);
  /* Web press feedback is a CSS transition, not a spring simulation —
   * use the canonical `easing.spring` bezier (`cubic-bezier(0.34, 1.3,
   * 0.64, 1)`, ~180ms reads the same as the old damped spring). */
  const animate = (toValue: number) =>
    Animated.timing(value, { toValue, duration: 180, easing: motionEasing.spring, useNativeDriver: true }).start();
  /* frontend `button:focus-visible, a:focus-visible { outline: 2px solid
   * hsl(var(--accent-000)/.85); outline-offset: 2px }`. RN has no focus
   * pseudo-class; emulate it for keyboard/TV/web focus. Unknown outline
   * keys are ignored by native drivers, so touch layout is unaffected. */
  const focusStyle = (focusRing && focused && !props.disabled
    ? { outlineStyle: 'solid', outlineWidth: 2, outlineOffset: 2, outlineColor: withAlpha(colors.accent, 0.85) } as ViewStyle
    : null);
  return (
    <AnimatedPressableBase
      {...props}
      accessibilityRole={props.accessibilityRole ?? 'button'}
      style={[style, props.disabled && disabledOpacity !== 1 ? { opacity: disabledOpacity } : null, focusStyle, { transform: [{ scale: value }] }]}
      onPressIn={(event) => { if (!props.disabled) animate(scale); onPressIn?.(event); }}
      onPressOut={(event) => { if (!props.disabled) animate(restingScale); onPressOut?.(event); }}
      onFocus={(event) => { setFocused(true); onFocus?.(event); }}
      onBlur={(event) => { setFocused(false); onBlur?.(event); }}
    >
      {children}
    </AnimatedPressableBase>
  );
}
