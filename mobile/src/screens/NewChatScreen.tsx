import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { Composer } from '../components/Composer';
import { ComposerToolsMenu, type ComposerToolsAnchor } from '../components/ComposerToolsMenu';
import { ModelPickerModal, type ModelPickerAnchor } from '../components/ModelPickerModal';
import { ModelConfigSheet } from '../components/ModelConfigSheet';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { appStore, useAppStore } from '../stores/appStore';
import { pickChatAttachment, type ChatAttachmentSource } from '../data/chat/attachments';
import { native } from '../native/native';
import type { RootStackParamList } from '../navigation/types';
import { useResponsive } from '../theme/responsive';
import { filterPromptTemplates, getPromptTemplates, MOBILE_EXTENSIONS, parseSlashQuery, subscribePromptTemplates, type MobilePromptTemplate } from '../data/chat/prompts';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { withAlpha } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

/* Landing entrance: frontend staggers greeting → subtitle → composer
 * with `emptyStateIn .4s var(--ease-out)` at 0/70/140ms
 * (`styles.css:1074-1086`). Same curve, same stagger, RN Animated. */
function Enter({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }),
      Animated.timing(translate, { toValue: 0, duration: 400, delay, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }),
    ]);
    animation.start();
    return () => {
      animation.stop();
    };
  }, [delay, opacity, translate]);
  return <Animated.View style={{ opacity, transform: [{ translateY: translate }] }}>{children}</Animated.View>;
}

