import React, { useRef } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

interface Props extends PressableProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scale?: number;
}

export function AnimatedPressable({ children, style, scale = 0.975, onPressIn, onPressOut, ...props }: Props) {
  const value = useRef(new Animated.Value(1)).current;
  const animate = (toValue: number) => Animated.spring(value, { toValue, useNativeDriver: true, damping: 18, stiffness: 260, mass: 0.7 }).start();
  return (
    <AnimatedPressableBase
      {...props}
      accessibilityRole={props.accessibilityRole ?? 'button'}
      style={[style, { transform: [{ scale: value }] }]}
      onPressIn={(event) => { animate(scale); onPressIn?.(event); }}
      onPressOut={(event) => { animate(1); onPressOut?.(event); }}
    >
      {children}
    </AnimatedPressableBase>
  );
}
