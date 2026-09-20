import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { motionEasing, withAlpha, type Palette } from '../theme/theme';
import { AnimatedPressable } from './AnimatedPressable';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

type Listener = () => void;

/** Web parity: alerts stack bottom-center in a column, capped at 3 —
 * the oldest entry is dropped when a fourth arrives. */
const MAX_VISIBLE = 3;

let queue: ToastItem[] = [];
let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => {
    listener();
  });
}

function removeToast(id: number) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  const next = queue.filter((item) => item.id !== id);
  if (next.length !== queue.length) {
    queue = next;
    emit();
  }
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
  const duration = toastDuration(message, durationMs);
  const item: ToastItem = { id: nextId++, message, type };
  queue = [...queue, item].slice(-MAX_VISIBLE);
  /* A toast pushed out by the cap still has a live timer — clear it so the
   * stale timeout cannot dismiss a newer item that reused the slot. */
  for (const id of timers.keys()) {
    if (!queue.some((entry) => entry.id === id)) {
      clearTimeout(timers.get(id)!);
      timers.delete(id);
    }
  }
  emit();
  if (duration > 0) {
    timers.set(item.id, setTimeout(() => removeToast(item.id), duration));
  }
  return item.id;
}

export function dismissToast(id?: number): void {
  if (id === undefined) {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    if (queue.length) {
      queue = [];
      emit();
    }
    return;
  }
  removeToast(id);
}

/** Snapshot for `useSyncExternalStore` — new array reference per change. */
export function getToasts(): ToastItem[] {
  return queue;
}

/** Oldest visible toast — legacy single-toast accessor kept for callers
 * and tests written before the queue. */
export function getToast(): ToastItem | null {
  return queue[0] ?? null;
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

const TYPE_ICON: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const items = useSyncExternalStore(subscribeToast, getToasts, getToasts);

  if (!items.length) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom, 0) + 16 }]}>
      {items.map((item) => (
        <ToastCard key={item.id} item={item} colors={colors} />
      ))}
    </View>
  );
}

function toneFor(type: ToastType, colors: Palette): string {
  return type === 'success'
    ? colors.success
    : type === 'warning'
      ? colors.warning
      : type === 'error'
        ? colors.danger
        : colors.accent;
}

/* Each card mounts with the web `alertSlideIn .3s var(--ease-out)` ramp
 * (`motionEasing.out`) and unmounts on dismissal — per-card exit fades are
 * skipped because the queue already keeps at most 3 items on screen. */
function ToastCard({ item, colors }: { item: ToastItem; colors: Palette }) {
  const { typography } = useTheme();
  const t = useT();
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(8)).current;
  const tone = toneFor(item.type, colors);

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, easing: motionEasing.out, useNativeDriver: true }),
      Animated.timing(translate, { toValue: 0, duration: 300, easing: motionEasing.out, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [opacity, translate]);

  return (
    <Animated.View
      testID="toast"
      style={[
        styles.card,
        {
          /* Frontend `.alert-item` tints the card itself with the tone
           * rather than leaving it on the raised surface. */
          backgroundColor: withAlpha(tone, 0.1),
          borderColor: withAlpha(tone, 0.35),
          opacity,
          transform: [{ translateY: translate }],
        },
      ]}
    >
      <Ionicons name={TYPE_ICON[item.type]} size={18} color={tone} />
      <Text style={[styles.message, { color: tone, fontFamily: typography.body }]}>{item.message}</Text>
      <AnimatedPressable
        testID="toast-close"
        accessibilityRole="button"
        accessibilityLabel={t('common.dismiss')}
        onPress={() => dismissToast(item.id)}
        style={styles.close}
      >
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </AnimatedPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    gap: 8,
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
