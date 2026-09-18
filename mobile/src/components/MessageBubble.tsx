import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import type { Message } from '@socrates/contracts';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { Markdown } from '../render/MarkdownView';
import { ToolCard } from './ToolCard';
import { AnimatedPressable } from './AnimatedPressable';
import { CanvasBlock } from './CanvasBlock';
import { setClipboardText } from '../native/clipboard';
import * as Speech from '../native/speech';

interface MessageBubbleProps {
  message: Message;
  isLastAssistant?: boolean;
  onRetry?: () => void;
  onEdit?: (messageId: string, text: string) => unknown | Promise<unknown>;
  onDelete?: (messageId: string) => unknown | Promise<unknown>;
  onShare?: () => unknown | Promise<unknown>;
  onRegenerate?: (messageId: string) => unknown | Promise<unknown>;
  onBranch?: (messageId: string, options?: { reExplain?: boolean }) => unknown | Promise<unknown>;
  onFeedback?: (messageId: string, rating: 'up' | 'down' | 'none') => unknown | Promise<unknown>;
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

function ThinkingLiveDot({ color }: { color: string }) {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);
  return <Animated.View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color, opacity }} />;
}

function ThinkingPanel({
  visible,
  text,
  streaming,
  onClose,
}: {
  visible: boolean;
  text: string;
  streaming: boolean;
  onClose: () => void;
}) {
  const { colors, typography, fontScale } = useTheme();
  const t = useT();
  const { width } = useWindowDimensions();
  const mobile = width <= 768;
  const progress = useRef(new Animated.Value(0)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    progress.setValue(0);
    backdrop.setValue(0);
    const animation = Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 160, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(progress, {
        toValue: 1,
        duration: mobile ? 280 : 240,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [backdrop, mobile, progress, visible]);

  if (!visible) return null;

  const translate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: mobile ? [42, 0] : [30, 0],
  });
  const panelOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const title = t('think.panelTitle') === 'think.panelTitle' ? 'Thought process' : t('think.panelTitle');
  const empty = t('think.panelEmpty') === 'think.panelEmpty'
    ? 'The model has not started thinking yet.'
    : t('think.panelEmpty');
  const count = text.length;
  const countLabel = count === 1
    ? (t('think.wordCountOne') === 'think.wordCountOne' ? '1 word' : t('think.wordCountOne'))
    : (t('think.wordCount') === 'think.wordCount' ? '{n} words' : t('think.wordCount')).replace('{n}', String(count));

  const panel = (
    <Animated.View
      style={[
        styles.thinkingPanel,
        mobile ? styles.thinkingPanelMobile : styles.thinkingPanelDesktop,
        {
          backgroundColor: colors.background,
          borderColor: withAlpha(colors.border, 0.28),
          opacity: panelOpacity,
          transform: [mobile ? { translateY: translate } : { translateX: translate }],
        },
      ]}
    >
      <View style={[styles.thinkingPanelHead, { borderBottomColor: withAlpha(colors.border, 0.18) }]}>
        <View style={styles.thinkingPanelHeading}>
          <Text
            style={[
              styles.thinkingPanelTitle,
              { color: colors.text, fontFamily: typography.semibold, fontSize: 14 * fontScale },
            ]}
          >
            {title}
          </Text>
          {streaming ? <ThinkingLiveDot color={withAlpha(colors.accent, 0.85)} /> : null}
        </View>
        <Text style={[styles.thinkingPanelMeta, { color: colors.textSubtle, fontSize: 11 * fontScale }]}>
          {countLabel}
        </Text>
        <AnimatedPressable
          accessibilityLabel={t('think.closePanel') === 'think.closePanel' ? 'Close thinking panel' : t('think.closePanel')}
          onPress={onClose}
          style={styles.thinkingPanelClose}
        >
          <Ionicons name="close" size={15} color={colors.textMuted} />
        </AnimatedPressable>
      </View>
      <ScrollView
        style={styles.thinkingPanelBody}
        contentContainerStyle={styles.thinkingPanelBodyContent}
        showsVerticalScrollIndicator
      >
        {text ? (
          <Markdown text={text} streaming={streaming} />
        ) : (
          <Text
            style={[
              styles.thinkingPanelEmpty,
              { color: colors.textSubtle, fontFamily: typography.body, fontSize: 12.5 * fontScale },
            ]}
          >
            {empty}
          </Text>
        )}
      </ScrollView>
    </Animated.View>
  );

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {mobile ? (
        <Animated.View style={[styles.thinkingBackdrop, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close thinking panel" />
        </Animated.View>
      ) : (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdrop }]}>
          <BlurView tint="dark" intensity={18} style={StyleSheet.absoluteFill}>
            <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={onClose} accessibilityLabel="Close thinking panel" />
          </BlurView>
        </Animated.View>
      )}
      {panel}
    </Modal>
  );
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  isLastAssistant = false,
  onRetry,
  onEdit,
  onDelete,
  onShare,
  onRegenerate,
  onBranch,
  onFeedback,
  highlight,
  onIterate,
}: MessageBubbleProps) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const isUser = message.role === 'user';
  const text = message.rawText || message.content || '';
  const messageId = String(message.id || message.clientId || '');
  const canvasMessage = message as CanvasMessage;
  const isCanvas = !isUser && canvasMessage.outputMode === 'canvas' && Boolean(canvasMessage.canvasId);
  const streaming = message.type === 'streaming';
  const [rating, setRating] = useState<'up' | 'down' | 'none'>('none');
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [thinkingPanelOpen, setThinkingPanelOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(text);

  useEffect(() => () => { void Speech.stop(); }, []);
  useEffect(() => {
    if (!editing) setEditValue(text);
  }, [editing, text]);

  const rate = async (next: 'up' | 'down') => {
    const value = rating === next ? 'none' : next;
    setRating(value);
    if (messageId && onFeedback) {
      await Promise.resolve(onFeedback(messageId, value)).catch((err) => {
        console.warn('[MessageBubble] Failed to submit feedback:', err);
      });
    }
  };

  const commitEdit = async () => {
    if (!editing) return;
    setEditing(false);
    const next = editValue.trim();
    if (!messageId || !next || next === text.trim() || !onEdit) {
      setEditValue(text);
      return;
    }
    await Promise.resolve(onEdit(messageId, next)).catch((err) => {
      console.warn('[MessageBubble] Failed to edit message:', err);
      setEditValue(text);
    });
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

  if (!streaming && !text && !message.toolCalls?.length && !message.attachments?.length) {
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
        {/* Current SPA parity: reasoning is a live clickable status only.
            The full trace lives in the responsive ThinkingPanel. The pill
            disappears when streaming settles, while an already-open panel
            stays visible with the completed trace. */}
        {!isUser && streaming ? (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={t('think.thinking') || 'Thinking…'}
            onPress={() => setThinkingPanelOpen(true)}
            style={styles.thinkingStatus}
          >
            <StreamingIcon color={colors.textSecondary} />
            <Text style={[styles.thinkingStatusText, { color: colors.textSecondary, fontFamily: typography.body }]}>
              {t('think.thinking') || 'Thinking…'}
            </Text>
          </AnimatedPressable>
        ) : null}
        {!isUser ? (
          <ThinkingPanel
            visible={thinkingPanelOpen}
            text={message.reasoningContent || ''}
            streaming={streaming}
            onClose={() => setThinkingPanelOpen(false)}
          />
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
          editing ? (
            <TextInput
              autoFocus
              multiline
              value={editValue}
              onChangeText={setEditValue}
              onBlur={() => { void commitEdit(); }}
              selectionColor={colors.accent}
              style={[
                styles.editArea,
                {
                  color: colors.text,
                  borderColor: withAlpha(colors.border, 0.35),
                  backgroundColor: 'transparent',
                  fontFamily: typography.body,
                },
              ]}
            />
          ) : text ? (
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

        {/* Action Toolbar — same action set/order as SPA MessageToolbar. */}
        {!streaming && text && !isCanvas ? (
          <View style={[styles.toolbar, isUser && styles.toolbarUser]}>
            <AnimatedPressable accessibilityLabel="Copy" onPress={copyText} style={styles.toolbarButton}>
              <Ionicons
                name={copied ? 'checkmark-circle-outline' : 'copy-outline'}
                size={16}
                color={copied ? colors.success : colors.textSubtle}
              />
            </AnimatedPressable>

            {isUser ? (
              <>
                {messageId && onEdit ? (
                  <AnimatedPressable
                    accessibilityLabel="Edit message"
                    onPress={() => { setEditValue(text); setEditing(true); }}
                    style={styles.toolbarButton}
                  >
                    <Ionicons name="pencil-outline" size={16} color={colors.textSubtle} />
                  </AnimatedPressable>
                ) : null}
                {messageId && onDelete ? (
                  <AnimatedPressable
                    accessibilityLabel="Delete message"
                    onPress={() => { void Promise.resolve(onDelete(messageId)); }}
                    style={styles.toolbarButton}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.textSubtle} />
                  </AnimatedPressable>
                ) : null}
              </>
            ) : (
              <>
                {onShare ? (
                  <AnimatedPressable accessibilityLabel="Share conversation" onPress={() => { void Promise.resolve(onShare()); }} style={styles.toolbarButton}>
                    <Ionicons name="share-outline" size={16} color={colors.textSubtle} />
                  </AnimatedPressable>
                ) : null}
                {messageId && onRegenerate ? (
                  <AnimatedPressable accessibilityLabel="Regenerate response" onPress={() => { void Promise.resolve(onRegenerate(messageId)); }} style={styles.toolbarButton}>
                    <Ionicons name="refresh-outline" size={16} color={colors.textSubtle} />
                  </AnimatedPressable>
                ) : isLastAssistant && onRetry ? (
                  <AnimatedPressable accessibilityLabel={t('chat.retry') || 'Retry'} onPress={onRetry} style={styles.toolbarButton}>
                    <Ionicons name="refresh-outline" size={16} color={colors.textSubtle} />
                  </AnimatedPressable>
                ) : null}
                <AnimatedPressable accessibilityLabel="Helpful" onPress={() => { void rate('up'); }} style={styles.toolbarButton}>
                  <Ionicons name={rating === 'up' ? 'thumbs-up' : 'thumbs-up-outline'} size={16} color={rating === 'up' ? colors.accent : colors.textSubtle} />
                </AnimatedPressable>
                <AnimatedPressable accessibilityLabel="Not helpful" onPress={() => { void rate('down'); }} style={styles.toolbarButton}>
                  <Ionicons name={rating === 'down' ? 'thumbs-down' : 'thumbs-down-outline'} size={16} color={rating === 'down' ? colors.accent : colors.textSubtle} />
                </AnimatedPressable>
                {messageId && onBranch ? (
                  <>
                    <AnimatedPressable accessibilityLabel="Branch from here" onPress={() => { void Promise.resolve(onBranch(messageId)); }} style={styles.toolbarButton}>
                      <Ionicons name="git-branch-outline" size={16} color={colors.textSubtle} />
                    </AnimatedPressable>
                    <AnimatedPressable accessibilityLabel="Re-explain from a different angle" onPress={() => { void Promise.resolve(onBranch(messageId, { reExplain: true })); }} style={styles.toolbarButton}>
                      <Ionicons name="bulb-outline" size={16} color={colors.textSubtle} />
                    </AnimatedPressable>
                  </>
                ) : null}
                <AnimatedPressable
                  accessibilityLabel={speaking ? 'Stop reading' : 'Read aloud'}
                  onPress={toggleSpeech}
                  style={styles.toolbarButton}
                >
                  <Ionicons name={speaking ? 'stop-circle-outline' : 'volume-medium-outline'} size={18} color={speaking ? colors.accent : colors.textSubtle} />
                </AnimatedPressable>
              </>
            )}
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
  editArea: {
    minWidth: 180,
    maxWidth: 520,
    minHeight: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 15,
    lineHeight: 24,
  },
  thinkingStatus: {
    alignSelf: 'flex-start',
    minHeight: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 7,
    marginBottom: 4,
  },
  thinkingStatusText: {
    fontSize: 13,
    lineHeight: 17,
  },
  thinkingBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  thinkingPanel: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
  },
  thinkingPanelMobile: {
    left: 0,
    right: 0,
    bottom: 0,
    height: '40%',
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    shadowOffset: { width: 0, height: -18 },
    shadowOpacity: 0.5,
    shadowRadius: 50,
    elevation: 24,
  },
  thinkingPanelDesktop: {
    top: 0,
    right: 0,
    bottom: 0,
    width: '90%',
    maxWidth: 420,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    shadowOffset: { width: -18, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 50,
    elevation: 24,
  },
  thinkingPanelHead: {
    minHeight: 57,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thinkingPanelHeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  thinkingPanelTitle: { fontWeight: '600' },
  thinkingPanelMeta: { flexShrink: 0 },
  thinkingPanelClose: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thinkingPanelBody: { flex: 1 },
  thinkingPanelBodyContent: {
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  thinkingPanelEmpty: { lineHeight: 20 },
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
