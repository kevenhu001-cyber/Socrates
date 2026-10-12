import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Message } from '@socrates/contracts';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { MessageBubble } from '../components/MessageBubble';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { useAppStore } from '../stores/appStore';

type BubbleProps = React.ComponentProps<typeof MessageBubble>;

type ChatTranscriptProps = {
  searchActive: boolean;
  searchQuery: string;
  searchMatchIndex: number;
  setSearchActive: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setSearchMatchIndex: React.Dispatch<React.SetStateAction<number>>;
  stickToBottom: React.MutableRefObject<boolean>;
  animateNextMessage: React.MutableRefObject<boolean>;
  bubbleShare?: BubbleProps['onShare'];
  onRetry?: BubbleProps['onRetry'];
  onEdit?: BubbleProps['onEdit'];
  onDelete?: BubbleProps['onDelete'];
  onRegenerate?: BubbleProps['onRegenerate'];
  onBranch?: BubbleProps['onBranch'];
  onFeedback?: BubbleProps['onFeedback'];
  onTutorQuizAnswer?: BubbleProps['onTutorQuizAnswer'];
  onTutorPracticeSubmit?: BubbleProps['onTutorPracticeSubmit'];
  onIterate?: BubbleProps['onIterate'];
};

const EMPTY_MESSAGES: Message[] = [];
const EMPTY_KEYS: ReadonlySet<string> = new Set();
const BOTTOM_TOLERANCE = 64;

function EmptyMessageList() {
  return <View style={styles.empty} />;
}

function messageKey(message: Message, index: number): string {
  return String(message.clientId || message.id || index);
}

/**
 * The transcript owns the high-frequency messages subscription. ChatScreen
 * remains subscribed only to screen chrome and Composer state, so every visual
 * playback frame cannot reconcile the header, modals, banners and dock.
 */
