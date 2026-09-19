import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
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
import { pickChatAttachment, type ChatAttachmentSource } from '../data/chat/attachments';
import type { RootStackParamList } from '../navigation/types';
import { MOBILE_EXTENSIONS } from '../data/chat/prompts';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;
const EMPTY_MESSAGES: Message[] = [];
const BOTTOM_TOLERANCE = 64;
/* Stable element identity for FlatList's empty state — see messagesContentStyle. */
function EmptyMessageList() {
  return <View style={styles.empty} />;
}

export function ChatScreen({ navigation }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const t = useT();
  /* P0 perf — subscribe to each store slice individually instead of the
   * whole AppState. The previous `useAppStore()` re-rendered ChatScreen
   * (and everything inside it) on every draft keystroke, every streaming
   * token flush, every isStreaming flag flip, etc. — even when the
   * changed field was unrelated to this view. With focused selectors
   * each commit only re-renders the component tree whose selected slice
   * actually changed:
   *   • draft / pendingAttachments / reasoningEffort / activeExtension /
   *     composer state → the memoised Composer child re-renders, the
   *     screen itself does not.
   *   • activeSession / messages → the FlatList re-renders (necessary,
   *     a new assistant token must show). Composer stays put thanks to
   *     its React.memo and stable callbacks.
   *   • isOnline / error / providers / isIncognito → minimal re-renders,
   *     only when their slice's reference actually changes.
   */
  const messages = useAppStore((s) => s.activeSession?.messages ?? EMPTY_MESSAGES);
  const sessionTitle = useAppStore((s) => s.activeSession?.title ?? null);
  const sessionMode = useAppStore((s) => s.activeSession?.mode ?? null);
  /* `draft` / `pendingAttachments` are intentionally NOT subscribed here —
   * they change per keystroke/pick and would re-render the entire screen
   * (header, FlatList, banners) each time. ComposerDock below owns those
   * subscriptions so the churn is confined to the composer subtree. */
  const reasoningEffort = useAppStore((s) => s.reasoningEffort);
  const activeExtension = useAppStore((s) => s.activeExtension);
  const selectedComposerPlugins = useAppStore((s) => s.selectedComposerPlugins);
  const composerPlugins = useAppStore((s) => s.composerPlugins);
  const providers = useAppStore((s) => s.providers);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const isIncognito = useAppStore((s) => s.isIncognito);
  const linkPreviews = useAppStore((s) => s.linkPreviews);
  const isOnline = useAppStore((s) => s.isOnline);
  const isStreaming = useAppStore((s) => s.isStreaming);
  const error = useAppStore((s) => s.error);
  const searchPill = useAppStore((s) => (s.webSearchEnabled ? s.searchPill : null));
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
  const selectedPluginChips = useMemo(
    () => selectedComposerPlugins.map(({ id, name }) => ({ id, name })),
    [selectedComposerPlugins],
  );
  const selectedPluginIds = useMemo(
    () => selectedComposerPlugins.map((plugin) => plugin.id),
    [selectedComposerPlugins],
  );
  const currentProvider = providers.find((provider) => provider.id === selectedModel);
  const currentModelName = currentProvider ? ((currentProvider.label && currentProvider.label !== 'Default') ? currentProvider.label : (currentProvider.model || currentProvider.label || 'Model')) : 'Model';

  // In-session search state
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);

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

  /* Under adjustResize the window shrinks only AFTER the keyboard finishes
   * its animation; the FlatList viewport would otherwise stay scrolled
   * wherever it was. Re-pin to the latest message once the keyboard has
   * settled — the composer itself is handled on the UI thread by
   * KeyboardStickyView, so this is the only JS-side follow-up needed. */
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => scrollToLatest(true));
    return () => subscription.remove();
  }, [scrollToLatest]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const isAtBottom = contentSize.height - layoutMeasurement.height - contentOffset.y <= BOTTOM_TOLERANCE;
    stickToBottom.current = isAtBottom;
    // Functional update: scroll events fire at scrollEventThrottle cadence, so
    // only re-render when the pill's visibility actually flips.
    setShowScrollBottom((shown) => (shown === !isAtBottom ? shown : !isAtBottom));
  }, []);

  /* Rows host auto-height WebViews, so scrollToIndex routinely fires before
   * the target cell is measured. Jump near the estimated offset, then let
   * layout settle and retry once — matching FlatList's own documented
   * recovery pattern for unknown row heights. */
  const onScrollToIndexFailed = useCallback((info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
    const offset = info.averageItemLength * info.index;
    listRef.current?.scrollToOffset({ offset, animated: false });
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
    }, 120);
  }, []);

  const jumpToBottom = () => {
    stickToBottom.current = true;
    listRef.current?.scrollToEnd({ animated: true });
    setShowScrollBottom(false);
  };

  /* Draft is read from the snapshot, not the subscribed `draft`, so the
   * callback identity never churns while the user types — Composer is
   * React.memo'd and an unstable onSend would defeat it on every keystroke. */
  const onSend = useCallback((customText?: string) => {
    stickToBottom.current = true;
    /* Fire-and-forget: `vibrate` round-trips the native haptics bridge, and
     * awaiting it delayed the user-message echo by a frame or more — the
     * "slow half-beat" feel on send. The send path must not wait on it. */
    void native.vibrate('light');
    void appStore.sendMessage(customText ?? appStore.getSnapshot().draft);
  }, []);

  const attach = useCallback(async (source: ChatAttachmentSource) => {
    try {
      const attachment = await pickChatAttachment(source, appStore.getSnapshot().activeSession?.id);
      if (!attachment) return;
      appStore.addAttachment(attachment);
      await native.vibrate('success');
    } catch (caught) {
      appStore.setError(caught instanceof Error ? caught.message : (t('chat.uploadFailed') || 'Upload failed'));
      await native.vibrate('error');
    }
  }, [t]);

  const onAttach = useCallback((anchor?: ComposerToolsAnchor) => {
    setToolsMenuAnchor(anchor || null);
    setToolsMenuOpen(true);
  }, []);

  /* Read the session through getSnapshot so this stays a stable identity —
   * activeSession gets a new object on every streaming flush, which would
   * otherwise churn renderMessage and every MessageBubble prop downstream. */
  const onShare = useCallback(() => {
    const session = appStore.getSnapshot().activeSession;
    if (!session) return;
    /* The modal owns the create/revoke flow — parity with the web
     * `openShareModal`, which just resets state and shows the overlay. */
    shareModal.open({
      sessionId: session.id,
      title: session.title || (t('chat.newConversation') || 'Conversation'),
    });
  }, [t]);

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

  /* Hoisted once so React.memo on MessageBubble can actually bail: inline
   * arrows here created 9 fresh callback props per render per row. */
  const onRetry = useCallback(() => { void appStore.retryLastResponse(); }, []);
  const onEdit = useCallback((messageId: string, text: string) => appStore.editUserMessage(messageId, text), []);
  const onDelete = useCallback((messageId: string) => appStore.deleteUserMessage(messageId), []);
  const onRegenerate = useCallback((messageId: string) => appStore.regenerateAssistantMessage(messageId), []);
  const onBranch = useCallback((messageId: string, options?: { reExplain?: boolean }) => appStore.branchFromMessage(messageId, options), []);
  const onFeedback = useCallback((messageId: string, rating: 'up' | 'down' | 'none') => appStore.sendMessageFeedback(messageId, rating), []);
  const onTutorQuizAnswer = useCallback((answer: Parameters<typeof appStore.handleTutorQuizAnswer>[0]) => appStore.handleTutorQuizAnswer(answer), []);
  const onTutorPracticeSubmit = useCallback((answer: Parameters<typeof appStore.handleTutorPracticeAnswer>[0]) => appStore.handleTutorPracticeAnswer(answer), []);
  const onIterate = useCallback((text: string) => appStore.setDraft(text), []);

  /* Same hoisting for the Composer — it's React.memo'd, but inline arrow
   * props created fresh identities on every 64ms streaming flush and
   * defeated the memo entirely: the whole composer (TextInput, attachment
   * chips, animated rows, voice bar) re-rendered once per flush, which is
   * the dominant source of chat lag. Hoisted useCallbacks plus
   * getSnapshot() reads keep every prop identity permanently stable. */
  const onComposerChangeText = useCallback((value: string) => appStore.setDraft(value), []);
  const onComposerSend = useCallback(() => { void onSend(); }, [onSend]);
  const onComposerStop = useCallback(() => appStore.stopGenerating(), []);
  const onComposerRemoveAttachment = useCallback((attachmentId: string) => appStore.removeAttachment(attachmentId), []);
  const onComposerReasoningEffort = useCallback((effort: Parameters<typeof appStore.setReasoningEffort>[0]) => appStore.setReasoningEffort(effort), []);
  const onComposerRemoveExtension = useCallback(() => appStore.setActiveExtension(null), []);
  const onComposerRemovePlugin = useCallback((pluginId: string) => appStore.clearComposerPlugin(pluginId), []);

  /* AppHeader is React.memo'd too — the same inline-arrow problem made the
   * whole top bar (segmented model chip, share, search, drawer button)
   * re-render once per streaming flush. Hoist every callback prop. */
  const onHeaderModelPicker = useCallback((anchor?: ModelPickerAnchor | null) => {
    setModelPickerAnchor(anchor || null);
    setModelPickerOpen(true);
  }, []);
  const onHeaderShare = useCallback(() => { void onShare(); }, [onShare]);
  const onHeaderSearch = useCallback(() => {
    setSearchActive(true);
    setSearchQuery('');
    setSearchMatchIndex(0);
  }, []);

  const bubbleShare = isIncognito ? undefined : onShare;
  const highlight = searchActive ? searchQuery : undefined;

  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => (
      <MessageBubble
        message={item}
        isLastAssistant={index === lastAssistantIndex}
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
        highlight={highlight}
      />
    ),
    [
      lastAssistantIndex, bubbleShare, highlight,
      onRetry, onEdit, onDelete, onRegenerate, onBranch, onFeedback,
      onTutorQuizAnswer, onTutorPracticeSubmit, onIterate,
      linkPreviews,
    ]
  );

  const keyForMessage = useCallback((item: Message, index: number) => item.clientId || item.id || String(index), []);

  /* FlatList bails out by comparing prop identities, so the two props below
   * are hoisted: a fresh style array or empty-state element made the list
   * reconcile every row again even when only the draft text changed. */
  const messagesContentStyle = useMemo(
    () => [styles.messages, { paddingHorizontal: spacing.lg }],
    [spacing.lg],
  );

  return (
    <Screen style={styles.screen}>
      <AppHeader
        conversationActive
        title={sessionTitle || (sessionMode === 'tutor' ? 'Tutor' : 'Chat')}
        activeModelName={currentModelName}
        onOpenModelPicker={onHeaderModelPicker}
        onShare={isIncognito ? undefined : onHeaderShare}
        onMore={openDrawer}
        onSearchInSession={onHeaderSearch}
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
              <AnimatedPressable accessibilityRole="button" accessibilityLabel={t('find.previousMatch')} onPress={prevMatch} style={styles.searchNavBtn}>
                <Ionicons name="chevron-up" size={18} color={colors.text} />
              </AnimatedPressable>
              <AnimatedPressable accessibilityRole="button" accessibilityLabel={t('find.nextMatch')} onPress={nextMatch} style={styles.searchNavBtn}>
                <Ionicons name="chevron-down" size={18} color={colors.text} />
              </AnimatedPressable>
            </View>
          ) : null}

          <AnimatedPressable onPress={() => setSearchActive(false)} style={styles.searchCloseBtn}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </AnimatedPressable>
        </View>
      ) : null}

      {!isOnline ? (
        <View style={[styles.offline, { backgroundColor: colors.accentSoft, borderBottomColor: colors.border }]}>
          <View style={[styles.offlineDot, { backgroundColor: colors.accent }]} />
          <Text style={[styles.offlineText, { color: colors.textMuted }]}>
            {t('chat.offlineBanner') || 'Offline mode: messages will sync when reconnected'}
          </Text>
        </View>
      ) : null}

      {/* Web `.search-pill` in the chat header: the live state of the
       * web-search grounding block that rides along with this turn. */}
      {searchPill ? (
        <View style={[styles.searchPill, { borderColor: withAlpha(colors.border, 0.5), backgroundColor: colors.surfaceRaised }]}>
          <Text
            numberOfLines={1}
            style={[styles.searchPillText, { color: searchPill.kind === 'err' ? colors.danger : colors.textMuted, fontFamily: typography.body }]}
          >
            {`${t('chat.webSearchLabel')} ${searchPill.label || (searchPill.count > 0 ? t('chat.webSearchSources', { n: searchPill.count }) : '')}`}
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
        /* chat-surface.css `#msgList { padding-inline: 16px }` on ≤768px. */
        contentContainerStyle={messagesContentStyle}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        /* Web parity: scrolling the transcript dismisses the composer
         * keyboard instead of leaving it open over the messages. */
        keyboardDismissMode="on-drag"
        ListEmptyComponent={EmptyMessageList}
        onScrollToIndexFailed={onScrollToIndexFailed}
        /* removeClippedSubviews intentionally left unset: rows contain WebView
         * islands (RichBlock) which blank/flicker on Android when their cell
         * is detached mid-gesture — the known clipping bug that makes this
         * prop unsafe here. */
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

      {/* KeyboardStickyView: only this bottom cluster (error banner +
       * composer) follows the keyboard — on the UI thread, frame-by-frame.
       * Under adjustResize its measured keyboard inset self-cancels to 0
       * the moment the window resize lands, so the handoff is seamless and
       * the message list/header never lift-then-snap (the web client keeps
       * the transcript fixed and moves just the composer the same way). */}
      <KeyboardStickyView>
        {/* Error and retry banner */}
        {error ? (
          <View style={[styles.errorRow, { backgroundColor: colors.surfaceRaised }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text style={[styles.error, { color: colors.danger, fontFamily: typography.body }]}>
              {error}
            </Text>
            {!isStreaming ? (
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
          <ComposerDock
            onRemoveAttachment={onComposerRemoveAttachment}
            reasoningEffort={reasoningEffort}
            onChangeText={onComposerChangeText}
            onSend={onComposerSend}
            onStop={onComposerStop}
            onAttach={onAttach}
            onChangeReasoningEffort={onComposerReasoningEffort}
            activeExtensionLabel={activeExtension ? MOBILE_EXTENSIONS[activeExtension].label : null}
            selectedPlugins={selectedPluginChips}
            onRemoveActiveExtension={onComposerRemoveExtension}
            onRemovePlugin={onComposerRemovePlugin}
            placeholder={t('chat.inputPlaceholder')}
          />
        </View>
      </KeyboardStickyView>

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
        activeExtension={activeExtension}
        onToggleThinkDeeper={() => appStore.setReasoningEffort(reasoningEffort === 'high' ? 'medium' : 'high')}
        isThinkDeeperActive={reasoningEffort === 'high'}
        plugins={composerPlugins}
        selectedPluginIds={selectedPluginIds}
        onTogglePlugin={(pluginId) => appStore.toggleComposerPlugin(pluginId)}
      />

      {/* Model Picker Modal — mirrors frontend `.model-picker` menu */}
      <ModelPickerModal
        visible={modelPickerOpen}
        providers={providers}
        anchor={modelPickerAnchor}
        variant="chat"
        selectedId={selectedModel}
        onSelect={(modelId) => { void appStore.setSelectedModel(modelId); }}
        onClose={() => setModelPickerOpen(false)}
        onManageSettings={() => navigation.navigate('Settings')}
      />
    </Screen>
  );
}

/* The composer subscribes to `draft`, `pendingAttachments`, and `isStreaming`
 * here — not in ChatScreen — so each keystroke re-renders only this small
 * subtree instead of the whole screen (header, FlatList, banners). The
 * callbacks and chips arrive as stable props from the memoised parent. */
type ComposerDockProps = Omit<
  React.ComponentProps<typeof Composer>,
  'value' | 'hasAttachments' | 'attachments' | 'disabled'
>;

const ComposerDock = React.memo(function ComposerDock(props: ComposerDockProps) {
  const draft = useAppStore((s) => s.draft);
  const pendingAttachments = useAppStore((s) => s.pendingAttachments);
  const isStreaming = useAppStore((s) => s.isStreaming);
  return (
    <Composer
      {...props}
      value={draft}
      hasAttachments={pendingAttachments.length > 0}
      attachments={pendingAttachments}
      disabled={isStreaming}
    />
  );
});

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
  /* frontend `.search-pill`: compact header chip, 11px label. */
  searchPill: {
    alignSelf: 'center',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    maxWidth: '86%',
  },
  searchPillText: { fontSize: 11 },
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
