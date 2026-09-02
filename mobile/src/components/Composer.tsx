import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface ComposerProps {
  value: string;
  disabled?: boolean;
  hasAttachments?: boolean;
  reasoningEffort?: ReasoningEffort;
  webSearchEnabled?: boolean;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onAttach: () => void;
  onChangeReasoningEffort?: (effort: ReasoningEffort) => void;
  onToggleWebSearch?: () => void;
  onVoiceInput?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function Composer({
  value,
  disabled = false,
  hasAttachments = false,
  reasoningEffort = 'medium',
  webSearchEnabled = false,
  onChangeText,
  onSend,
  onStop,
  onAttach,
  onChangeReasoningEffort,
  onToggleWebSearch,
  onVoiceInput,
  placeholder,
  autoFocus = false,
}: ComposerProps) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const canSend = (value.trim().length > 0 || hasAttachments) && !disabled;

  const cycleReasoningEffort = () => {
    if (!onChangeReasoningEffort) return;
    const next: Record<ReasoningEffort, ReasoningEffort> = {
      low: 'medium',
      medium: 'high',
      high: 'low',
    };
    onChangeReasoningEffort(next[reasoningEffort]);
  };

  const effortLabel: Record<ReasoningEffort, string> = {
    low: t('effort.low') || 'Low',
    medium: t('effort.medium') || 'Medium',
    high: t('effort.high') || 'High',
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: focused ? colors.borderStrong : colors.border,
          borderRadius: radius.xl,
        },
      ]}
    >
      {/* Input area */}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        multiline
        maxLength={32000}
        placeholder={placeholder || t('chat.placeholder') || 'Type your thinking...'}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          {
            color: colors.text,
            fontFamily: typography.body,
          },
        ]}
        autoFocus={autoFocus}
        returnKeyType="default"
        blurOnSubmit={false}
      />

      {/* Footer Controls Row */}
      <View style={styles.footer}>
        {/* Left Action Buttons */}
        <View style={styles.leftTools}>
          {/* Add Tools / Attachments Button (+) */}
          <AnimatedPressable
            onPress={onAttach}
            accessibilityRole="button"
            accessibilityLabel={t('chat.attach') || 'Add tools and files'}
            style={[styles.toolCircleBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="add" size={20} color={colors.text} />
          </AnimatedPressable>

          {/* Reasoning Effort Selector Pill */}
          {onChangeReasoningEffort ? (
            <AnimatedPressable
              onPress={cycleReasoningEffort}
              accessibilityRole="button"
              accessibilityLabel={`Reasoning effort: ${effortLabel[reasoningEffort]}`}
              style={[
                styles.effortPill,
                {
                  backgroundColor: reasoningEffort === 'high' ? colors.accentSoft : colors.surface,
                  borderColor: reasoningEffort === 'high' ? colors.accent : colors.border,
                  borderRadius: radius.pill,
                },
              ]}
            >
              {/* Ascending 3-bars glyph */}
              <View style={styles.barsGlyph}>
                <View
                  style={[
                    styles.bar,
                    { height: 6, backgroundColor: colors.accent },
                  ]}
                />
                <View
                  style={[
                    styles.bar,
                    {
                      height: 10,
                      backgroundColor: reasoningEffort === 'medium' || reasoningEffort === 'high'
                        ? colors.accent
                        : colors.borderStrong,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.bar,
                    {
                      height: 14,
                      backgroundColor: reasoningEffort === 'high' ? colors.accent : colors.borderStrong,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.effortText,
                  {
                    color: reasoningEffort === 'high' ? colors.accent : colors.textMuted,
                    fontFamily: typography.medium,
                  },
                ]}
              >
                {effortLabel[reasoningEffort]}
              </Text>
            </AnimatedPressable>
          ) : null}

          {/* Web Search Toggle Pill */}
          {onToggleWebSearch ? (
            <AnimatedPressable
              onPress={onToggleWebSearch}
              accessibilityLabel="Web search"
              style={[
                styles.webSearchPill,
                {
                  backgroundColor: webSearchEnabled ? colors.accentSoft : colors.surface,
                  borderColor: webSearchEnabled ? colors.accent : colors.border,
                  borderRadius: radius.pill,
                },
              ]}
            >
              <Ionicons
                name="globe-outline"
                size={14}
                color={webSearchEnabled ? colors.accent : colors.textMuted}
              />
              <Text
                style={[
                  styles.webSearchText,
                  {
                    color: webSearchEnabled ? colors.accent : colors.textMuted,
                    fontFamily: typography.medium,
                  },
                ]}
              >
                {t('composer.tools.webSearch') || 'Web'}
              </Text>
            </AnimatedPressable>
          ) : null}
        </View>

        {/* Right Send / Voice / Stop Action */}
        <View style={styles.rightAction}>
          {disabled ? (
            <AnimatedPressable
              accessibilityLabel={t('chat.stopGenerating') || 'Stop generating'}
              onPress={onStop}
              style={[styles.actionBtn, { backgroundColor: colors.text }]}
            >
              <Ionicons name="stop" size={16} color={colors.background} />
            </AnimatedPressable>
          ) : canSend ? (
            <AnimatedPressable
              accessibilityLabel={t('chat.send') || 'Send message'}
              onPress={onSend}
              style={[styles.actionBtn, { backgroundColor: colors.accent }]}
            >
              <Ionicons name="arrow-up" size={20} color={colors.textInverse} />
            </AnimatedPressable>
          ) : (
            <AnimatedPressable
              accessibilityLabel="Voice input"
              onPress={onVoiceInput || onAttach}
              style={[styles.actionBtn, { backgroundColor: colors.surface }]}
            >
              <Ionicons name="mic-outline" size={20} color={colors.textMuted} />
            </AnimatedPressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    minHeight: 96,
  },
  input: {
    fontSize: 15,
    lineHeight: 22,
    maxHeight: 140,
    minHeight: 44,
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 8,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  leftTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    flex: 1,
  },
  toolCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  effortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 32,
    borderWidth: 1,
    gap: 6,
  },
  barsGlyph: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 14,
  },
  bar: {
    width: 3,
    borderRadius: 1.5,
  },
  effortText: {
    fontSize: 12,
  },
  webSearchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    height: 32,
    borderWidth: 1,
    gap: 4,
  },
  webSearchText: {
    fontSize: 12,
  },
  rightAction: {
    marginLeft: 8,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
