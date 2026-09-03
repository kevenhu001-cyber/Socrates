import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Loading placeholder that mirrors frontend `.shimmer` /
 * `.shimmer-line` (`frontend/src/styles.css:2192-2197`): `bg-200` fill,
 * 6px radius, 2s shimmer cycle. RN has no gradient sweep primitive, so
 * the sweep is approximated with a 2s opacity pulse on the same token
 * (`colors.surface` === `bg-200`).
 */
export function Skeleton({ width = '100%', height = 12, borderRadius = 6, style, testID = 'skeleton' }: SkeletonProps) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [pulse]);

  // `opacity` holds an Animated.Value, which the static `ViewStyle`
  // type cannot express — the cast is layout-neutral at runtime.
  const animatedStyle = {
    width,
    height,
    borderRadius,
    backgroundColor: colors.surface,
    opacity: pulse,
  } as unknown as ViewStyle;

  return (
    <Animated.View
      accessible={false}
      testID={testID}
      style={[styles.base, animatedStyle, style]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