export function NewChatScreen({ navigation, route }: Props) {
  const { colors, typography, fontScale } = useTheme();
  const t = useT();
  /* P0 perf — subscribe only to the slices this screen reads. The previous
   * `useAppStore()` re-rendered the landing on every store commit (every
   * draft keystroke in ChatScreen, every streaming flush, etc.). With
   * focused selectors the screen only re-renders when one of its own
   * visible slices changes. */
  const activeSessionId = useAppStore((s) => s.activeSession?.id ?? null);
  const activeSessionHasMessages = useAppStore((s) => Boolean(s.activeSession?.messages?.length));
  const activeSessionProjectId = useAppStore((s) => s.activeSession?.projectId ?? null);
  const mode = useAppStore((s) => s.activeSession?.mode || 'chat');
  /* `draft` / `pendingAttachments` / `isStreaming` move per keystroke and per
   * stream flag flip — they are subscribed inside LandingComposerCard below
   * so typing on the landing does not re-render the greeting, quick actions,
   * and header. `send` reads them from getSnapshot() at press time. */
  const isIncognito = useAppStore((s) => s.isIncognito);
  const activeExtension = useAppStore((s) => s.activeExtension);
  const activeTemplate = useAppStore((s) => s.activeTemplate);
  const reasoningEffort = useAppStore((s) => s.reasoningEffort);
  const composerPlugins = useAppStore((s) => s.composerPlugins);
  const selectedComposerPlugins = useAppStore((s) => s.selectedComposerPlugins);
  const providers = useAppStore((s) => s.providers);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const { isCompact } = useResponsive();
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelPickerAnchor, setModelPickerAnchor] = useState<ModelPickerAnchor | null>(null);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [toolsMenuAnchor, setToolsMenuAnchor] = useState<ComposerToolsAnchor | null>(null);
  const [configSheetOpen, setConfigSheetOpen] = useState(false);

  /* The reset contract is "the user landed on Home", not "the screen is
   * mounted" — freezeOnBlur only suspends React work and is ignored by
   * react-native-screens' web Screen, and the drawer awaits openSession()
   * before navigating, so session data can change while Home is either
   * blurred OR still focused. Edge-trigger on focus (and on a fresh
   * projectId) so opening a session never wipes it on web. */
  const isFocused = useIsFocused();
  const wasFocusedRef = useRef(false);
  useEffect(() => {
    const projectId = route.params?.projectId || null;
    const gainedFocus = isFocused && !wasFocusedRef.current;
    wasFocusedRef.current = isFocused;
    if (!isFocused) return;
    const projectChanged = Boolean(projectId && activeSessionProjectId !== projectId);
    if (gainedFocus || projectChanged) {
      if (!activeSessionId || activeSessionHasMessages || projectChanged) {
        appStore.startNewSession('chat', true, projectId);
      }
    }
    /* Consume the param whenever present while focused — even when it
     * already matches the active session's project — so it can't leak into
     * a later focus gain and trigger a stale reset. */
    if (projectId) navigation.setParams({ projectId: undefined });
  }, [isFocused, navigation, route.params?.projectId, activeSessionId, activeSessionHasMessages, activeSessionProjectId]);

  const changeMode = useCallback((next: 'chat' | 'tutor') => {
    if (next === mode) return;
    appStore.startNewSession(next, true);
  }, [mode]);

  const newChat = useCallback(() => appStore.startNewSession(mode), [mode]);

  /* AppHeader is React.memo'd — hoisted callbacks keep its props stable so
   * draft keystrokes and unrelated store commits don't re-render the whole
   * top bar (mode switch, model chip, incognito toggle). */
  const onHeaderModelPicker = useCallback((anchor?: ModelPickerAnchor | null) => {
    setModelPickerAnchor(anchor || null);
    setModelPickerOpen(true);
  }, []);
  const onHeaderToggleIncognito = useCallback(() => appStore.toggleIncognito(), []);

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

  const send = useCallback(() => {
    /* Snapshot read: closing over the subscribed `draft` would give this
     * callback a new identity per keystroke, defeating Composer's memo. */
    const snapshot = appStore.getSnapshot();
    const text = snapshot.draft.trim();
    if ((!text && !snapshot.pendingAttachments.length) || snapshot.isStreaming) return;
    /* Fire-and-forget: awaiting the haptics bridge delayed navigation and
     * the first paint of the outgoing message — the "half-beat" lag. */
    void native.vibrate('light');
    if (snapshot.activeSession?.mode === 'tutor') {
      // Web Tutor requires a textual topic before diagnostics; attachments
      // remain queued and are attached to the first visible topic turn.
      if (!text) return;
      navigation.navigate('Tutor', { initialTopic: text });
      return;
    }
    navigation.navigate('Chat');
    void appStore.sendMessage(snapshot.draft);
  }, [navigation]);

  /* Composer is React.memo'd — hoisted callbacks keep every prop identity
   * stable so unrelated store commits (session list refreshes, user
   * updates) don't re-render the heavy composer tree. Snapshot reads keep
   * the toggle permanently stable. */
  const onComposerChangeText = useCallback((value: string) => appStore.setDraft(value), []);
  const onComposerSend = useCallback(() => { void send(); }, [send]);
  const onComposerStop = useCallback(() => appStore.stopGenerating(), []);
  const onComposerRemoveAttachment = useCallback((attachmentId: string) => appStore.removeAttachment(attachmentId), []);
  const onComposerReasoningEffort = useCallback((effort: Parameters<typeof appStore.setReasoningEffort>[0]) => appStore.setReasoningEffort(effort), []);
  const onComposerRemoveExtension = useCallback(() => {
    appStore.setActiveExtension(null);
    appStore.setActiveTemplate(null);
  }, []);
  const onComposerRemovePlugin = useCallback((pluginId: string) => appStore.clearComposerPlugin(pluginId), []);
  const onComposerOpenConfig = useCallback(() => setConfigSheetOpen(true), []);

  const currentProvider = providers.find((provider) => provider.id === selectedModel);
  const currentModelName = currentProvider ? ((currentProvider.label && currentProvider.label !== 'Default') ? currentProvider.label : (currentProvider.model || currentProvider.label || 'Model')) : 'Model';

  /* The current SPA landing is a static mode greeting. Older native code
   * personalized it by time and account name, which diverged from the web
   * renderer and changed the landing geometry from one session to another. */
  /* `.slash-command-palette` — owned by LandingComposerCard, which holds the
   * `draft` subscription; it opens whenever the draft starts with `/`,
   * re-filters live, and closes when the leading `/` is removed. */
  const pickSlashTemplate = useCallback((template: MobilePromptTemplate) => {
    const query = parseSlashQuery(appStore.getSnapshot().draft);
    appStore.setDraft(template.body + (query ? query.tail : ''));
    appStore.setActiveTemplate(template);
  }, []);

  /* Stable chip list — a fresh `.map` array per render would defeat the
   * Composer memo the same way inline arrow callbacks do. */
  const selectedPluginChips = useMemo(
    () => selectedComposerPlugins.map(({ id, name }) => ({ id, name })),
    [selectedComposerPlugins],
  );
  const selectedPluginIds = useMemo(
    () => selectedComposerPlugins.map((plugin) => plugin.id),
    [selectedComposerPlugins],
  );

  const greeting = mode === 'tutor'
    ? (t('greeting.tutor') === 'greeting.tutor' ? "Let's explore." : t('greeting.tutor'))
    : (t('greeting.chat') === 'greeting.chat' ? 'Ready when you are' : t('greeting.chat'));

  return (
    <Screen style={styles.screen}>
      <AppHeader
        showModeSwitch
        mode={mode}
        activeModelName={currentModelName}
        isIncognito={isIncognito}
        onModeChange={changeMode}
        onNewChat={newChat}
        onOpenModelPicker={onHeaderModelPicker}
        onToggleIncognito={onHeaderToggleIncognito}
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, isCompact ? styles.scrollContentCompact : null]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        /* Web parity: dragging the landing surface dismisses the composer
         * keyboard instead of keeping it pinned open. */
        keyboardDismissMode="on-drag"
      >
        {/* Current SPA landing: greeting + composer only. The old
         * heuristic Ideas/prompt library and home quick-actions are hidden by
         * the final chat-surface.css layer, so native must not resurrect them.
         * `.topic-setup` uses two shrinkable spacers (2:1, top capped at
         * 200px) that seat the group ~42% down the surface rather than at
         * the optical centre. */}
        <View style={[styles.heroSpacer, isCompact ? styles.heroSpacerCompact : null]} />
        <View style={[styles.heroRegion, isCompact ? styles.heroRegionCompact : null]}>
          <Enter delay={0}>
            <Text
              accessibilityRole="header"
              style={[
                styles.greeting,
                isCompact ? styles.greetingCompact : null,
                {
                  color: colors.text,
                  fontFamily: typography.body,
                  fontSize: (isCompact ? 28 : 30) * fontScale,
                  lineHeight: (isCompact ? 35 : 38) * fontScale,
                },
              ]}
            >
              {greeting}
            </Text>
          </Enter>
        </View>

        {/* Landing quick actions removed: the final chat-surface.css hides
         * `.home-quick-actions` ("native must not resurrect them"), and the
         * ChatGPT reference home is empty above the composer. */}

        {/* Central Composer Capsule */}
        <Enter delay={140}>
          <LandingComposerCard
            isCompact={isCompact}
            reasoningEffort={reasoningEffort}
            activeExtensionLabel={activeExtension
              ? MOBILE_EXTENSIONS[activeExtension].label
              : activeTemplate ? activeTemplate.title : null}
            selectedPlugins={selectedPluginChips}
            placeholder={t('chat.inputPlaceholder')}
            onRemoveAttachment={onComposerRemoveAttachment}
            onChangeText={onComposerChangeText}
            onSend={onComposerSend}
            onStop={onComposerStop}
            onAttach={onAttach}
            onChangeReasoningEffort={onComposerReasoningEffort}
            modelLabel={currentModelName}
            onOpenConfig={onComposerOpenConfig}
            onRemoveActiveExtension={onComposerRemoveExtension}
            onRemovePlugin={onComposerRemovePlugin}
            onPickSlashTemplate={pickSlashTemplate}
          />
        </Enter>
        <View style={[styles.heroSpacerAfter, isCompact ? styles.heroSpacerAfterCompact : null]} />
      </ScrollView>

      {/* Tools Menu Modal 1:1 matching cur-mobile-menu.png */}
      <ComposerToolsMenu
        visible={toolsMenuOpen}
        surface="topic"
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

      {/* Model Picker Modal */}
      <ModelPickerModal
        visible={modelPickerOpen}
        providers={providers}
        anchor={modelPickerAnchor}
        variant="landing"
        selectedId={selectedModel}
        onSelect={(modelId) => { void appStore.setSelectedModel(modelId); }}
        onClose={() => setModelPickerOpen(false)}
        onManageSettings={() => navigation.navigate('Settings')}
      />

      {/* Phone-form model + thinking sheet (ChatGPT "配置" parity); the
       * anchored ModelPickerModal above remains the wide-viewport path. */}
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

