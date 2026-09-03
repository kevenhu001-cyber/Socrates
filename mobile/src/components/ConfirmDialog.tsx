import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { AnimatedPressable } from './AnimatedPressable';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Danger variant paints the confirm button red, like `.confirm-btn.danger`. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/* P6 1:1 — native port of `frontend/src/react/confirm/ConfirmDialog.tsx`
 * with `frontend/src/styles.css:2289-2300` visuals: dimmed scrim,
 * `bg-000` box at radius 14 / max-width 320, centered 15px title +
 * 13px message, Cancel + OK/Delete actions. Replaces bare
 * `Alert.alert` confirmations so destructive flows look identical
 * on both clients and stay testable (Alert is opaque to Jest). */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { colors, typography } = useTheme();
  /* frontend `.confirm-box { animation: slideUp .15s var(--ease-out) }`
   * (`styles.css:2291`): 12px → 0, opacity 0 → 1. Re-runs on every
   * open since the effect keys off `visible`. */
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    if (!visible) return undefined;
    opacity.setValue(0);
    translate.setValue(12);
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 150, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }),
      Animated.timing(translate, { toValue: 0, duration: 150, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }),
    ]);
    animation.start();
    return () => {
      animation.stop();
    };
  }, [opacity, translate, visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.overlay, { backgroundColor: colors.scrim }]}>
        <Pressable accessibilityLabel={cancelLabel} onPress={onCancel} style={styles.backdrop} />
        <Animated.View
          accessibilityRole="alert"
          accessibilityLabel={title}
          style={[
            styles.box,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: withAlpha(colors.border, 0.15),
              opacity,
              transform: [{ translateY: translate }],
            },
          ]}
        >
          <Text style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>
            {title}
          </Text>
          {message ? (
            <Text style={[styles.message, { color: colors.textMuted, fontFamily: typography.body }]}>
              {message}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <AnimatedPressable
              testID="confirm-cancel"
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              disabled={busy}
              onPress={onCancel}
              style={[styles.button, { backgroundColor: colors.surfaceHover, borderRadius: 8 }]}
            >
              <Text style={[styles.buttonText, { color: colors.textMuted, fontFamily: typography.medium }]}>
                {cancelLabel}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              testID="confirm-ok"
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              disabled={busy}
              onPress={onConfirm}
              style={[
                styles.button,
                {
                  backgroundColor: danger ? colors.dangerSoft : colors.accent,
                  borderRadius: 8,
                },
              ]}
            >
              <Text
                style={[
                  styles.buttonText,
                  {
                    color: danger ? colors.danger : colors.textInverse,
                    fontFamily: typography.medium,
                  },
                ]}
              >
                {confirmLabel}
              </Text>
            </AnimatedPressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  /* frontend `.confirm-dialog`: fixed inset-0, rgba(0,0,0,.65), centered. */
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  /* frontend `.confirm-box`: bg-000, 0.5px border, radius 14,
   * width 90% max 320, padding 24/20/16. */
  box: {
    width: '90%',
    maxWidth: 320,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  /* frontend `.confirm-btn`: padding 8/20, radius 8, 13px. */
  button: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 13,
  },
});
