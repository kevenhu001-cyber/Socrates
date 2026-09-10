import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { AnimatedPressable } from './AnimatedPressable';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

type Listener = () => void;

let current: ToastItem | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => {
    listener();
  });
}

/**
 * Frontend toast duration scales with copy length (roughly 2.5–5s).
 * Callers can pass an explicit duration for tests or persistent toasts
 * (`0` disables auto-dismiss).
 */
export function toastDuration(message: string, requested?: number): number {
  if (requested !== undefined) return Math.max(0, requested);
  return Math.min(5000, Math.max(2500, 1200 + message.length * 40));
}

export function showToast(message: string, type: ToastType = 'info', durationMs?: number): number {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const duration = toastDuration(message, durationMs);
  current = { id: nextId++, message, type };
  emit();
  if (duration > 0) {
    timer = setTimeout(() => {
      timer = null;
      current = null;
      emit();
    }, duration);
  }
  return current.id;
}

export function dismissToast(id?: number): void {
  if (!current) return;
  if (id !== undefined && id !== current.id) return;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  current = null;
  emit();
}

export function getToast(): ToastItem | null {
  return current;
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const toast = {
  show: showToast,
  dismiss: dismissToast,
};

const TYPE_ICON: Record<ToastType, string> = {
  success: 'checkmark-circle',
  info: 'information-circle',
  warning: 'warning',
  error: 'alert-circle',
};

/**
 * Themed toast host. Mirrors frontend `.alert-container` /
 * `.alert-item` (`frontend/src/styles.css:1928-1958`): 13px body,
 * per-type tint, `alertSlideIn .3s var(--ease-out)` entrance. Mobile
 * docks bottom-center inside the safe area instead of bottom-right.
 */
export function ToastHost() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const item = useSyncExternalStore(subscribeToast, getToast, getToast);
  const [rendered, setRendered] = useState<ToastItem | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    let exit: Animated.CompositeAnimation | null = null;
    if (item) {
      setRendered(item);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 300, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }),
        Animated.timing(translate, { toValue: 0, duration: 300, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }),
      ]).start();
    } else if (rendered) {
      const animation = Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(translate, { toValue: 8, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]);
      animation.start(({ finished }) => {
        if (finished) setRendered(null);
      });
      exit = animation;
    }
    return () => {
      exit?.stop();
    };
  }, [item, opacity, rendered, translate]);

  if (!rendered) return null;
  const tone = rendered.type === 'success'
    ? colors.success
    : rendered.type === 'warning'
      ? colors.warning
      : rendered.type === 'error'
        ? colors.danger
        : colors.accent;

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom, 0) + 16 }]}>
      <Animated.View
        testID="toast"
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: withAlpha(tone, 0.35),
            opacity,
            transform: [{ translateY: translate }],
          },
        ]}
      >
        <Ionicons name={TYPE_ICON[rendered.type] as never} size={18} color={tone} />
        <Text style={[styles.message, { color: tone, fontFamily: typography.body }]}>{rendered.message}</Text>
        <AnimatedPressable
          testID="toast-close"
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={() => dismissToast(rendered.id)}
          style={styles.close}
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </AnimatedPressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 50,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  message: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 20,
  },
  close: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
