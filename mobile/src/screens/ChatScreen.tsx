import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Message } from '@socrates/contracts';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { useAppDrawer } from '../components/AppDrawer';
import { MessageBubble } from '../components/MessageBubble';
import { Composer } from '../components/Composer';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n, useT } from '../i18n';
import { appStore, useAppStore } from '../stores/appStore';
import { native } from '../native/native';
import { sharesApi } from '../data/api/client';
import { pickChatAttachment, type ChatAttachmentSource } from '../data/chat/attachments';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;
const EMPTY_MESSAGES: Message[] = [];
const BOTTOM_TOLERANCE = 96;

const DEFAULT_FOLLOW_UPS_ZH = [
  '能否给出一个具体的示例或应用场景？',
  '这背后有哪些潜在局限或反例？',
  '如果我要进一步深入，下一步该如何实践？',
];

const DEFAULT_FOLLOW_UPS_EN = [
  'Could you provide a concrete example?',
  'What are the potential limitations or counterexamples?',
  'How should we proceed with practical implementation?',
];

export function ChatScreen({ navigation }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const { language } = useI18n();
  const t = useT();
  const state = useAppStore();
  const listRef = useRef<FlatList<Message>>(null);
  const stickToBottom = useRef(true);
  const pendingScroll = useRef(false);
  const { openDrawer } = useAppDrawer();
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // In-session search state
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);

  const messages = state.activeSession?.messages || EMPTY_MESSAGES;

  // Search matches computation
  const matchingIndices = useMemo(() => {
    if (!searchActive || !searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const indices: number[] = [];
    messages.forEach((msg, idx) => {
      const text = (msg.rawText || msg.content || '').toLowerCase();
      if (text.includes(q)) indices.push(idx);
    });
    return indices;
  }, [searchActive, searchQuery, messages]);

  const scrollToMatchedIndex = (matchIdx: number) => {
    if (!matchingIndices.length || matchIdx < 0 || matchIdx >= matchingIndices.length) return;
    const targetMessageIndex = matchingIndices[matchIdx];
    listRef.current?.scrollToIndex({ index: targetMessageIndex, animated: true, viewPosition: 0.5 });
  };

  const nextMatch = () => {
    if (!matchingIndices.length) return;
    const next = (searchMatchIndex + 1) % matchingIndices.length;
    setSearchMatchIndex(next);
    scrollToMatchedIndex(next);
  };

  const prevMatch = () => {
    if (!matchingIndices.length) return;
    const prev = (searchMatchIndex - 1 + matchingIndices.length) % matchingIndices.length;
    setSearchMatchIndex(prev);
    scrollToMatchedIndex(prev);
  };

  const scrollToLatest = useCallback((animated = false) => {
    if (!stickToBottom.current || pendingScroll.current) return;
    pendingScroll.current = true;
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated });
      pendingScroll.current = false;
    }, 0);
  }, []);

  const onContentSizeChange = useCallback(() => scrollToLatest(false), [scrollToLatest]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const isAtBottom = contentSize.height - layoutMeasurement.height - contentOffset.y <= BOTTOM_TOLERANCE;
    stickToBottom.current = isAtBottom;
    setShowScrollBottom(!isAtBottom && contentSize.height > layoutMeasurement.height + 200);
  }, []);

  const jumpToBottom = () => {
    stickToBottom.current = true;
    listRef.current?.scrollToEnd({ animated: true });
    setShowScrollBottom(false);
  };

  const onSend = useCallback(async (customText?: string) => {
    stickToBottom.current = true;
    await native.vibrate('light');
    const textToSend = customText ?? state.draft;
    await appStore.sendMessage(textToSend);
  }, [state.draft]);

  const attach = useCallback(async (source: ChatAttachmentSource) => {
    try {
      const attachment = await pickChatAttachment(source, state.activeSession?.id);
      if (!attachment) return;
      appStore.addAttachment(attachment);
      await native.vibrate('success');
    } catch (error) {
      appStore.setError(error instanceof Error ? error.message : (t('chat.uploadFailed') || 'Upload failed'));
      await native.vibrate('error');
    }
  }, [state.activeSession?.id, t]);

  const onAttach = useCallback(() => {
    Alert.alert(t('chat.attach') || 'Add attachment', undefined, [
      { text: t('chat.attachFile') || 'Choose a file', onPress: () => { void attach('file'); } },
      { text: t('chat.attachImage') || 'Photo library', onPress: () => { void attach('image'); } },
      { text: t('chat.capturePhoto') || 'Take a photo', onPress: () => { void attach('camera'); } },
      { text: t('common.cancel') || 'Cancel', style: 'cancel' },
    ]);
  }, [attach, t]);

  const onShare = useCallback(async () => {
    const session = state.activeSession;
    if (!session) return;
    try {
      const share = await sharesApi.create(session.id);
      navigation.navigate('Share', {
        url: sharesApi.absoluteUrl(share.url),
        title: session.title || (t('chat.newConversation') || 'Conversation'),
      });
    } catch (error) {
      appStore.setError(error instanceof Error ? error.message : (t('share.failed') || 'Share failed'));
    }
  }, [navigation, state.activeSession, t]);

  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  }, [messages]);

  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => (
      <MessageBubble
        message={item}
        isLastAssistant={index === lastAssistantIndex}
        onRetry={() => { void appStore.retryLastResponse(); }}
      />
    ),
    [lastAssistantIndex]
  );

  const keyForMessage = useCallback((item: Message, index: number) => item.clientId || item.id || String(index), []);

  const followUpSuggestions = language === 'zh' ? DEFAULT_FOLLOW_UPS_ZH : DEFAULT_FOLLOW_UPS_EN;
  const showSuggestions = !state.isStreaming && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant';

  return (
    <Screen keyboard style={styles.screen}>
      <AppHeader
        conversationActive
        title={state.activeSession?.title || (state.activeSession?.mode === 'tutor' ? 'Tutor' : 'Chat')}
        onShare={() => { void onShare(); }}
        onMore={openDrawer}
        onSearchInSession={() => {
          setSearchActive(!searchActive);
          setSearchQuery('');
        }}
      />

      {/* In-session Search Bar */}
      {searchActive ? (
        <View style={[styles.searchBarWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
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
            <Text style={[styles.searchCount, { color: colors.textMuted }]}>
              {searchMatchIndex + 1}/{matchingIndices.length}
            </Text>
          ) : searchQuery ? (
            <Text style={[styles.searchCount, { color: colors.textMuted }]}>0/0</Text>
          ) : null}

          {matchingIndices.length > 0 ? (
            <View style={styles.searchNavBtns}>
              <AnimatedPressable onPress={prevMatch} style={styles.searchNavBtn}>
                <Ionicons name="chevron-up" size={18} color={colors.text} />
              </AnimatedPressable>
              <AnimatedPressable onPress={nextMatch} style={styles.searchNavBtn}>
                <Ionicons name="chevron-down" size={18} color={colors.text} />
              </AnimatedPressable>
            </View>
          ) : null}

          <AnimatedPressable onPress={() => setSearchActive(false)} style={styles.searchCloseBtn}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </AnimatedPressable>
        </View>
      ) : null}

      {!state.isOnline ? (
        <View style={[styles.offline, { backgroundColor: colors.accentSoft, borderBottomColor: colors.border }]}>
          <View style={[styles.offlineDot, { backgroundColor: colors.accent }]} />
          <Text style={[styles.offlineText, { color: colors.textMuted }]}>
            {t('chat.offlineBanner') || 'Offline mode: messages will sync when reconnected'}
          </Text>
        </View>
      ) : null}

      {/* Message List */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={keyForMessage}
        renderItem={renderMessage}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        scrollEventThrottle={32}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={9}
        contentContainerStyle={[styles.messages, { paddingHorizontal: spacing.sm }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<View style={styles.empty} />}
        onScrollToIndexFailed={() => {}}
      />

      {/* Floating Scroll to Bottom Pill */}
      {showScrollBottom ? (
        <AnimatedPressable
          onPress={jumpToBottom}
          style={[styles.scrollBottomBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
        >
          <Ionicons name="arrow-down" size={16} color={colors.accent} />
          <Text style={[styles.scrollBottomText, { color: colors.text, fontFamily: typography.medium }]}>
            {t('chat.jumpBottom') || 'Latest'}
          </Text>
        </AnimatedPressable>
      ) : null}

      {/* Error and retry banner */}
      {state.error ? (
        <View style={[styles.errorRow, { backgroundColor: colors.surfaceRaised }]}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <Text style={[styles.error, { color: colors.danger, fontFamily: typography.body }]}>
            {state.error}
          </Text>
          {!state.isStreaming ? (
            <AnimatedPressable
              onPress={() => { void appStore.retryLastResponse(); }}
              style={[styles.retry, { borderColor: colors.border, borderRadius: radius.sm }]}
            >
              <Text style={[styles.retryText, { color: colors.text, fontFamily: typography.medium }]}>
                {t('chat.retry') || 'Retry'}
              </Text>
            </AnimatedPressable>
          ) : null}
        </View>
      ) : null}

      {/* Follow-up suggestions chips */}
      {showSuggestions ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestionsStrip}
          keyboardShouldPersistTaps="handled"
        >
          {followUpSuggestions.map((suggestion, i) => (
            <AnimatedPressable
              key={i}
              onPress={() => void onSend(suggestion)}
              style={[
                styles.suggestionChip,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: radius.pill,
                },
              ]}
            >
              <Ionicons name="sparkles-outline" size={13} color={colors.accent} />
              <Text numberOfLines={1} style={[styles.suggestionChipText, { color: colors.textMuted, fontFamily: typography.medium }]}>
                {suggestion}
              </Text>
            </AnimatedPressable>
          ))}
        </ScrollView>
      ) : null}

      {/* Composer Container */}
      <View style={[styles.composerWrap, { backgroundColor: colors.background }]}>
        {state.pendingAttachments.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.attachments}
            keyboardShouldPersistTaps="handled"
          >
            {state.pendingAttachments.map((attachment) => (
              <AnimatedPressable
                key={attachment.id}
                onPress={() => appStore.removeAttachment(attachment.id)}
                style={[
                  styles.attachmentChip,
                  {
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.border,
                    borderRadius: radius.sm,
                  },
                ]}
              >
                <Ionicons name="document-outline" size={16} color={colors.accent} />
                <Text numberOfLines={1} style={[styles.attachmentName, { color: colors.textMuted, fontFamily: typography.medium }]}>
                  {attachment.name}
                </Text>
                <Ionicons name="close" size={16} color={colors.textSubtle} />
              </AnimatedPressable>
            ))}
          </ScrollView>
        ) : null}

        <Composer
          value={state.draft}
          hasAttachments={state.pendingAttachments.length > 0}
          disabled={state.isStreaming}
          reasoningEffort={state.reasoningEffort}
          webSearchEnabled={state.webSearchEnabled}
          onChangeText={(value) => appStore.setDraft(value)}
          onSend={() => void onSend()}
          onStop={() => appStore.stopGenerating()}
          onAttach={onAttach}
          onChangeReasoningEffort={(effort) => appStore.setReasoningEffort(effort)}
          onToggleWebSearch={() => appStore.setWebSearchEnabled(!state.webSearchEnabled)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 2,
  },
  searchCount: {
    fontSize: 12,
  },
  searchNavBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  searchNavBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchCloseBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offline: {
    minHeight: 34,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  offlineDot: { width: 6, height: 6, borderRadius: 3 },
  offlineText: { fontSize: 12, fontWeight: '600' },
  messages: { flexGrow: 1, paddingTop: 14, paddingBottom: 12 },
  empty: { flex: 1 },
  scrollBottomBtn: {
    position: 'absolute',
    right: 20,
    bottom: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    zIndex: 15,
  },
  scrollBottomText: {
    fontSize: 12,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 8,
  },
  error: { flex: 1, fontSize: 12, lineHeight: 18 },
  retry: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1 },
  retryText: { fontSize: 12 },
  suggestionsStrip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    maxWidth: 280,
  },
  suggestionChipText: {
    fontSize: 12,
    flexShrink: 1,
  },
  composerWrap: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
  },
  attachments: { gap: 8, paddingBottom: 8 },
  attachmentChip: {
    maxWidth: 250,
    minHeight: 36,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  attachmentName: { flexShrink: 1, fontSize: 12 },
});
