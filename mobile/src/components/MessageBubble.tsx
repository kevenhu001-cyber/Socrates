import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Message } from '@socrates/contracts';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { Markdown } from '../render/MarkdownView';
import { ToolCard } from './ToolCard';
import { AnimatedPressable } from './AnimatedPressable';
import { messagesApi } from '../data/api/client';
import { setClipboardText } from '../native/clipboard';
import * as Speech from '../native/speech';

interface MessageBubbleProps {
  message: Message;
  isLastAssistant?: boolean;
  onRetry?: () => void;
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  isLastAssistant = false,
  onRetry,
}: MessageBubbleProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const t = useT();
  const isUser = message.role === 'user';
  const text = message.rawText || message.content || '';
  const streaming = message.type === 'streaming';
  const [rating, setRating] = useState<'up' | 'down' | 'none'>('none');
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reasoningExpanded, setReasoningExpanded] = useState(true);

  useEffect(() => () => { void Speech.stop(); }, []);

  // During streaming, keep reasoning expanded. Once finished, collapse by default if long
  useEffect(() => {
    if (!streaming && message.reasoningContent && message.reasoningContent.length > 200) {
      setReasoningExpanded(false);
    }
  }, [streaming, message.reasoningContent]);

  const rate = async (next: 'up' | 'down') => {
    const value = rating === next ? 'none' : next;
    setRating(value);
    if (message.id) {
      await messagesApi.feedback(message.id, value).catch((err) => {
        console.warn('[MessageBubble] Failed to submit feedback:', err);
      });
    }
  };

  const copyText = async () => {
    await setClipboardText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSpeech = async () => {
    if (speaking) {
      await Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(text, {
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  if (!text && !message.reasoningContent && !message.toolCalls?.length && !message.attachments?.length) {
    return null;
  }

  return (
    <View style={[styles.row, { justifyContent: isUser ? 'flex-end' : 'flex-start' }]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser ? colors.surfaceRaised : 'transparent',
            borderColor: isUser ? colors.border : 'transparent',
            borderWidth: isUser ? 1 : 0,
            borderRadius: isUser ? radius.lg : 0,
            paddingHorizontal: isUser ? 16 : 2,
            paddingVertical: isUser ? 12 : spacing.xs,
            maxWidth: isUser ? '85%' : '100%',
          },
        ]}
      >
        {/* Collapsible Reasoning Block (<think>) */}
        {!isUser && message.reasoningContent ? (
          <View style={[styles.reasoningCard, { backgroundColor: colors.reasoningBg, borderColor: colors.border, borderRadius: radius.md }]}>
            <AnimatedPressable
              onPress={() => setReasoningExpanded(!reasoningExpanded)}
              style={styles.reasoningHeader}
            >
              <View style={styles.reasoningTitleWrap}>
                <Ionicons
                  name={streaming ? 'sync-outline' : 'bulb-outline'}
                  size={14}
                  color={colors.accent}
                />
                <Text style={[styles.reasoningLabel, { color: colors.accent, fontFamily: typography.medium }]}>
                  {streaming ? (t('think.thinking') || 'Thinking…') : (t('think.title') || 'Thinking process')}
                </Text>
              </View>
              <Ionicons
                name={reasoningExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.textMuted}
              />
            </AnimatedPressable>

            {reasoningExpanded ? (
              <View style={[styles.reasoningContentWrap, { borderLeftColor: colors.accent }]}>
                <Text selectable style={[styles.reasoningText, { color: colors.reasoningFg, fontFamily: typography.body }]}>
                  {message.reasoningContent}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Attachments */}
        {message.attachments?.map((attachment) =>
          attachment.kind === 'image' && attachment.dataUrl ? (
            <View key={attachment.id} style={[styles.imageAttachment, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Image accessibilityLabel={attachment.name} source={{ uri: attachment.dataUrl }} style={styles.image} resizeMode="contain" />
              <Text numberOfLines={1} style={[styles.attachmentText, { color: colors.textMuted }]}>
                {attachment.name}
              </Text>
            </View>
          ) : (
            <View key={attachment.id} style={[styles.attachment, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="document-text-outline" size={16} color={colors.accent} />
              <Text numberOfLines={1} style={[styles.attachmentText, { color: colors.textMuted }]}>
                {attachment.name}
              </Text>
            </View>
          )
        )}

        {/* Tool Call Cards */}
        {message.toolCalls?.map((tool) => <ToolCard key={tool.id} call={tool} />)}

        {/* Message Content: Plain selectable text for user, Markdown for assistant */}
        {isUser ? (
          text ? (
            <Text selectable style={[styles.text, { color: colors.text, fontFamily: typography.body }]}>
              {text}
            </Text>
          ) : null
        ) : (
          <Markdown text={text} streaming={streaming} />
        )}

        {/* Action Toolbar */}
        {!streaming && text ? (
          <View style={[styles.toolbar, isUser && styles.toolbarUser]}>
            <AnimatedPressable accessibilityLabel="Copy message" onPress={copyText} style={styles.toolbarButton}>
              <Ionicons
                name={copied ? 'checkmark-circle-outline' : 'copy-outline'}
                size={16}
                color={copied ? colors.success : colors.textSubtle}
              />
            </AnimatedPressable>

            {!isUser ? (
              <>
                <AnimatedPressable
                  accessibilityLabel={speaking ? 'Stop reading' : 'Read aloud'}
                  onPress={toggleSpeech}
                  style={styles.toolbarButton}
                >
                  <Ionicons
                    name={speaking ? 'stop-circle-outline' : 'volume-medium-outline'}
                    size={18}
                    color={speaking ? colors.accent : colors.textSubtle}
                  />
                </AnimatedPressable>
                <AnimatedPressable accessibilityLabel="Helpful" onPress={() => { void rate('up'); }} style={styles.toolbarButton}>
                  <Ionicons
                    name={rating === 'up' ? 'thumbs-up' : 'thumbs-up-outline'}
                    size={16}
                    color={rating === 'up' ? colors.accent : colors.textSubtle}
                  />
                </AnimatedPressable>
                <AnimatedPressable accessibilityLabel="Not helpful" onPress={() => { void rate('down'); }} style={styles.toolbarButton}>
                  <Ionicons
                    name={rating === 'down' ? 'thumbs-down' : 'thumbs-down-outline'}
                    size={16}
                    color={rating === 'down' ? colors.accent : colors.textSubtle}
                  />
                </AnimatedPressable>
                {isLastAssistant && onRetry ? (
                  <AnimatedPressable accessibilityLabel={t('chat.retry') || 'Retry'} onPress={onRetry} style={styles.toolbarButton}>
                    <Ionicons name="refresh-outline" size={16} color={colors.textSubtle} />
                  </AnimatedPressable>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 4 },
  bubble: {},
  text: { fontSize: 16, lineHeight: 24 },
  reasoningCard: {
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  reasoningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reasoningTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reasoningLabel: {
    fontSize: 12,
  },
  reasoningContentWrap: {
    borderLeftWidth: 2,
    marginHorizontal: 12,
    marginBottom: 10,
    paddingLeft: 8,
    paddingVertical: 2,
  },
  reasoningText: {
    fontSize: 12,
    lineHeight: 18,
  },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    maxWidth: 240,
  },
  imageAttachment: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 6,
    marginBottom: 8,
    maxWidth: 260,
  },
  image: { width: 248, height: 170, borderRadius: 6, marginBottom: 4 },
  attachmentText: { fontSize: 12, fontWeight: '500' },
  toolbar: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    marginLeft: -4,
  },
  toolbarUser: {
    justifyContent: 'flex-end',
    marginLeft: 0,
    marginRight: -4,
    marginTop: 2,
  },
  toolbarButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
});
