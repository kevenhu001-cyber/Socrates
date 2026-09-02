import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { Composer } from '../components/Composer';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ModelPickerModal, AVAILABLE_MODELS } from '../components/ModelPickerModal';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n, useT } from '../i18n';
import { appStore, useAppStore } from '../stores/appStore';
import { pickChatAttachment, type ChatAttachmentSource } from '../data/chat/attachments';
import { native } from '../native/native';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

interface SuggestionCard {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  promptZh: string;
  promptEn: string;
}

const CHAT_IDEAS: SuggestionCard[] = [
  {
    id: 'daily-briefing',
    icon: 'newspaper-outline',
    title: '晨间简报',
    promptZh: '给我一份晨间简报 — 列出今天最该关注的三件事。',
    promptEn: 'Give me a morning briefing — top three things I should know today.',
  },
  {
    id: 'code-review',
    icon: 'code-slash-outline',
    title: '代码与架构审查',
    promptZh: '请帮我审查一段代码或架构设计的性能、安全隐患与重构建议。',
    promptEn: 'Review my architecture or code for performance, security, and refactoring.',
  },
  {
    id: 'inbox-triage',
    icon: 'mail-outline',
    title: '任务拆解与行动清单',
    promptZh: '我有一堆任务和邮件需要处理，帮我梳理优先级并制定清晰行动清单。',
    promptEn: 'Help me prioritize tasks and draft a clear, actionable plan.',
  },
  {
    id: 'creative-writing',
    icon: 'bulb-outline',
    title: '头脑风暴与创意构思',
    promptZh: '帮我头脑风暴几个新颖的创意构思，并从多个角度剖析优劣。',
    promptEn: 'Brainstorm creative angles and analyze pros and cons from multiple perspectives.',
  },
];

const TUTOR_IDEAS: SuggestionCard[] = [
  {
    id: 'feynman-technique',
    icon: 'school-outline',
    title: '费曼学习法',
    promptZh: '用费曼学习法带我通俗理解量子计算的基本原理，并随时提问检验我的理解。',
    promptEn: 'Explain quantum computing using the Feynman technique, asking questions to check my understanding.',
  },
  {
    id: 'socratic-math',
    icon: 'calculator-outline',
    title: '苏格拉底式启发',
    promptZh: '不要直接告诉我答案，请一步步通过启发式提问，引导我推导欧拉公式。',
    promptEn: 'Without giving me the answer, guide me step by step through questions to derive Euler formula.',
  },
];

