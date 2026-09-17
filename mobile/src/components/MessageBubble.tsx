import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Message } from '@socrates/contracts';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { Markdown } from '../render/MarkdownView';
import { ToolCard } from './ToolCard';
import { AnimatedPressable } from './AnimatedPressable';
import { CanvasBlock } from './CanvasBlock';
import { messagesApi } from '../data/api/client';
import { setClipboardText } from '../native/clipboard';
import * as Speech from '../native/speech';

interface MessageBubbleProps {
  message: Message;
  isLastAssistant?: boolean;
  onRetry?: () => void;
  /** In-session find query — highlights matches like frontend findInSession. */
  highlight?: string;
  onIterate?: (text: string) => void;
}

type CanvasMessage = Message & {
  outputMode?: string | null;
  canvasId?: string | null;
  editedText?: string | null;
  _extensionLabel?: string | null;
};

function HighlightedPlainText({ text, highlightKey, style }: { text: string; highlightKey?: string; style?: object }) {
  const { colors } = useTheme();
  const q = (highlightKey || '').trim().toLowerCase();
  if (!q) return <Text selectable style={style}>{text}</Text>;
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let pos = 0;
  let k = 0;
  while (pos < text.length) {
    const found = lower.indexOf(q, pos);
    if (found === -1) {
      parts.push(<Text key={k++}>{text.slice(pos)}</Text>);
      break;
    }
    if (found > pos) parts.push(<Text key={k++}>{text.slice(pos, found)}</Text>);
    parts.push(
      <Text key={k++} style={{ backgroundColor: colors.accentSoft }}>{text.slice(found, found + q.length)}</Text>,
    );
    pos = found + q.length;
  }
  return <Text selectable style={style}>{parts}</Text>;
}

/* Streaming indicator: frontend `.thinking-spinner` is a 12–14px ring
 * rotating `ringSpin .9s` (`styles.css:3346-3359`). RN has no keyframes;
 * the same glyph spins via an Animated loop on the same timing. */
function StreamingIcon({ color }: { color: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }], width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          borderWidth: 1.5,
          borderColor: withAlpha(color, 0.18),
          borderTopColor: color,
        }}
      />
    </Animated.View>
  );
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  isLastAssistant = false,
  onRetry,
  highlight,
  onIterate,
}: MessageBubbleProps) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const isUser = message.role === 'user';
  const text = message.rawText || message.content || '';
  const canvasMessage = message as CanvasMessage;
  const isCanvas = !isUser && canvasMessage.outputMode === 'canvas' && Boolean(canvasMessage.canvasId);
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
            /* frontend `.msg.user .msg-body`:
             *   background: hsl(var(--bg-000)); border: none;
             *   border-radius: 24px (`styles.css:1881`);
             *   padding: 9px 18px; max-width: 90%;
             * The hairline border mobile drew has no web equivalent. */
            backgroundColor: isUser ? colors.surfaceRaised : 'transparent',
            borderColor: 'transparent',
            borderWidth: 0,
            borderRadius: isUser ? 24 : 0,
            paddingHorizontal: isUser ? 18 : 0,
            paddingVertical: isUser ? 9 : 0,
            maxWidth: isUser ? '90%' : '100%',
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
                {streaming ? (
                  <StreamingIcon color={colors.accent} />
                ) : (
                  <Ionicons
                    name="bulb-outline"
                    size={14}
                    color={colors.textMuted}
                  />
                )}
                <Text style={[styles.reasoningLabel, { color: colors.textSecondary, fontFamily: typography.medium }]}>
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
            <HighlightedPlainText
              text={text}
              highlightKey={highlight}
              style={[styles.text, { color: colors.text, fontFamily: typography.body }]}
            />
          ) : null
        ) : isCanvas ? (
          <CanvasBlock
            originalText={text}
            initialEditedText={canvasMessage.editedText}
            persistKey={canvasMessage.canvasId || canvasMessage.id || canvasMessage.clientId || undefined}
            label={canvasMessage._extensionLabel || undefined}
            onIterate={onIterate}
          />
        ) : (
          <Markdown text={text} streaming={streaming} highlight={highlight} />
        )}

        {/* Action Toolbar */}
        {!streaming && text && !isCanvas ? (
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
  /* frontend `.msg-list { gap: var(--chat-msg-gap) }` with
   * `--chat-msg-gap: 20px`; RN emulates the flex gap with symmetric
   * vertical margin on each row. */
  row: { flexDirection: 'row', marginVertical: 10 },
  bubble: {},
  /* frontend `.msg-body`: font-size 15px, line-height 1.625 (~24). */
  text: { fontSize: 15, lineHeight: 24 },
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
    marginHorizontal: 12,
    marginBottom: 10,
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
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
    maxWidth: 200,
  },
  imageAttachment: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 6,
    marginBottom: 8,
    maxWidth: 260,
  },
  image: { width: 248, height: 170, borderRadius: 10, marginBottom: 4 },
  attachmentText: { fontSize: 12, fontWeight: '500' },
  /* frontend `.msg-toolbar`: height 28px, gap 2px, margin-top 2px,
   * margin-left 2px (assistant) / justify-content flex-end (user). */
  toolbar: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
    marginLeft: 2,
  },
  toolbarUser: {
    justifyContent: 'flex-end',
    marginLeft: 0,
    marginRight: 0,
    marginTop: 2,
  },
  /* frontend `.msg-toolbar-btn`: 28x28, border-radius 8px. */
  toolbarButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
});