export const ChatTranscript = React.memo(function ChatTranscript({
  searchActive,
  searchQuery,
  searchMatchIndex,
  setSearchActive,
  setSearchQuery,
  setSearchMatchIndex,
  stickToBottom,
  animateNextMessage,
  bubbleShare,
  onRetry,
  onEdit,
  onDelete,
  onRegenerate,
  onBranch,
  onFeedback,
  onTutorQuizAnswer,
  onTutorPracticeSubmit,
  onIterate,
}: ChatTranscriptProps) {
  const { colors, spacing, typography } = useTheme();
  const t = useT();
  const messages = useAppStore((state) => state.activeSession?.messages ?? EMPTY_MESSAGES);
  const linkPreviews = useAppStore((state) => state.linkPreviews);
  const listRef = useRef<FlatList<Message>>(null);
  const anchorFrame = useRef<number | null>(null);
  const pendingAnchorAnimated = useRef(false);
  const knownMessageIds = useRef(new Set(messages.map(messageKey)));
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const scrollBottomOffset = 12;

  const matchingIndices = useMemo(() => {
    if (!searchActive || !searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const indices: number[] = [];
    messages.forEach((message, index) => {
      const text = String(message.rawText || message.content || '').toLowerCase();
      if (text.includes(query)) indices.push(index);
    });
    return indices;
  }, [messages, searchActive, searchQuery]);

  const lastAssistantIndex = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'assistant') return index;
    }
    return -1;
  }, [messages]);

  const animatingMessageIds = useMemo(() => {
    if (!animateNextMessage.current) return EMPTY_KEYS;
    const index = messages.findIndex((message, position) => !knownMessageIds.current.has(messageKey(message, position)));
    return index < 0 ? EMPTY_KEYS : new Set([messageKey(messages[index], index)]);
  }, [animateNextMessage, messages]);

  useEffect(() => {
    messages.forEach((message, index) => knownMessageIds.current.add(messageKey(message, index)));
    if (animatingMessageIds.size) animateNextMessage.current = false;
  }, [animateNextMessage, animatingMessageIds, messages]);

  /* Layout, content-size and keyboard events share a single rAF anchor. WebView
   * height messages and adjustResize no longer enqueue independent scrollToEnd
   * calls for the same frame. The composer remains owned by KeyboardStickyView. */
  const scheduleBottomAnchor = useCallback((animated = false) => {
    if (!stickToBottom.current) return;
    pendingAnchorAnimated.current = pendingAnchorAnimated.current || animated;
    if (anchorFrame.current !== null) return;
    anchorFrame.current = requestAnimationFrame(() => {
      anchorFrame.current = null;
      const shouldAnimate = pendingAnchorAnimated.current;
      pendingAnchorAnimated.current = false;
      if (stickToBottom.current) listRef.current?.scrollToEnd({ animated: shouldAnimate });
    });
  }, [stickToBottom]);

  const onContentSizeChange = useCallback(() => scheduleBottomAnchor(false), [scheduleBottomAnchor]);
  const onListLayout = useCallback(() => scheduleBottomAnchor(false), [scheduleBottomAnchor]);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => scheduleBottomAnchor(false));
    return () => subscription.remove();
  }, [scheduleBottomAnchor]);

  useEffect(() => () => {
    if (anchorFrame.current !== null) cancelAnimationFrame(anchorFrame.current);
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const atBottom = contentSize.height - layoutMeasurement.height - contentOffset.y <= BOTTOM_TOLERANCE;
    stickToBottom.current = atBottom;
    setShowScrollBottom((shown) => (shown === !atBottom ? shown : !atBottom));
  }, [stickToBottom]);

  const onScrollToIndexFailed = useCallback((info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
    listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
    }, 120);
  }, []);

  const scrollToMatchedIndex = useCallback((matchIndex: number) => {
    if (matchIndex < 0 || matchIndex >= matchingIndices.length) return;
    listRef.current?.scrollToIndex({ index: matchingIndices[matchIndex], animated: true, viewPosition: 0.5 });
  }, [matchingIndices]);

  const nextMatch = useCallback(() => {
    if (!matchingIndices.length) return;
    const next = (searchMatchIndex + 1) % matchingIndices.length;
    setSearchMatchIndex(next);
    scrollToMatchedIndex(next);
  }, [matchingIndices.length, scrollToMatchedIndex, searchMatchIndex, setSearchMatchIndex]);

  const previousMatch = useCallback(() => {
    if (!matchingIndices.length) return;
    const previous = (searchMatchIndex - 1 + matchingIndices.length) % matchingIndices.length;
    setSearchMatchIndex(previous);
    scrollToMatchedIndex(previous);
  }, [matchingIndices.length, scrollToMatchedIndex, searchMatchIndex, setSearchMatchIndex]);

  const jumpToBottom = useCallback(() => {
    stickToBottom.current = true;
    pendingAnchorAnimated.current = false;
    listRef.current?.scrollToEnd({ animated: true });
    setShowScrollBottom(false);
  }, [stickToBottom]);

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const key = messageKey(item, index);
    return (
      <MessageBubble
        message={item}
        isLastAssistant={index === lastAssistantIndex}
        animateEntrance={animatingMessageIds.has(key)}
        onRetry={onRetry}
        onEdit={onEdit}
        onDelete={onDelete}
        onShare={bubbleShare}
        onRegenerate={onRegenerate}
        onBranch={onBranch}
        onFeedback={onFeedback}
        onTutorQuizAnswer={onTutorQuizAnswer}
        onTutorPracticeSubmit={onTutorPracticeSubmit}
        linkPreview={linkPreviews[String(item.clientId || item.id || '')]}
        onIterate={onIterate}
        highlight={searchActive ? searchQuery : undefined}
      />
    );
  }, [
    animatingMessageIds, bubbleShare, lastAssistantIndex, linkPreviews,
    onBranch, onDelete, onEdit, onFeedback, onIterate, onRegenerate,
    onRetry, onTutorPracticeSubmit, onTutorQuizAnswer, searchActive, searchQuery,
  ]);

  const keyExtractor = useCallback(messageKey, []);
  const contentContainerStyle = useMemo(
    () => [styles.messages, { paddingHorizontal: spacing.lg }],
    [spacing.lg],
  );
  return (
    <View style={styles.transcript}>
      {searchActive ? (
        <View style={[styles.searchBarWrap, { backgroundColor: colors.background, borderColor: withAlpha(colors.border, 0.35) }]}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              setSearchMatchIndex(0);
            }}
            placeholder={t('search.placeholder') || 'Find in conversation...'}
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text, fontFamily: typography.body }]}
            autoFocus
            autoCapitalize="none"
          />
          {matchingIndices.length > 0 ? (
            <Text style={[styles.searchCount, { color: colors.textMuted }]}>{searchMatchIndex + 1}/{matchingIndices.length}</Text>
          ) : searchQuery ? (
            <Text style={[styles.searchCount, { color: colors.textMuted }]}>0/0</Text>
          ) : null}
          {matchingIndices.length > 0 ? (
            <View style={styles.searchNavBtns}>
              <AnimatedPressable accessibilityRole="button" accessibilityLabel={t('find.previousMatch')} onPress={previousMatch} hitSlop={8} style={styles.searchNavBtn}>
                <Ionicons name="chevron-up" size={18} color={colors.text} />
              </AnimatedPressable>
              <AnimatedPressable accessibilityRole="button" accessibilityLabel={t('find.nextMatch')} onPress={nextMatch} hitSlop={8} style={styles.searchNavBtn}>
                <Ionicons name="chevron-down" size={18} color={colors.text} />
              </AnimatedPressable>
            </View>
          ) : null}
          <AnimatedPressable onPress={() => setSearchActive(false)} hitSlop={8} style={styles.searchCloseBtn}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </AnimatedPressable>
        </View>
      ) : null}

      <FlatList
        style={styles.list}
        ref={listRef}
        data={messages}
        onLayout={onListLayout}
        keyExtractor={keyExtractor}
        renderItem={renderMessage}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        scrollEventThrottle={32}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={9}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={EmptyMessageList}
        onScrollToIndexFailed={onScrollToIndexFailed}
      />

      {showScrollBottom ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={t('chat.newReply') || 'New reply'}
          onPress={jumpToBottom}
          style={[styles.scrollBottomBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, bottom: scrollBottomOffset }]}
        >
          <Ionicons name="arrow-down" size={14} color={colors.accent} />
          <Text style={[styles.scrollBottomText, { color: colors.text, fontFamily: typography.medium }]}>
            {t('chat.newReply') || '↓ New reply'}
          </Text>
        </AnimatedPressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  transcript: { flex: 1, minHeight: 0 },
  list: { flex: 1 },
  searchBarWrap: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    zIndex: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 12,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 2 },
  searchCount: { fontSize: 12 },
  searchNavBtns: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  searchNavBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  searchCloseBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  messages: { flexGrow: 1, paddingTop: 12, paddingBottom: 0 },
  empty: { flex: 1 },
  scrollBottomBtn: {
    position: 'absolute',
    alignSelf: 'flex-end',
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minHeight: 26,
    borderRadius: 13,
    borderWidth: 0,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 7,
    zIndex: 20,
  },
  scrollBottomText: { fontSize: 11 },
});
