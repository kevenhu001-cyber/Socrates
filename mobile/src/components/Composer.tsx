import React, { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';

export function Composer({ value, disabled, onChangeText, onSend, onStop, onAttach }: { value: string; disabled?: boolean; onChangeText: (value: string) => void; onSend: () => void; onStop: () => void; onAttach: () => void }) {
  const { colors, radius, spacing, typography } = useTheme();
  const t = useT();
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const canSend = value.trim().length > 0 && !disabled;
  return (
    <View style={[styles.wrap, focused && styles.wrapFocused, { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong, borderRadius: focused ? radius.xl : radius.pill, padding: spacing.xs }]}> 
      <AnimatedPressable onPress={onAttach} accessibilityRole="button" accessibilityLabel={t('chat.attach')} style={styles.add}>
        <Ionicons name="attach" size={29} color={colors.text} />
      </AnimatedPressable>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        multiline
        maxLength={32000}
        placeholder={t('chat.placeholder')}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: colors.text, fontFamily: typography.body }]}
        returnKeyType="default"
        blurOnSubmit={false}
      />
      {disabled ? (
        <AnimatedPressable accessibilityLabel={t('chat.stopGenerating')} onPress={onStop} style={[styles.send, { backgroundColor: colors.text }]}>
          <Ionicons name="stop" size={17} color={colors.background} />
        </AnimatedPressable>
      ) : (
        <AnimatedPressable accessibilityLabel={t('chat.send')} disabled={!canSend} onPress={onSend} style={[styles.send, { backgroundColor: canSend ? colors.action : colors.surfacePressed }]}> 
          <Ionicons name="arrow-up" size={25} color={canSend ? colors.white : colors.textSubtle} />
        </AnimatedPressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: 64 },
  wrapFocused: { minHeight: 108, alignItems: 'flex-end' },
  add: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, fontSize: 16, lineHeight: 24, maxHeight: 130, minHeight: 44, paddingHorizontal: 5, paddingTop: 10, paddingBottom: 9, textAlignVertical: 'center' },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
