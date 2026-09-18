import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  testID,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, typography } = useTheme();
  const backgroundColor = variant === 'primary'
    ? colors.accent
    : variant === 'danger'
      ? colors.danger
      : variant === 'secondary'
        ? colors.surfaceHover
        : 'transparent';
  const foreground = variant === 'primary' || variant === 'danger' ? colors.textInverse : colors.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? colors.actionPressed : backgroundColor, borderRadius: radius.md, opacity: disabled ? 0.45 : 1 },
        variant === 'ghost' && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        style,
      ]}
    >
      <Text style={[styles.label, { color: foreground, fontFamily: typography.semibold }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 42, minWidth: 88, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  label: { fontSize: 13 },
});

