import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { useAppDrawer } from '../components/AppDrawer';
import { ModelPickerModal, type ModelPickerAnchor } from '../components/ModelPickerModal';
import { ModelConfigSheet } from '../components/ModelConfigSheet';
import { ChatTranscript } from './ChatTranscript';
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

export function ChatScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  /* The screen shell subscribes only to chrome and session controls. The
   * high-frequency activeSession.messages slice is owned by ChatTranscript;
   * draft/attachments are isolated to ComposerDock. */
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
  const isOnline = useAppStore((s) => s.isOnline);
  const isStreaming = useAppStore((s) => s.isStreaming);
  const error = useAppStore((s) => s.error);
  const searchPill = useAppStore((s) => (s.webSearchEnabled ? s.searchPill : null));
  const { openDrawer } = useAppDrawer();
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [toolsMenuAnchor, setToolsMenuAnchor] = useState<ComposerToolsAnchor | null>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelPickerAnchor, setModelPickerAnchor] = useState<ModelPickerAnchor | null>(null);
  const [configSheetOpen, setConfigSheetOpen] = useState(false);
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
  const stickToBottom = useRef(true);
  const animateNextMessage = useRef(false);

  /* Draft is read from the snapshot, not the subscribed `draft`, so the
   * callback identity never churns while the user types — Composer is
   * React.memo'd and an unstable onSend would defeat it on every keystroke. */
  const onSend = useCallback((customText?: string) => {
    stickToBottom.current = true;
    animateNextMessage.current = true;
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

  /* Read the active session through getSnapshot so the callback stays stable
   * without capturing the transient session object during a streamed turn. */
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

  /* Composer callbacks remain stable so text changes and playback updates
   * cannot churn the native input subtree or its controlled value bridge. */
  const onComposerChangeText = useCallback((value: string) => appStore.setDraft(value), []);
  const onComposerSend = useCallback(() => { void onSend(); }, [onSend]);
  const onComposerStop = useCallback(() => appStore.stopGenerating(), []);
  const onComposerRemoveAttachment = useCallback((attachmentId: string) => appStore.removeAttachment(attachmentId), []);
  const onComposerReasoningEffort = useCallback((effort: Parameters<typeof appStore.setReasoningEffort>[0]) => appStore.setReasoningEffort(effort), []);
  const onComposerRemoveExtension = useCallback(() => appStore.setActiveExtension(null), []);
  const onComposerRemovePlugin = useCallback((pluginId: string) => appStore.clearComposerPlugin(pluginId), []);
  const onComposerOpenConfig = useCallback(() => setConfigSheetOpen(true), []);

  /* Keep header actions referentially stable across screen-level state changes. */
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

      <ChatTranscript
        searchActive={searchActive}
        searchQuery={searchQuery}
        searchMatchIndex={searchMatchIndex}
        setSearchActive={setSearchActive}
        setSearchQuery={setSearchQuery}
        setSearchMatchIndex={setSearchMatchIndex}
        stickToBottom={stickToBottom}
        animateNextMessage={animateNextMessage}
        bubbleShare={bubbleShare}
        onRetry={onRetry}
        onEdit={onEdit}
        onDelete={onDelete}
        onRegenerate={onRegenerate}
        onBranch={onBranch}
        onFeedback={onFeedback}
        onTutorQuizAnswer={onTutorQuizAnswer}
        onTutorPracticeSubmit={onTutorPracticeSubmit}
        onIterate={onIterate}
      />

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
            modelLabel={currentModelName}
            onOpenConfig={onComposerOpenConfig}
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
        onPickSkills={() => navigation.navigate('Skills')}
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

      {/* Phone-form model + thinking sheet — the compact composer's
       * text trigger opens this; ModelPickerModal stays for wide. */}
      <ModelConfigSheet
        visible={configSheetOpen}
        providers={providers}
        selectedId={selectedModel}
        effort={reasoningEffort}
        onSelectModel={(modelId) => { void appStore.setSelectedModel(modelId); }}
        onChangeEffort={onComposerReasoningEffort}
        onManageSettings={() => navigation.navigate('Settings')}
        onClose={() => setConfigSheetOpen(false)}
      />
    </Screen>
  );
}

/* ComposerDock owns draft/attachment/streaming subscriptions so keystrokes
 * and stream status changes stay out of the screen chrome and transcript. */
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
