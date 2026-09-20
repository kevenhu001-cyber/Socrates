import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import type { Message } from '@socrates/contracts';
import { useTheme } from '../theme/ThemeProvider';
import { motionEasing, withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { Markdown, type TutorPracticeAnswer, type TutorQuizAnswer } from '../render/MarkdownView';
import { ToolCard } from './ToolCard';
import { ToolRunGroup } from './ToolRunGroup';
import { buildTurnLayout, sortableToolCalls } from '../data/tools/turnLayout';
import { AnimatedPressable } from './AnimatedPressable';
import { AttachmentChip } from './AttachmentChip';
import { Sheet } from './Sheet';
import { CanvasBlock } from './CanvasBlock';
import { setClipboardText } from '../native/clipboard';
import * as Speech from '../native/speech';
import { native } from '../native/native';
import type { LinkPreviewState } from '../data/chat/webLinks';

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
  onTutorQuizAnswer?: (answer: TutorQuizAnswer) => void | Promise<void>;
  onTutorPracticeSubmit?: (answer: TutorPracticeAnswer) => void | Promise<void>;
  linkPreview?: LinkPreviewState;
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

function LinkPreviewCards({ preview }: { preview: LinkPreviewState }) {
  const { colors, typography, fontScale } = useTheme();
  const t = useT();
  if (preview.noUrlHint) {
    return (
      <View style={styles.linkPreviews}>
        <View style={[
          styles.linkCard,
          {
            backgroundColor: colors.mode === 'dark' ? withAlpha(colors.danger, 0.12) : withAlpha(colors.danger, 0.06),
            borderColor: withAlpha(colors.danger, colors.mode === 'dark' ? 0.4 : 0.28),
          },
        ]}>
          <View style={styles.linkCardHead}>
            <View style={styles.linkHostWrap}>
              <Ionicons name="link-outline" size={14} color={colors.textMuted} />
              <Text numberOfLines={1} style={[styles.linkHost, { color: colors.textMuted, fontFamily: typography.semibold, fontSize: 11 * fontScale }]}>
                {t('chat.linkNoUrl')}
              </Text>
            </View>
            <Text style={[styles.linkStatus, { color: colors.danger, fontSize: 10.5 * fontScale }]}>
              {t('chat.linkAwaitingFull')}
            </Text>
          </View>
          <Text style={[styles.linkExcerpt, { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11.5 * fontScale }]}>
            {t('chat.linkNoUrlBody')}
          </Text>
        </View>
      </View>
    );
  }

  if (!preview.urls.length) return null;
  return (
    <View style={styles.linkPreviews}>
      {preview.urls.map((url, index) => {
        const fetched = preview.results[index];
        let host = url;
        try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep URL */ }
        const ok = fetched?.ok === true;
        const title = fetched?.title || url;
        const excerpt = fetched?.content
          ? (fetched.content.length > 220 ? `${fetched.content.slice(0, 217)}…` : fetched.content)
          : '';
        const status = ok
          ? (fetched.truncated ? `excerpt · ${fetched.chars || 0} chars` : `full · ${fetched.chars || 0} chars`)
          : (fetched?.reason || 'fetch failed');
        return (
          <View
            key={url}
            style={[
              styles.linkCard,
              {
                backgroundColor: ok
                  ? colors.surface
                  : colors.mode === 'dark'
                    ? withAlpha(colors.danger, 0.12)
                    : withAlpha(colors.danger, 0.06),
                borderColor: ok
                  ? withAlpha(colors.border, 0.4)
                  : withAlpha(colors.danger, colors.mode === 'dark' ? 0.4 : 0.28),
              },
            ]}
          >
            <View style={styles.linkCardHead}>
              <View style={styles.linkHostWrap}>
                <Ionicons name="link-outline" size={14} color={colors.textMuted} />
                <Text numberOfLines={1} style={[styles.linkHost, { color: colors.textMuted, fontFamily: typography.semibold, fontSize: 11 * fontScale }]}>
                  {host}
                </Text>
              </View>
              <Text numberOfLines={1} style={[styles.linkStatus, { color: ok ? colors.textMuted : colors.danger, fontSize: 10.5 * fontScale }]}>
                {status}
              </Text>
            </View>
            <Text
              numberOfLines={2}
              onPress={() => { void native.openBrowser(url); }}
              style={[styles.linkTitle, { color: colors.accent, fontFamily: typography.medium, fontSize: 13 * fontScale }]}
            >
              {title}
            </Text>
            {excerpt ? (
              <Text numberOfLines={2} style={[styles.linkExcerpt, { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11.5 * fontScale }]}>
                {excerpt}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

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
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    );
    /* web `.thinking` pulses the spinner's center dot while it rotates. */
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    animation.start();
    pulseLoop.start();
    return () => {
      animation.stop();
      pulseLoop.stop();
    };
  }, [pulse, spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
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
      <Animated.View
        style={{
          position: 'absolute',
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: color,
          opacity: pulse,
        }}
      />
    </View>
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
        easing: motionEasing.out,
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
          hitSlop={8}
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
        <Animated.View style={[styles.thinkingBackdrop, { backgroundColor: withAlpha(colors.black, 0.55), opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('chat.closeThinking')} />
        </Animated.View>
      ) : (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdrop }]}>
          <BlurView tint="dark" intensity={18} style={StyleSheet.absoluteFill}>
            <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(colors.black, 0.55) }]} onPress={onClose} accessibilityLabel={t('chat.closeThinking')} />
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
  onTutorQuizAnswer,
  onTutorPracticeSubmit,
  linkPreview,
  highlight,
  onIterate,
}: MessageBubbleProps) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const { width: windowWidth } = useWindowDimensions();
  const isUser = message.role === 'user';
  const text = message.rawText || message.content || '';
  const messageId = String(message.id || message.clientId || '');
  const canvasMessage = message as CanvasMessage;
  const isCanvas = !isUser && canvasMessage.outputMode === 'canvas' && Boolean(canvasMessage.canvasId);
  const streaming = message.type === 'streaming';
  /* Rating is persisted on the message (onFeedback → appStore) so it
   * survives virtualization recycling and reloads; local useState would be
   * wiped whenever the row unmounts. */
  const rating = message.feedback ?? 'none';
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const speakingRef = useRef(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [thinkingPanelOpen, setThinkingPanelOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(text);
  const speakPulse = useRef(new Animated.Value(0.6)).current;
  /* web `.msg { animation: msgIn .22s }` — one-shot fade-in on mount,
   * assistant rows only. */
  const enterOpacity = useRef(new Animated.Value(isUser ? 1 : 0.45)).current;

  /* Only stop playback on unmount if THIS row owns it — virtualization
   * recycles sibling rows and a bare Speech.stop() would kill another
   * message's read-aloud. */
  useEffect(() => () => {
    if (speakingRef.current) {
      speakingRef.current = false;
      void Speech.stop();
    }
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);
  useEffect(() => {
    if (isUser) return;
    Animated.timing(enterOpacity, {
      toValue: 1,
      duration: 220,
      easing: motionEasing.out,
      useNativeDriver: true,
    }).start();
  }, [enterOpacity, isUser]);
  useEffect(() => {
    if (!speaking) {
      speakPulse.setValue(0.6);
      return;
    }
    /* web `.msg-toolbar-btn.is-speaking`: 1.4s breathing pulse while TTS plays. */
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(speakPulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(speakPulse, { toValue: 0.6, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [speakPulse, speaking]);

  const rate = async (next: 'up' | 'down') => {
    const value = rating === next ? 'none' : next;
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
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setCopied(true);
    copyTimerRef.current = setTimeout(() => {
      copyTimerRef.current = null;
      setCopied(false);
    }, 2000);
  };

  const toggleSpeech = async () => {
    if (speaking) {
      speakingRef.current = false;
      await Speech.stop();
      setSpeaking(false);
      return;
    }
    speakingRef.current = true;
    setSpeaking(true);
    Speech.speak(text, {
      /* Guard every callback: an unmounted/recycled row must not set state,
       * and a stale callback must not clear a newer playback's flag. */
      onDone: () => { if (speakingRef.current) { speakingRef.current = false; setSpeaking(false); } },
      onStopped: () => { if (speakingRef.current) { speakingRef.current = false; setSpeaking(false); } },
      onError: () => { if (speakingRef.current) { speakingRef.current = false; setSpeaking(false); } },
    });
  };

  if (!streaming && !text && !message.toolCalls?.length && !message.attachments?.length) {
    return null;
  }

  const hasAttachments = Boolean(message.attachments?.length);
  /* Toolbar visibility mirrors the SPA: non-last assistant rows keep their
   * actions but at 0.7 opacity; last-assistant and user rows show full. */
  const toolbarOpacity = !isUser && !isLastAssistant ? 0.7 : 1;

  /* P_declarative-tool-run — same interleaving model as the web turn
   * renderer (toolRunModel.buildTurnLayout): tool calls carrying a
   * `textOffset` seat inline between the prose segments they split, and
   * consecutive calls fold into one collapsible ToolRunGroup. Calls without
   * an offset (sessions persisted before textOffset existed, or offsets
   * outside the text) keep the legacy above-the-prose placement rather than
   * disappearing entirely. */
  const turnSegments = !isUser && !isCanvas
    ? buildTurnLayout(text, message.toolCalls, { deferOpenParagraph: streaming })
    : [];
  const seatedIds = new Set(
    sortableToolCalls(text, message.toolCalls).map((call) => call.id),
  );
  const unseatedCalls = (message.toolCalls || []).filter((call) => !seatedIds.has(call.id));

  return (
    <View style={[styles.row, { alignItems: isUser ? 'flex-end' : 'flex-start' }]}>
      {/* `.msg-attachment-chips` sits on the page background ABOVE the
       * bubble (not inside it), right-aligned for user rows. */}
      {hasAttachments ? (
        <View style={[styles.attachments, isUser && styles.attachmentsUser]}>
          {message.attachments?.map((attachment) =>
            attachment.kind === 'image' && attachment.dataUrl ? (
              <View key={attachment.id} style={[styles.imageAttachment, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Image accessibilityLabel={attachment.name} source={{ uri: attachment.dataUrl }} style={styles.image} resizeMode="contain" />
                <Text numberOfLines={1} style={[styles.attachmentText, { color: colors.textMuted }]}>
                  {attachment.name}
                </Text>
              </View>
            ) : (
              <AttachmentChip key={attachment.id} attachment={attachment} />
            )
          )}
        </View>
      ) : null}
      <Animated.View
        style={[
          styles.bubble,
          {
            opacity: isUser ? 1 : enterOpacity,
            /* Final authority is chat-surface.css (loaded after the older
             * stylesheets): user bubbles are 15px radius, 11x16 padding,
             * filled with `--conversation-user` (#2c2c2c dark / #e9e9e9
             * light — `colors.userBubble`, not `surfaceRaised`), and capped
             * at `min(86%, 620px)` of the conversation width. */
            backgroundColor: isUser ? colors.userBubble : 'transparent',
            borderColor: 'transparent',
            borderWidth: 0,
            /* Web phone bumps the user bubble to radius 22
             * (mobile-parity.css:301-308); desktop/tablet keeps 15. */
            borderRadius: isUser ? (editing ? 20 : windowWidth <= 768 ? 22 : 15) : 0,
            paddingHorizontal: isUser ? 16 : 0,
            paddingVertical: isUser ? 11 : 0,
            maxWidth: isUser && !editing ? Math.min(windowWidth * 0.86, 620) : '100%',
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

        {/* Tool calls that never got a seat in the text (no valid
         * textOffset) keep the pre-grouping placement above the prose. */}
        {unseatedCalls.map((tool) => <ToolCard key={tool.id} call={tool} />)}

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
        ) : turnSegments.length ? (
          /* Interleaved turn: prose segments and tool runs in fire order.
           * Each prose piece is its own Markdown block so a tool row can
           * sit between the paragraphs it occurred between (web parity). */
          <View>
            {turnSegments.map((segment, index) => {
              if (segment.kind === 'text') {
                return (
                  <Markdown
                    key={`seg-${segment.start}`}
                    text={segment.text}
                    streaming={streaming}
                    highlight={highlight}
                    onQuizAnswer={onTutorQuizAnswer}
                    onPracticeSubmit={onTutorPracticeSubmit}
                  />
                );
              }
              if (segment.kind === 'tool') {
                return <ToolCard key={segment.call.id} call={segment.call} />;
              }
              return <ToolRunGroup key={`group-${index}`} segment={segment} />;
            })}
          </View>
        ) : (
          <Markdown
            text={text}
            streaming={streaming}
            highlight={highlight}
            onQuizAnswer={onTutorQuizAnswer}
            onPracticeSubmit={onTutorPracticeSubmit}
          />
        )}
        {isUser && linkPreview ? <LinkPreviewCards preview={linkPreview} /> : null}


        {/* Action Toolbar — rendered as a sibling of the bubble below (see
         * `styles.row`), so the user row no longer inflates the grey
         * bubble. Attachment-only user messages still get the toolbar. */}
      </Animated.View>
      {!streaming && (text || hasAttachments) && !isCanvas ? (
        <View style={[styles.toolbar, isUser && styles.toolbarUser, { opacity: toolbarOpacity }]}>
          <AnimatedPressable hitSlop={6} accessibilityLabel={t('common.copy')} onPress={copyText} style={styles.toolbarButton}>
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
                  hitSlop={6}
                  accessibilityLabel={t('chat.editMessage')}
                  onPress={() => { setEditValue(text); setEditing(true); }}
                  style={styles.toolbarButton}
                >
                  <Ionicons name="pencil-outline" size={16} color={colors.textSubtle} />
                </AnimatedPressable>
              ) : null}
              {messageId && onDelete ? (
                <AnimatedPressable
                  hitSlop={6}
                  accessibilityLabel={t('chat.deleteMessage')}
                  onPress={() => { void Promise.resolve(onDelete(messageId)); }}
                  style={styles.toolbarButton}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.textSubtle} />
                </AnimatedPressable>
              ) : null}
            </>
          ) : (
            <>
              {/* Five primaries: copy (above), thumbs, read-aloud,
               * regenerate/retry — everything else folds into the overflow
               * sheet (ChatGPT mobile parity; eight 28px icons at 2px gaps
               * were untappable on a 390pt phone). */}
              <AnimatedPressable hitSlop={6} accessibilityLabel={t('chat.helpful')} onPress={() => { void rate('up'); }} style={styles.toolbarButton}>
                <Ionicons name={rating === 'up' ? 'thumbs-up' : 'thumbs-up-outline'} size={16} color={rating === 'up' ? colors.accent : colors.textSubtle} />
              </AnimatedPressable>
              <AnimatedPressable hitSlop={6} accessibilityLabel={t('chat.notHelpful')} onPress={() => { void rate('down'); }} style={styles.toolbarButton}>
                <Ionicons name={rating === 'down' ? 'thumbs-down' : 'thumbs-down-outline'} size={16} color={rating === 'down' ? colors.accent : colors.textSubtle} />
              </AnimatedPressable>
              <AnimatedPressable
                hitSlop={6}
                accessibilityLabel={speaking ? t('chat.stopReading') : t('chat.readAloud')}
                onPress={toggleSpeech}
                style={[
                  styles.toolbarButton,
                  speaking ? { backgroundColor: colors.accent, opacity: speakPulse } : null,
                ]}
              >
                <Ionicons name={speaking ? 'stop-circle-outline' : 'volume-medium-outline'} size={16} color={speaking ? colors.textInverse : colors.textSubtle} />
              </AnimatedPressable>
              {messageId && onRegenerate ? (
                <AnimatedPressable hitSlop={6} accessibilityLabel={t('chat.regenerateResponse')} onPress={() => { void Promise.resolve(onRegenerate(messageId)); }} style={styles.toolbarButton}>
                  <Ionicons name="refresh-outline" size={16} color={colors.textSubtle} />
                </AnimatedPressable>
              ) : isLastAssistant && onRetry ? (
                <AnimatedPressable hitSlop={6} accessibilityLabel={t('chat.retry') || 'Retry'} onPress={onRetry} style={styles.toolbarButton}>
                  <Ionicons name="refresh-outline" size={16} color={colors.textSubtle} />
                </AnimatedPressable>
              ) : null}
              {onShare || (messageId && onBranch) ? (
                <AnimatedPressable hitSlop={6} accessibilityLabel={t('common.more')} onPress={() => setActionsOpen(true)} style={styles.toolbarButton}>
                  <Ionicons name="ellipsis-horizontal" size={16} color={colors.textSubtle} />
                </AnimatedPressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}
      <Sheet visible={actionsOpen} onClose={() => setActionsOpen(false)} maxWidth={420}>
        {onShare ? (
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => { setActionsOpen(false); void Promise.resolve(onShare()); }}
            style={styles.sheetRow}
          >
            <Ionicons name="share-outline" size={17} color={colors.textSecondary} />
            <Text style={[styles.sheetRowLabel, { color: colors.text, fontFamily: typography.body }]}>
              {t('chat.shareConversation')}
            </Text>
          </AnimatedPressable>
        ) : null}
        {messageId && onBranch ? (
          <>
            <AnimatedPressable
              accessibilityRole="button"
              onPress={() => { setActionsOpen(false); void Promise.resolve(onBranch(messageId)); }}
              style={styles.sheetRow}
            >
              <Ionicons name="git-branch-outline" size={17} color={colors.textSecondary} />
              <Text style={[styles.sheetRowLabel, { color: colors.text, fontFamily: typography.body }]}>
                {t('chat.branchFromHere')}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              accessibilityRole="button"
              onPress={() => { setActionsOpen(false); void Promise.resolve(onBranch(messageId, { reExplain: true })); }}
              style={styles.sheetRow}
            >
              <Ionicons name="bulb-outline" size={17} color={colors.textSecondary} />
              <Text style={[styles.sheetRowLabel, { color: colors.text, fontFamily: typography.body }]}>
                {t('chat.reExplain')}
              </Text>
            </AnimatedPressable>
          </>
        ) : null}
      </Sheet>
    </View>
  );
});

const styles = StyleSheet.create({
  /* frontend `.msg-list { gap: 12px }` plus `.msg { padding: 6px }` gives
   * ~24px between rows; column direction stacks the page-background
   * attachment chips above the bubble. */
  row: { flexDirection: 'column', marginVertical: 6, paddingVertical: 6 },
  bubble: {},
  /* `.msg-attachment-chips`: lives on the page background above the bubble. */
  attachments: {
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
    alignSelf: 'stretch',
  },
  attachmentsUser: {
    alignItems: 'flex-end',
  },
  /* frontend `.msg-body`: font-size 15px, line-height 1.625 (~24). */
  text: { fontSize: 15, lineHeight: 24 },
  /* frontend `.msg-edit-area`: borderless transparent textarea, min-height
   * ~60px; the surrounding bubble takes radius 20 / maxWidth 100%. */
  editArea: {
    width: '100%',
    minHeight: 60,
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
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
  imageAttachment: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 6,
    marginBottom: 8,
    maxWidth: 260,
  },
  image: { width: 248, height: 170, borderRadius: 10, marginBottom: 4 },
  attachmentText: { fontSize: 12, fontWeight: '500' },
  linkPreviews: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'flex-end',
    gap: 6,
    marginTop: 10,
  },
  linkCard: {
    width: '100%',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  linkCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  linkHostWrap: {
    maxWidth: '60%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  linkHost: { flexShrink: 1, letterSpacing: -0.1 },
  linkStatus: { flexShrink: 1, textAlign: 'right' },
  linkTitle: { lineHeight: 18 },
  linkExcerpt: { lineHeight: 17, marginTop: 2 },
  /* frontend `.msg-toolbar`: margin-top 2px, margin-left 2px (assistant) /
   * justify-content flex-end (user). Buttons grew to 34px with a 4px gap
   * and 6px hitSlop to reach a usable touch target on phones. */
  toolbar: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    marginLeft: 2,
  },
  toolbarUser: {
    justifyContent: 'flex-end',
    marginLeft: 0,
    marginRight: 0,
    marginTop: 2,
  },
  /* frontend `.msg-toolbar-btn` was 28x28, border-radius 8px; bumped to
   * 34x34 plus hitSlop for the 44pt accessibility floor. */
  toolbarButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  sheetRowLabel: {
    fontSize: 15,
  },
});