/* The landing composer owns the per-keystroke store slices (`draft`,
 * `pendingAttachments`, `isStreaming`) plus the slash palette derived from
 * the draft, so typing re-renders only this card — not the greeting,
 * quick actions, or header. All callbacks/labels arrive as stable props
 * from the parent, preserving Composer's React.memo bailout. */
type LandingComposerCardProps = Omit<
  React.ComponentProps<typeof Composer>,
  'value' | 'hasAttachments' | 'attachments' | 'disabled'
> & {
  isCompact: boolean;
  onPickSlashTemplate: (template: MobilePromptTemplate) => void;
};

const LandingComposerCard = React.memo(function LandingComposerCard({
  isCompact,
  onPickSlashTemplate,
  ...composerProps
}: LandingComposerCardProps) {
  const { colors, typography } = useTheme();
  const t = useT();
  const draft = useAppStore((s) => s.draft);
  const pendingAttachments = useAppStore((s) => s.pendingAttachments);
  const isStreaming = useAppStore((s) => s.isStreaming);
  /* Subscribe so skills created in the manager show up in the palette
   * without a remount. */
  useSyncExternalStore(subscribePromptTemplates, getPromptTemplates);
  const slashQuery = parseSlashQuery(draft);
  const slashList = slashQuery ? filterPromptTemplates(slashQuery.query) : [];

  return (
    <View style={[styles.composerCardWrap, isCompact ? styles.composerCardWrapCompact : null]}>
      {/* `#slashCommandPalette` — anchored flush above the composer,
       * lists the same prompt templates with the same labels as the
       * web palette (connected apps don't exist on mobile yet). */}
      {slashQuery ? (
        <View
          style={[
            styles.slashPalette,
            {
              backgroundColor: colors.surface,
              borderColor: withAlpha(colors.border, 0.4),
            },
          ]}
        >
          <Text style={[styles.slashHead, { color: colors.textSubtle, fontFamily: typography.medium }]}>
            {t('composer.slash.title')}{slashQuery.query ? ` — /${slashQuery.query}` : ''}
          </Text>
          {slashList.length ? (
            <>
              <Text style={[styles.slashGroup, { color: colors.textSubtle, fontFamily: typography.medium }]}>
                {t('composer.slash.groupTemplates')}
              </Text>
              {slashList.map((template) => (
                <AnimatedPressable
                  key={template.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${template.title} ${template.shortcut}`}
                  onPress={() => onPickSlashTemplate(template)}
                  style={styles.slashRow}
                >
                  <View style={styles.slashIcon}>
                    <Ionicons name={template.icon as never} size={16} color={colors.textMuted} />
                  </View>
                  <View style={styles.slashMain}>
                    <Text numberOfLines={1} style={[styles.slashTitle, { color: colors.text, fontFamily: typography.body }]}>
                      {template.title} <Text style={[styles.slashShortcut, { color: colors.accent }]}>{template.shortcut}</Text>
                    </Text>
                    <Text numberOfLines={1} style={[styles.slashDesc, { color: colors.textMuted, fontFamily: typography.body }]}>
                      {template.description}
                    </Text>
                  </View>
                </AnimatedPressable>
              ))}
            </>
          ) : (
            <Text style={[styles.slashEmpty, { color: colors.textMuted, fontFamily: typography.body }]}>
              {t('composer.slash.noMatch', { query: slashQuery.query })}
            </Text>
          )}
          <Text style={[styles.slashFoot, { color: colors.textSubtle, fontFamily: typography.body }]}>
            {t('composer.slash.footer')}
          </Text>
        </View>
      ) : null}
      <Composer
        {...composerProps}
        value={draft}
        hasAttachments={pendingAttachments.length > 0}
        attachments={pendingAttachments}
        disabled={isStreaming}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  screen: {
    paddingTop: 0,
  },
  scrollContent: {
    /* 16px page gutter on both widths — frontend `.topic-setup` pads
     * `24px 20px` inside a centered 620px column; 16 matches the mobile
     * chrome used elsewhere on this surface. */
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
    flexGrow: 1,
  },
  scrollContentCompact: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 16,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  offline: {
    marginHorizontal: 14,
    marginBottom: 8,
    minHeight: 36,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineText: { fontSize: 12 },
  heroSpacer: {
    /* `.topic-setup::before` — flex-grow 2, max-height 200px, collapses to 0
     * when content overflows so a short window scrolls from the top. */
    flexGrow: 2,
    flexShrink: 1,
    flexBasis: 0,
    maxHeight: 200,
  },
  heroSpacerCompact: {
    display: 'none',
  },
  heroSpacerAfter: {
    /* `.topic-setup::after` — flex-grow 1, same collapse behaviour. */
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  heroSpacerAfterCompact: {
    display: 'none',
  },
  heroRegion: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroRegionCompact: {
    position: 'absolute',
    top: '39%',
    left: 16,
    right: 16,
  },
  greeting: {
    fontSize: 30,
    lineHeight: 38,
    textAlign: 'center',
    paddingHorizontal: 12,
    maxWidth: 620,
    alignSelf: 'center',
    fontWeight: '400',
    letterSpacing: -0.3,
  },
  greetingCompact: {
    fontSize: 28,
    lineHeight: 35,
  },
  composerCardWrap: {
    marginBottom: 0,
  },
  composerCardWrapCompact: {
    width: '100%',
  },
  /* `.slash-command-palette` — bottom-anchored card listing `/` commands. */
  slashPalette: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    marginBottom: 8,
    paddingVertical: 6,
  },
  slashHead: {
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  slashGroup: {
    fontSize: 11,
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 4,
  },
  slashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  slashIcon: {
    width: 22,
    alignItems: 'center',
  },
  slashMain: {
    flex: 1,
    minWidth: 0,
  },
  slashTitle: {
    fontSize: 13,
  },
  slashShortcut: {
    fontSize: 11,
  },
  slashDesc: {
    fontSize: 11,
    marginTop: 1,
  },
  slashEmpty: {
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  slashFoot: {
    fontSize: 10.5,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 2,
  },
});
