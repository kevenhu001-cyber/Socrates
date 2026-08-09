import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

const WITH_BOTTOM: Edge[] = ['top', 'left', 'right', 'bottom'];

export function Screen({ children, scroll = false, keyboard = false, style, ...props }: ViewProps & { scroll?: boolean; keyboard?: boolean }) {
  const { colors } = useTheme();
  const content = scroll ? <ScrollView contentContainerStyle={[styles.scroll, style]} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[styles.content, style]} {...props}>{children}</View>;
  const wrapped = keyboard ? <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>{content}</KeyboardAvoidingView> : content;
  return <SafeAreaView edges={WITH_BOTTOM} style={[styles.safe, { backgroundColor: colors.background }]}>{wrapped}</SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, flex: { flex: 1 }, content: { flex: 1 }, scroll: { flexGrow: 1, padding: 20 }, });