export function NewChatScreen({ navigation, route }: Props) {
  const { colors, radius, typography } = useTheme();
  const { language } = useI18n();
  const t = useT();
  const state = useAppStore();
  const mode = state.activeSession?.mode || 'chat';
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

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

  const onAttach = () =>
    Alert.alert(t('chat.attach') || 'Add to message', undefined, [
      { text: t('chat.attachFile') || 'Choose a file', onPress: () => { void attach('file'); } },
      { text: t('chat.attachImage') || 'Photo library', onPress: () => { void attach('image'); } },
      { text: t('chat.capturePhoto') || 'Take a photo', onPress: () => { void attach('camera'); } },
      { text: t('common.cancel') || 'Cancel', style: 'cancel' },
    ]);

  const send = async () => {
    if (!state.draft.trim() && !state.pendingAttachments.length) return;
    navigation.navigate('Chat');
    await native.vibrate('light');
    await appStore.sendMessage(state.draft);
  };

  const selectIdea = (idea: SuggestionCard) => {
    const text = language === 'zh' ? idea.promptZh : idea.promptEn;
    appStore.setDraft(text);
  };

  // Time-aware greeting
  const getGreeting = () => {
    const name = state.user?.displayName || state.user?.email?.split('@')[0] || (t('greeting.guest') || 'Guest');
    const hour = new Date().getHours();
    if (mode === 'tutor') {
      return language === 'zh' ? `让我们开始探索，${name}。` : `Let's explore, ${name}.`;
    }
    if (hour >= 5 && hour < 12) {
      return language === 'zh' ? `早上好，${name}。` : `Good morning, ${name}.`;
    }
    if (hour >= 12 && hour < 17) {
      return language === 'zh' ? `下午好，${name}。` : `Good afternoon, ${name}.`;
    }
    if (hour >= 17 && hour < 22) {
      return language === 'zh' ? `晚上好，${name}。` : `Good evening, ${name}.`;
    }
    return language === 'zh' ? `夜深了，${name}。` : `Working late, ${name}.`;
  };

  const currentModelName = AVAILABLE_MODELS.find((m) => m.id === state.selectedModel)?.name || 'Model';
  const ideas = mode === 'tutor' ? TUTOR_IDEAS : CHAT_IDEAS;

  return (
    <Screen keyboard style={styles.screen}>
      <AppHeader
        showModeSwitch
        mode={mode}
        activeModelName={currentModelName}
        isIncognito={state.isIncognito}
        onModeChange={changeMode}
        onNewChat={newChat}
        onOpenModelPicker={() => setModelPickerOpen(true)}
        onToggleIncognito={() => appStore.toggleIncognito()}
      />

      {!state.isOnline ? (
        <View style={[styles.offline, { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong }]}>
          <Text style={[styles.offlineText, { color: colors.textMuted, fontFamily: typography.medium }]}>
            {t('chat.offlineBanner') || 'Offline mode: messages will sync when reconnected'}
          </Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Landing Greeting & Subtitle */}
        <View style={styles.heroSection}>
          <Text style={[styles.greetingTitle, { color: colors.text, fontFamily: typography.display }]}>
            {getGreeting()}
          </Text>
          <Text style={[styles.greetingSub, { color: colors.textMuted, fontFamily: typography.body }]}>
            {mode === 'tutor'
              ? (language === 'zh'
                ? '提出一个概念、问题或学习目标，苏格拉底将引导你逐步掌握。'
                : 'Name a concept, problem or learning goal, and Socrates will guide you step by step.')
              : (language === 'zh'
                ? '从提问开始，探索思维的深度与边界。'
                : 'What would you like to think through today?')}
          </Text>
        </View>

        {/* Central Composer Card */}
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
                      borderRadius: radius.sm,
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
          />
        </View>

        {/* Ideas for you (Suggestion Chips) */}
        <View style={styles.ideasSection}>
          <Text style={[styles.ideasLabel, { color: colors.textSubtle, fontFamily: typography.semibold }]}>
            {language === 'zh' ? '为您推荐的灵感' : 'Ideas for you'}
          </Text>
          <View style={styles.ideasList}>
            {ideas.map((idea) => (
              <AnimatedPressable
                key={idea.id}
                onPress={() => selectIdea(idea)}
                style={[
                  styles.ideaCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderRadius: radius.lg,
                  },
                ]}
              >
                <View style={[styles.ideaIconWrap, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name={idea.icon} size={18} color={colors.accent} />
                </View>
                <View style={styles.ideaTextWrap}>
                  <Text style={[styles.ideaTitle, { color: colors.text, fontFamily: typography.semibold }]}>
                    {idea.title}
                  </Text>
                  <Text numberOfLines={2} style={[styles.ideaDesc, { color: colors.textMuted, fontFamily: typography.body }]}>
                    {language === 'zh' ? idea.promptZh : idea.promptEn}
                  </Text>
                </View>
              </AnimatedPressable>
            ))}
          </View>
        </View>

        {/* Footnote disclaimer */}
        <Text style={[styles.disclaimer, { color: colors.textSubtle, fontFamily: typography.body }]}>
          {language === 'zh'
            ? '苏格拉底通过提问启发思考，不对答案作评判。'
            : 'Socrates asks questions to help you think. It does not judge your answers.'}
        </Text>
      </ScrollView>

      {/* Model Picker Modal */}
      <ModelPickerModal
        visible={modelPickerOpen}
        selectedId={state.selectedModel}
        onSelect={(modelId) => appStore.setSelectedModel(modelId)}
        onClose={() => setModelPickerOpen(false)}
        onManageSettings={() => navigation.navigate('Settings')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
  },
  offline: {
    marginHorizontal: 16,
    marginBottom: 8,
    minHeight: 36,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineText: { fontSize: 12 },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 8,
  },
  greetingTitle: {
    fontSize: 26,
    lineHeight: 34,
    textAlign: 'center',
    marginBottom: 8,
  },
  greetingSub: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
  },
  composerCardWrap: {
    marginBottom: 24,
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
  ideasSection: {
    marginTop: 4,
    marginBottom: 20,
  },
  ideasLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  ideasList: {
    gap: 10,
  },
  ideaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    gap: 12,
  },
  ideaIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ideaTextWrap: {
    flex: 1,
  },
  ideaTitle: {
    fontSize: 14,
    marginBottom: 2,
  },
  ideaDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  disclaimer: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 16,
  },
});
