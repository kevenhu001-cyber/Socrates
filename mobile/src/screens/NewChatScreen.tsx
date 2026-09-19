import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { Composer } from '../components/Composer';
import { ComposerToolsMenu, type ComposerToolsAnchor } from '../components/ComposerToolsMenu';
import { ModelPickerModal, type ModelPickerAnchor } from '../components/ModelPickerModal';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { appStore, useAppStore } from '../stores/appStore';
import { pickChatAttachment, type ChatAttachmentSource } from '../data/chat/attachments';
import { native } from '../native/native';
import type { RootStackParamList } from '../navigation/types';
import { useResponsive } from '../theme/responsive';
import { MOBILE_EXTENSIONS } from '../data/chat/prompts';

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
  const state = useAppStore();
  const { isCompact } = useResponsive();
  const mode = state.activeSession?.mode || 'chat';
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelPickerAnchor, setModelPickerAnchor] = useState<ModelPickerAnchor | null>(null);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [toolsMenuAnchor, setToolsMenuAnchor] = useState<ComposerToolsAnchor | null>(null);

  useEffect(() => {
    const projectId = route.params?.projectId || null;
    if (!state.activeSession || state.activeSession.messages?.length || (projectId && state.activeSession.projectId !== projectId)) {
      appStore.startNewSession('chat', true, projectId);
    }
    if (projectId) navigation.setParams({ projectId: undefined });
  }, [navigation, route.params?.projectId]);

  const changeMode = (next: 'chat' | 'tutor') => {
    if (next === mode) return;
    appStore.startNewSession(next, true);
  };

  const newChat = () => appStore.startNewSession(mode);

  const attach = async (source: ChatAttachmentSource) => {
    try {
      const attachment = await pickChatAttachment(source, state.activeSession?.id);
      if (!attachment) return;
      appStore.addAttachment(attachment);
      await native.vibrate('success');
    } catch (error) {
      appStore.setError(error instanceof Error ? error.message : (t('chat.uploadFailed') || 'Upload failed'));
      await native.vibrate('error');
    }
  };

  const onAttach = (anchor?: ComposerToolsAnchor) => {
    setToolsMenuAnchor(anchor || null);
    setToolsMenuOpen(true);
  };

  const send = async () => {
    const text = state.draft.trim();
    if ((!text && !state.pendingAttachments.length) || state.isStreaming) return;
    await native.vibrate('light');
    if (mode === 'tutor') {
      // Web Tutor requires a textual topic before diagnostics; attachments
      // remain queued and are attached to the first visible topic turn.
      if (!text) return;
      navigation.navigate('Tutor', { initialTopic: text });
      return;
    }
    navigation.navigate('Chat');
    await appStore.sendMessage(state.draft);
  };

  const currentProvider = state.providers.find((provider) => provider.id === state.selectedModel);
  const currentModelName = currentProvider ? ((currentProvider.label && currentProvider.label !== 'Default') ? currentProvider.label : (currentProvider.model || currentProvider.label || 'Model')) : 'Model';

  /* The current SPA landing is a static mode greeting. Older native code
   * personalized it by time and account name, which diverged from the web
   * renderer and changed the landing geometry from one session to another. */
  const greeting = mode === 'tutor'
    ? (t('greeting.tutor') === 'greeting.tutor' ? "Let's explore." : t('greeting.tutor'))
    : (t('greeting.chat') === 'greeting.chat' ? 'Ready when you are' : t('greeting.chat'));

  return (
    <Screen keyboard style={styles.screen}>
      <AppHeader
        showModeSwitch
        mode={mode}
        activeModelName={currentModelName}
        isIncognito={state.isIncognito}
        onModeChange={changeMode}
        onNewChat={newChat}
        onOpenModelPicker={(anchor) => { setModelPickerAnchor(anchor || null); setModelPickerOpen(true); }}
        onToggleIncognito={() => appStore.toggleIncognito()}
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, isCompact ? styles.scrollContentCompact : null]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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

        {/* Central Composer Capsule */}
        <Enter delay={140}>
        <View style={[styles.composerCardWrap, isCompact ? styles.composerCardWrapCompact : null]}>
          <Composer
            value={state.draft}
            hasAttachments={state.pendingAttachments.length > 0}
            attachments={state.pendingAttachments}
            onRemoveAttachment={(attachmentId) => appStore.removeAttachment(attachmentId)}
            disabled={state.isStreaming}
            reasoningEffort={state.reasoningEffort}
            webSearchEnabled={state.webSearchEnabled}
            onChangeText={(value) => appStore.setDraft(value)}
            onSend={send}
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
        onPickSkills={() => navigation.navigate('Embedded', { target: 'skills', title: t('sidebar.more.skills') || 'Skills & shortcuts' })}
        activeExtension={state.activeExtension}
        onToggleThinkDeeper={() => appStore.setReasoningEffort(state.reasoningEffort === 'high' ? 'medium' : 'high')}
        isThinkDeeperActive={state.reasoningEffort === 'high'}
        plugins={state.composerPlugins}
        selectedPluginIds={state.selectedComposerPlugins.map((plugin) => plugin.id)}
        onTogglePlugin={(pluginId) => appStore.toggleComposerPlugin(pluginId)}
      />

      {/* Model Picker Modal */}
      <ModelPickerModal
        visible={modelPickerOpen}
        providers={state.providers}
        anchor={modelPickerAnchor}
        variant="landing"
        selectedId={state.selectedModel}
        onSelect={(modelId) => { void appStore.setSelectedModel(modelId); }}
        onClose={() => setModelPickerOpen(false)}
        onManageSettings={() => navigation.navigate('Settings')}
      />
    </Screen>
  );
}

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
});
