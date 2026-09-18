import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Message } from '@socrates/contracts';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { useAppDrawer } from '../components/AppDrawer';
import { ModelPickerModal, type ModelPickerAnchor } from '../components/ModelPickerModal';
import { MessageBubble } from '../components/MessageBubble';
import { Composer } from '../components/Composer';
import { ComposerToolsMenu, type ComposerToolsAnchor } from '../components/ComposerToolsMenu';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { shareModal } from '../components/ShareModal';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { appStore, useAppStore } from '../stores/appStore';
import { native } from '../native/native';
import { sharesApi } from '../data/api/client';
import { pickChatAttachment, type ChatAttachmentSource } from '../data/chat/attachments';
import type { RootStackParamList } from '../navigation/types';
import { MOBILE_EXTENSIONS } from '../data/chat/prompts';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;
const EMPTY_MESSAGES: Message[] = [];
const BOTTOM_TOLERANCE = 64;

export function ChatScreen({ navigation }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const t = useT();
  const state = useAppStore();
  const listRef = useRef<FlatList<Message>>(null);
  const stickToBottom = useRef(true);
  const pendingScroll = useRef(false);
  const { openDrawer } = useAppDrawer();
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [toolsMenuAnchor, setToolsMenuAnchor] = useState<ComposerToolsAnchor | null>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelPickerAnchor, setModelPickerAnchor] = useState<ModelPickerAnchor | null>(null);
  const insets = useSafeAreaInsets();
  /* frontend `.new-reply-pill`: `bottom: calc(96px + safe-area + 12px)`
   * above the composer. 96 covers the composer + wrap; add the device
   * safe-area so the pill never sits under the home indicator. */
  const scrollBottomOffset = 96 + Math.max(insets.bottom, 0) + 12;
  const currentProvider = state.providers.find((provider) => provider.id === state.selectedModel);
  const currentModelName = currentProvider ? ((currentProvider.label && currentProvider.label !== 'Default') ? currentProvider.label : (currentProvider.model || currentProvider.label || 'Model')) : 'Model';

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
    setShowScrollBottom(!isAtBottom);
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

  const onAttach = useCallback((anchor?: ComposerToolsAnchor) => {
    setToolsMenuAnchor(anchor || null);
    setToolsMenuOpen(true);
  }, []);

  const onShare = useCallback(async () => {
    const session = state.activeSession;
    if (!session) return;
    try {
      const share = await sharesApi.create(session.id);
      shareModal.open({
        url: sharesApi.absoluteUrl(share.url),
        title: session.title || (t('chat.newConversation') || 'Conversation'),
      });
    } catch (error) {
      appStore.setError(error instanceof Error ? error.message : (t('share.failed') || 'Share failed'));
    }
  }, [state.activeSession, t]);

  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  }, [messages]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (searchActive) {
          setSearchActive(false);
          setSearchQuery('');
          setSearchMatchIndex(0);
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [searchActive]),
  );

  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => (
      <MessageBubble
        message={item}
        isLastAssistant={index === lastAssistantIndex}
        onRetry={() => { void appStore.retryLastResponse(); }}
        onEdit={(messageId, text) => appStore.editUserMessage(messageId, text)}
        onDelete={(messageId) => appStore.deleteUserMessage(messageId)}
        onShare={state.isIncognito ? undefined : onShare}
        onRegenerate={(messageId) => appStore.regenerateAssistantMessage(messageId)}
        onBranch={(messageId, options) => appStore.branchFromMessage(messageId, options)}
        onFeedback={(messageId, rating) => appStore.sendMessageFeedback(messageId, rating)}
        linkPreview={state.linkPreviews[String(item.clientId || item.id || '')]}
        onIterate={(text) => appStore.setDraft(text)}
        highlight={searchActive ? searchQuery : undefined}
      />
    ),
    [lastAssistantIndex, onShare, searchActive, searchQuery, state.isIncognito, state.linkPreviews]
  );

  const keyForMessage = useCallback((item: Message, index: number) => item.clientId || item.id || String(index), []);

  return (
    <Screen keyboard style={styles.screen}>
      <AppHeader
        conversationActive
        title={state.activeSession?.title || (state.activeSession?.mode === 'tutor' ? 'Tutor' : 'Chat')}
        activeModelName={currentModelName}
        onOpenModelPicker={(anchor) => { setModelPickerAnchor(anchor || null); setModelPickerOpen(true); }}
        onShare={state.isIncognito ? undefined : () => { void onShare(); }}
        onMore={openDrawer}
        onSearchInSession={() => {
          setSearchActive(true);
          setSearchQuery('');
          setSearchMatchIndex(0);
        }}
      />

      {/* P0-2: Cmd+F / Ctrl+F (web) toggles the in-session find bar. */}
      {Platform.OS === 'web' ? (
        <WebFindHandler
          active={searchActive}
          onToggle={() => {
            setSearchActive((prev) => !prev);
            setSearchQuery('');
            setSearchMatchIndex(0);
          }}
        />
      ) : null}

      {/* In-session Search Bar */}
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
          style={[styles.scrollBottomBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, bottom: scrollBottomOffset }]}
        >
          <Ionicons name="arrow-down" size={14} color={colors.accent} />
          <Text style={[styles.scrollBottomText, { color: colors.text, fontFamily: typography.medium }]}>
            {t('chat.newReply') || '↓ New reply'}
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

      {/* Composer Container (no in-conversation follow-up chips:
       * `suggestions.js:316-333` retires the chip row once the user has
       * sent the first turn; the previous hardcoded 3-chip strip caused
       * the "flicker during chat" the web client explicitly removed). */}
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
                    borderRadius: 18,
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
          activeExtensionLabel={state.activeExtension ? MOBILE_EXTENSIONS[state.activeExtension].label : null}
          selectedPlugins={state.selectedComposerPlugins.map(({ id, name }) => ({ id, name }))}
          onRemoveActiveExtension={() => appStore.setActiveExtension(null)}
          onRemovePlugin={(pluginId) => appStore.clearComposerPlugin(pluginId)}
          placeholder={t('chat.inputPlaceholder')}
        />
      </View>

      {/* Tools Menu Modal */}
      <ComposerToolsMenu
        visible={toolsMenuOpen}
        surface="chat"
        anchor={toolsMenuAnchor}
        onClose={() => setToolsMenuOpen(false)}
        onPickCamera={() => void attach('camera')}
        onPickPhotos={() => void attach('image')}
        onPickFiles={() => void attach('file')}
        onPickWrite={() => appStore.setActiveExtension('write')}
        onPickExplore={() => appStore.setActiveExtension('explore')}
        onPickAnalyze={() => appStore.setActiveExtension('analyze')}
        onPickExam={() => navigation.navigate('ExamSession')}
        onPickSkills={() => navigation.navigate('Embedded', { target: 'skills', title: t('sidebar.more.skills') || 'Skills & shortcuts' })}
        activeExtension={state.activeExtension}
        onToggleThinkDeeper={() => appStore.setReasoningEffort(state.reasoningEffort === 'high' ? 'medium' : 'high')}
        isThinkDeeperActive={state.reasoningEffort === 'high'}
        plugins={state.composerPlugins}
        selectedPluginIds={state.selectedComposerPlugins.map((plugin) => plugin.id)}
        onTogglePlugin={(pluginId) => appStore.toggleComposerPlugin(pluginId)}
      />

      {/* Model Picker Modal — mirrors frontend `.model-picker` menu */}
      <ModelPickerModal
        visible={modelPickerOpen}
        providers={state.providers}
        anchor={modelPickerAnchor}
        variant="chat"
        selectedId={state.selectedModel}
        onSelect={(modelId) => { void appStore.setSelectedModel(modelId); }}
        onClose={() => setModelPickerOpen(false)}
        onManageSettings={() => navigation.navigate('Embedded', { target: 'api-settings', title: t('settings.title') || 'Settings' })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
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
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchCloseBtn: {
    width: 26,
    height: 26,
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
  /* frontend `#msgList { padding-top: 12px; padding-bottom: 0 }`. */
  messages: { flexGrow: 1, paddingTop: 12, paddingBottom: 0 },
  empty: { flex: 1 },
  /* frontend `.new-reply-pill` (phone breakpoint):
   *   right: 10px; bottom: calc(96px + safe-area + keyboard + 12px);
   *   font-size: 11px; padding: 4px 10px;
   * It is anchored to the right edge above the composer, not centered.
   * `bottom` is injected at render time from `useSafeAreaInsets`. */
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
  scrollBottomText: {
    fontSize: 11,
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
  /* frontend `.suggestion-chip`: min-height 32px, padding 5px 10px,
   * border 0, border-radius 8px, font 400 13px, gap 12px. */
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 0,
    maxWidth: 280,
  },
  suggestionChipText: {
    fontSize: 13,
    flexShrink: 1,
  },
  /* frontend centers the composer inside a 16px-gutter column. */
  composerWrap: {
    paddingHorizontal: 16,
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

/* P0-2: Web-only Ctrl/Cmd+F handler. Mounts a window keydown listener
 * that toggles the in-session find bar so the Web build matches the
 * desktop / web `frontend` shortcut. Native mobile users reach the
 * same surface through the `AppHeader` action button. */
function WebFindHandler({ onToggle }: { active: boolean; onToggle: () => void }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && (event.key === 'f' || event.key === 'F')) {
        event.preventDefault();
        onToggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onToggle]);
  return null;
}
