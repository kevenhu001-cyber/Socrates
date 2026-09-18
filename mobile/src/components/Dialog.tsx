import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Overlay, type OverlayProps } from './Overlay';
import { useTheme } from '../theme/ThemeProvider';
import { AnimatedPressable } from './AnimatedPressable';

export interface DialogProps extends Omit<OverlayProps, 'children'> {
  title: string;
  message?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  children?: React.ReactNode;
}

export function Dialog({ title, message, cancelLabel, onCancel, children, ...overlayProps }: DialogProps) {
  const { colors, typography, spacing } = useTheme();
  const cancel = onCancel || overlayProps.onClose;
  return (
    <Overlay {...overlayProps}>
      <View style={{ padding: spacing.xl }}>
        <Text style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>{title}</Text>
        {message ? <Text style={[styles.message, { color: colors.textMuted, fontFamily: typography.body }]}>{message}</Text> : null}
        {children}
        {cancelLabel ? (
          <AnimatedPressable onPress={cancel} style={[styles.cancel, { backgroundColor: colors.surfaceHover, borderRadius: 8 }]}>
            <Text style={[styles.cancelText, { color: colors.textMuted, fontFamily: typography.medium }]}>{cancelLabel}</Text>
          </AnimatedPressable>
        ) : null}
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16 },
  message: { fontSize: 13, lineHeight: 20, marginTop: 8 },
  cancel: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 18, paddingHorizontal: 14 },
  cancelText: { fontSize: 13 },
});

