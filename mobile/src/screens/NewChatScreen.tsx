import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { Composer } from '../components/Composer';
import { ComposerToolsMenu, type ComposerToolsAnchor } from '../components/ComposerToolsMenu';
import { AnimatedPressable } from '../components/AnimatedPressable';
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
  const { colors, typography } = useTheme();
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
    if (!state.draft.trim() && !state.pendingAttachments.length) return;
    navigation.navigate('Chat');
    await native.vibrate('light');
    await appStore.sendMessage(state.draft);
  };

  const currentProvider = state.providers.find((provider) => provider.id === state.selectedModel);
  const currentModelName = currentProvider ? ((currentProvider.label && currentProvider.label !== 'Default') ? currentProvider.label : (currentProvider.model || currentProvider.label || 'Model')) : 'Model';

  /* P1 1:1 — time-aware personalized greeting mirrors
   * `frontend/src/ui/greeting.js:renderGreeting` writing into
   * `#topicTitle`. First token of displayName/email, else guest. */
  const greeting = (() => {
    const raw = state.user?.displayName || state.user?.email || t('greeting.guest');
    const name = String(raw || t('greeting.guest')).trim().split(/\s+/)[0] || t('greeting.guest');
    let key = 'greeting.chat';
    if (mode === 'tutor') {
      key = 'greeting.tutor';
    } else {
      const hour = new Date().getHours();
      if (hour >= 5 && hour < 12) key = 'greeting.chat.morning';
      else if (hour >= 12 && hour < 17) key = 'greeting.chat.afternoon';
      else if (hour >= 17 && hour < 22) key = 'greeting.chat.evening';
      else key = 'greeting.chat.late';
    }
    const tmpl = t(key) === key
      ? (mode === 'tutor' ? "Let's explore, {name}." : 'Welcome back, {name}!')
      : t(key);
    return tmpl.replace('{name}', name);
  })();

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
         * the final chat-surface.css layer, so native must not resurrect them. */}
        <View style={styles.heroRegion}>
          <Enter delay={0}>
            <Text
              accessibilityRole="header"
              style={[
                styles.greeting,
                isCompact ? styles.greetingCompact : null,
                { color: colors.text, fontFamily: typography.body },
              ]}
            >
              {greeting}
            </Text>
          </Enter>
        </View>

        {/* Central Composer Capsule */}
        <Enter delay={140}>
        <View style={styles.composerCardWrap}>
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
                      borderColor: colors.borderStrong,
                      borderRadius: 18,
                    },
                  ]}
                >
                  <Ionicons name="document-outline" size={15} color={colors.accent} />
                  <Text numberOfLines={1} style={[styles.attachmentName, { color: colors.textMuted, fontFamily: typography.medium }]}>
                    {attachment.name}
                  </Text>
                  <Ionicons name="close" size={15} color={colors.textSubtle} />
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
        onManageSettings={() => navigation.navigate('Embedded', { target: 'api-settings', title: t('settings.title') || 'Settings' })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 0,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 16,
    flexGrow: 1,
  },
  scrollContentCompact: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 16,
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
  heroRegion: {
    flex: 1,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
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
  attachments: {
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  attachmentChip: {
    maxWidth: 240,
    minHeight: 34,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attachmentName: {
    flexShrink: 1,
    fontSize: 12,
  },
});
