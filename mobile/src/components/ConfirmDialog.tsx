import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { AnimatedPressable } from './AnimatedPressable';
import { Overlay } from './Overlay';

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
  return (
    <Overlay visible={visible} onClose={onCancel} maxWidth={320} testID="confirm-dialog">
      <View
          accessibilityRole="alert"
          accessibilityLabel={title}
          style={styles.box}
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
        </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  /* The surrounding Overlay owns the surface, scrim and animation. */
  box: {
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
