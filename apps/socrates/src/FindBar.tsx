import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getThemePaletteHex, type ThemeMode } from '@socrates/theme';
import { Icon, uiStrings, type UiLanguage } from '@socrates/ui';

export function FindBar({
  open, query, count, activeIndex, compact, mode, language = 'en',
  onChange, onPrevious, onNext, onClose,
}: {
  open: boolean;
  query: string;
  count: number;
  activeIndex: number;
  compact: boolean;
  mode: ThemeMode;
  language?: UiLanguage;
  onChange(value: string): void;
  onPrevious(): void;
  onNext(): void;
  onClose(): void;
}) {
  const p = getThemePaletteHex(mode);
  const t = uiStrings(language);
  if (!open) return null;
  return <View style={[styles.bar, compact ? styles.barCompact : styles.barDesktop, { backgroundColor: p.bg.overlay, borderColor: p.border.subtle }]} accessibilityRole="search">
    <Icon name="search" size={16} color={p.text.muted} />
    <TextInput
      accessibilityLabel={t.findInConversation}
      autoFocus
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      returnKeyType="search"
      value={query}
      onChangeText={onChange}
      onSubmitEditing={onNext}
      onKeyPress={(event) => { if (event.nativeEvent.key === 'Escape') onClose(); }}
      placeholder={t.findPlaceholder}
      placeholderTextColor={p.text.muted}
      style={[styles.input, compact ? styles.inputCompact : styles.inputDesktop, { color: p.text.primary }]}
    />
    <Text accessibilityLiveRegion="polite" style={[styles.count, { color: p.text.muted }]}>{query ? t.findCount(count ? activeIndex + 1 : 0, count) : ''}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={t.previousMatch} disabled={!count} onPress={onPrevious} style={styles.button}>
      <Text style={[styles.caretUp, { color: count ? p.text.secondary : p.text.disabled }]}>⌃</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={t.nextMatch} disabled={!count} onPress={onNext} style={styles.button}>
      <Text style={[styles.caretDown, { color: count ? p.text.secondary : p.text.disabled }]}>⌄</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={t.closeFind} onPress={onClose} style={styles.button}>
      <Icon name="close" size={16} color={p.text.secondary} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', top: 10, zIndex: 60, elevation: 8,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 40, paddingHorizontal: 8, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 12,
  },
  barDesktop: { right: 14 },
  barCompact: { top: 8, right: 8, left: 8 },
  input: { paddingVertical: 0, paddingHorizontal: 0, borderWidth: 0, fontSize: 14, lineHeight: 20 },
  inputDesktop: { width: 200 },
  inputCompact: { flex: 1, minWidth: 40 },
  count: { minWidth: 34, textAlign: 'right', fontSize: 12, fontVariant: ['tabular-nums'] },
  button: { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  caretUp: { fontSize: 19, lineHeight: 22, marginTop: 4 },
  caretDown: { fontSize: 19, lineHeight: 22, marginTop: -3 },
});
