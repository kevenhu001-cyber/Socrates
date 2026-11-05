/**
 * Small shared pieces for the RN-2 turn components: a hairline chevron,
 * a reduced-motion hook and the indeterminate progress hairline.
 * Nothing here draws a dot; state is carried by text, lines and glyphs.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View, type LayoutChangeEvent } from 'react-native';
import { uiMotion } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';

export const nativeDriver = Platform.OS !== 'web';

/* One app-lifetime subscription feeds every hook. react-native-web keys its
   reduceMotionChanged handlers by the handler's source text, so per-component
   add/remove pairs collide: unmounting one row's hook detached another
   surface's listener and it never saw the preference change. */
let reducedNow = false;
let subscribed = false;
const reducedListeners = new Set<(value: boolean) => void>();

function subscribeReducedMotion(): void {
  if (subscribed) return;
  subscribed = true;
  const publish = (value: boolean) => {
    reducedNow = Boolean(value);
    reducedListeners.forEach((listener) => listener(reducedNow));
  };
  AccessibilityInfo.isReduceMotionEnabled?.().then(publish).catch(() => undefined);
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', publish);
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(reducedNow);
  useEffect(() => {
    subscribeReducedMotion();
    reducedListeners.add(setReduced);
    setReduced(reducedNow);
    return () => {
      reducedListeners.delete(setReduced);
    };
  }, []);
  return reduced;
}

/** Chevron drawn from two hairline borders. Points right when closed and
 * turns down when open, so the rotation itself says "this expands here". */
export function Chevron({ open = false, size = 7, tone = 'tertiary' }: { open?: boolean; size?: number; tone?: 'ink' | 'secondary' | 'tertiary' }) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      turn.setValue(open ? 1 : 0);
      return;
    }
    Animated.timing(turn, { toValue: open ? 1 : 0, duration: uiMotion.fast, easing: Easing.out(Easing.quad), useNativeDriver: nativeDriver }).start();
  }, [open, reduced, turn]);
  const color = tone === 'ink' ? colors.ink : tone === 'secondary' ? colors.inkSecondary : colors.inkTertiary;
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['-45deg', '45deg'] });
  return (
    <View aria-hidden style={{ width: 16, height: 16, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          borderRightWidth: 1.5,
          borderBottomWidth: 1.5,
          borderColor: color,
          marginLeft: -2,
          transform: [{ rotate }],
        }}
      />
    </View>
  );
}

/**
 * Indeterminate progress hairline: a short ink segment travels along a
 * 1px track while work is in flight. It is the only live motion on the
 * thinking line and stops (track only) under reduced motion.
 */
export function ProgressHairline({ active, testID }: { active: boolean; testID?: string }) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const travel = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || reduced || width <= 0) {
      travel.stopAnimation();
      travel.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(travel, {
      toValue: 1,
      duration: 1600,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: nativeDriver,
    }));
    loop.start();
    return () => loop.stop();
  }, [active, reduced, width, travel]);
  const segment = Math.max(24, width * 0.28);
  const translateX = travel.interpolate({ inputRange: [0, 1], outputRange: [-segment, width] });
  return (
    <View
      testID={testID}
      aria-hidden
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={{ height: 1, overflow: 'hidden', backgroundColor: active ? colors.hairline : 'transparent', borderRadius: 1 }}
    >
      {active && !reduced ? (
        <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: segment, backgroundColor: colors.inkSecondary, transform: [{ translateX }] }} />
      ) : null}
    </View>
  );
}

/** Opacity breathing for an in-flight status word (e.g. 「进行中」). */
export function useBreathing(active: boolean): Animated.Value {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active || reduced) {
      value.stopAnimation();
      value.setValue(1);
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(value, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: nativeDriver }),
      Animated.timing(value, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: nativeDriver }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active, reduced, value]);
  return value;
}

/** Fades content in when it first appears (an expanded body, a sheet). */
export function useReveal(visible: boolean, distance = 4) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      value.setValue(visible ? 1 : 0);
      return;
    }
    Animated.timing(value, { toValue: visible ? 1 : 0, duration: uiMotion.medium, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }).start();
  }, [visible, reduced, value]);
  return {
    opacity: value,
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [-distance, 0] }) }],
  };
}
