import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import type { Message } from '@socrates/contracts';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { Markdown } from '../render/MarkdownView';
import { ToolCard } from './ToolCard';
import { AnimatedPressable } from './AnimatedPressable';
import { messagesApi } from '../data/api/client';

export function MessageBubble({ message }: { message: Message }) {
  const { colors, radius, spacing, typography } = useTheme();
  const t = useT();
  const isUser = message.role === 'user';
  const text = message.rawText || message.content || '';
  const streaming = message.type === 'streaming';
  const [rating, setRating] = useState<'up' | 'down' | 'none'>('none');
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => { void Speech.stop(); }, []);

  const rate = async (next: 'up' | 'down') => {
    const value = rating === next ? 'none' : next;
    setRating(value);
    if (message.id) await messagesApi.feedback(message.id, value).catch(() => undefined);
  };

  const toggleSpeech = async () => {
    if (speaking) {
      await Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(text, { onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false), onError: () => setSpeaking(false) });
  };
  if (!text && !message.reasoningContent && !message.toolCalls?.length && !message.attachments?.length) return null;
  return (
    <View style={[styles.row, { justifyContent: isUser ? 'flex-end' : 'flex-start' }]}>
      <View style={[styles.bubble, { backgroundColor: isUser ? '#353535' : 'transparent', borderRadius: isUser ? radius.xl : 0, paddingHorizontal: isUser ? 20 : 2, paddingVertical: isUser ? 14 : spacing.xs, maxWidth: isUser ? '88%' : '100%' }]}> 
        {!isUser && message.reasoningContent ? (
          <View style={[styles.reasoning, { backgroundColor: colors.reasoningBg, borderRadius: radius.sm }]}>
            <Text style={[styles.reasoningLabel, { color: colors.textSubtle }]}>{streaming ? t('think.thinking') : t('think.title')}</Text>
            <Text style={[styles.reasoningText, { color: colors.reasoningFg }]}>{message.reasoningContent}</Text>
          </View>
        ) : null}
        {message.attachments?.map((attachment) => (
          <View key={attachment.id} style={[styles.attachment, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text numberOfLines={1} style={[styles.attachmentText, { color: colors.textMuted }]}>{attachment.name}</Text>
          </View>
        ))}
        {message.toolCalls?.map((tool) => <ToolCard key={tool.id} call={tool} />)}
        {/* The user's own text is what they typed: render it verbatim rather than
            re-interpreting their markdown characters. */}
        {isUser
          ? (text ? <Text selectable style={[styles.text, { color: colors.text, fontFamily: typography.body }]}>{text}</Text> : null)
          : <Markdown text={text} streaming={streaming} />}
        {!streaming && text ? (
          <View style={[styles.toolbar, isUser && styles.toolbarUser]}>
            <AnimatedPressable accessibilityLabel="Copy message" onPress={() => { void Clipboard.setStringAsync(text); }} style={styles.toolbarButton}>
              <Ionicons name="copy-outline" size={17} color={colors.textSubtle} />
            </AnimatedPressable>
            {!isUser ? (
              <>
                <AnimatedPressable accessibilityLabel={speaking ? 'Stop reading' : 'Read aloud'} onPress={toggleSpeech} style={styles.toolbarButton}>
                  <Ionicons name={speaking ? 'stop-circle-outline' : 'volume-medium-outline'} size={19} color={speaking ? colors.accent : colors.textSubtle} />
                </AnimatedPressable>
                <AnimatedPressable accessibilityLabel="Helpful" onPress={() => { void rate('up'); }} style={styles.toolbarButton}>
                  <Ionicons name={rating === 'up' ? 'thumbs-up' : 'thumbs-up-outline'} size={17} color={rating === 'up' ? colors.accent : colors.textSubtle} />
                </AnimatedPressable>
                <AnimatedPressable accessibilityLabel="Not helpful" onPress={() => { void rate('down'); }} style={styles.toolbarButton}>
                  <Ionicons name={rating === 'down' ? 'thumbs-down' : 'thumbs-down-outline'} size={17} color={rating === 'down' ? colors.accent : colors.textSubtle} />
                </AnimatedPressable>
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 5 },
  bubble: {},
  text: { fontSize: 19, lineHeight: 29 },
  reasoning: { paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  reasoningLabel: { fontSize: 10, letterSpacing: 1, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' },
  reasoningText: { fontSize: 12, lineHeight: 18 },
  attachment: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8, maxWidth: 240 },
  attachmentText: { fontSize: 12, fontWeight: '600' },
  toolbar: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 6, marginLeft: -8 },
  toolbarUser: { justifyContent: 'flex-end', marginLeft: 0, marginRight: -8, marginBottom: -8 },
  toolbarButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
});
