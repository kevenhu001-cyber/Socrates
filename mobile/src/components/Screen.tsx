import React from 'react';
import { Platform, ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useTheme } from '../theme/ThemeProvider';

const WITH_BOTTOM: Edge[] = ['top', 'left', 'right', 'bottom'];

export function Screen({ children, scroll = false, keyboard = false, style, ...props }: ViewProps & { scroll?: boolean; keyboard?: boolean }) {
  const { colors } = useTheme();
  const content = scroll ? <ScrollView contentContainerStyle={[styles.scroll, style]} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[styles.content, style]} {...props}>{children}</View>;
  /* React Native's built-in KeyboardAvoidingView only receives
   * keyboardDidShow/keyboardDidHide on Android, so its height jumps after the
   * IME has already reached the final frame. Keyboard Controller follows the
   * native inset animation on the UI thread. translate-with-padding keeps the
   * header visually fixed while the flexible body and composer move together. */
  const wrapped = keyboard ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'android' ? 'translate-with-padding' : 'padding'}
      automaticOffset
    >
      {content}
    </KeyboardAvoidingView>
  ) : content;
  return <SafeAreaView edges={WITH_BOTTOM} style={[styles.safe, { backgroundColor: colors.background }]}>{wrapped}</SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, flex: { flex: 1 }, content: { flex: 1 }, scroll: { flexGrow: 1, padding: 20 }, });
