import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { Composer } from '../components/Composer';
import { ComposerToolsMenu } from '../components/ComposerToolsMenu';
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

/* P4 1:1 — prompt library ported from
 * `frontend/src/ui/suggestions.js:37-136` (same 14 ids, same zh/en
 * copy). The web row renders two chips at a session-stable offset
 * (`pickFromLibrary`: firstIdx = offset % n, second = +3); mobile
 * derives the offset from the session id hash so the pair is stable
 * within a session and rotates across sessions. Icons map the web
 * glyph set onto Ionicons. */
const PROMPT_LIBRARY: SuggestionCard[] = [
  { id: 'daily-briefing', icon: 'briefcase-outline', title: 'briefing', promptZh: '给我一份晨间简报 — 列出今天最该知道的三件事', promptEn: 'Give me a morning briefing — top three things I should know today' },
  { id: 'inbox-triage', icon: 'mail-outline', title: 'inbox', promptZh: '帮我分一下收件箱：有一堆未读邮件需要一份处理计划', promptEn: 'Help me triage my inbox: I have a stack of unread emails and need a plan' },
  { id: 'meeting-notes', icon: 'document-text-outline', title: 'notes', promptZh: '把会议笔记整理成一份干净的纪要，附上待办事项', promptEn: 'Turn my meeting notes into a clean recap with action items' },
  { id: 'code-review', icon: 'code-slash-outline', title: 'code', promptZh: '审查这段代码，找 bug 并给出可执行的改进建议', promptEn: 'Review this code for bugs and suggest concrete improvements' },
  { id: 'sql-explainer', icon: 'server-outline', title: 'database', promptZh: '逐行解释这条 SQL 在做什么', promptEn: 'Explain what this SQL query does, step by step' },
  { id: 'regex-builder', icon: 'text-outline', title: 'regex', promptZh: '帮我写一条匹配 …… 的正则表达式', promptEn: 'Help me write a regex that matches …' },
  { id: 'concept-teach', icon: 'school-outline', title: 'teach', promptZh: '像给好奇的青少年讲 [topic] 一样教我 — 先讲直觉', promptEn: 'Teach me [topic] like I am a curious teenager — start with the intuition' },
  { id: 'quiz-me', icon: 'help-circle-outline', title: 'quiz', promptZh: '考考我 [topic] — 给我五道题，并批改我的回答', promptEn: 'Quiz me on [topic] — give me five questions and grade my answers' },
  { id: 'compare', icon: 'git-compare-outline', title: 'compare', promptZh: '对比 [A] 与 [B] — 各自优缺点，以及什么时候该选哪个', promptEn: 'Compare [A] vs [B] — pros, cons, and when to pick each' },
  { id: 'summarize', icon: 'list-outline', title: 'summarize', promptZh: '把附件文档压缩成五条要点', promptEn: 'Summarize the attached document into five bullet points' },
  { id: 'brainstorm', icon: 'bulb-outline', title: 'spark', promptZh: '围绕 …… 给我十个短篇故事的切入角度', promptEn: 'Brainstorm ten angles for a short story about …' },
  { id: 'rewrite', icon: 'pencil-outline', title: 'pen', promptZh: '把这段话改写得更自信、更精炼', promptEn: 'Rewrite this paragraph to sound more confident and concise' },
  { id: 'translate-tone', icon: 'globe-outline', title: 'globe', promptZh: '把这段文字翻译成自然、地道的中文', promptEn: 'Translate this passage into natural, idiomatic English' },
  { id: 'decision-frame', icon: 'scale-outline', title: 'scale', promptZh: '我在两个选项之间犹豫 — 帮我搭一个简单的决策框架', promptEn: 'I am weighing two options — help me build a simple decision frame' },
];

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

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

function pickLibraryPair(sessionKey: string): SuggestionCard[] {
  const n = PROMPT_LIBRARY.length;
  const firstIdx = hashString(sessionKey || 'landing') % n;
  const secondIdx = (firstIdx + 3) % n;
  return [PROMPT_LIBRARY[firstIdx], PROMPT_LIBRARY[secondIdx === firstIdx ? (firstIdx + 1) % n : secondIdx]];
}

export function NewChatScreen({ navigation, route }: Props) {
  const { colors, radius, typography } = useTheme();
  const { language } = useI18n();
  const t = useT();
  const state = useAppStore();
  const mode = state.activeSession?.mode || 'chat';
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);

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

  const onAttach = () => setToolsMenuOpen(true);

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

  const currentModelName = AVAILABLE_MODELS.find((m) => m.id === state.selectedModel)?.name || 'Model';
  const ideas = pickLibraryPair(state.activeSession?.id || 'landing');

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
        {/* Spacious empty area 1:1 matching cur-mobile-home.png */}
        <View style={styles.spacer} />

        {/* Greeting — mirrors `#topicTitle.topic-title.greeting`
         * (`frontend/index.html:568`, `styles.css:1074`). */}
        <Enter delay={0}>
          <Text
            accessibilityRole="header"
            style={[styles.greeting, { color: colors.textMuted, fontFamily: typography.display }]}
          >
            {greeting}
          </Text>
        </Enter>

        {/* Starter ideas — two chips at a session-stable offset from
         * the shared library, with the `home.ideasLabel` heading
         * (`frontend/index.html:635-636`, `suggestions.js:274-287`). */}
        <Enter delay={70}>
          <Text style={[styles.ideasLabel, { color: colors.textMuted, fontFamily: typography.semibold }]}>
            {t('home.ideasLabel') || (language === 'zh' ? '灵感' : 'Ideas for you')}
          </Text>
        </Enter>
        <Enter delay={70}>
          <View style={styles.ideasSection}>
          {ideas.slice(0, 2).map((idea) => (
            <AnimatedPressable
              key={idea.id}
              onPress={() => selectIdea(idea)}
              style={[
                styles.ideaPill,
                {
                  backgroundColor: 'transparent',
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <View style={styles.ideaIcon}>
                <Ionicons name={idea.icon} size={15} color={colors.accent} />
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.ideaPillText,
                  { color: colors.textSecondary, fontFamily: typography.body },
                ]}
              >
                {language === 'zh' ? idea.promptZh : idea.promptEn}
              </Text>
            </AnimatedPressable>
          ))}
          </View>
        </Enter>

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
          />
        </View>
        </Enter>
      </ScrollView>

      {/* Tools Menu Modal 1:1 matching cur-mobile-menu.png */}
      <ComposerToolsMenu
        visible={toolsMenuOpen}
        onClose={() => setToolsMenuOpen(false)}
        onPickCamera={() => void attach('camera')}
        onPickPhotos={() => void attach('image')}
        onPickFiles={() => void attach('file')}
        onPickPlugins={() => navigation.navigate('Plugins')}
        onToggleThinkDeeper={() => appStore.setReasoningEffort(state.reasoningEffort === 'high' ? 'medium' : 'high')}
        isThinkDeeperActive={state.reasoningEffort === 'high'}
      />

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
  screen: {
    paddingTop: 0,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 16,
    flexGrow: 1,
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
  spacer: {
    flex: 1,
    minHeight: 120,
  },
  /* frontend `.topic-title`: display serif, clamp(1.8rem–2.5rem),
   * centered, `text-200` muted-ink. 32px lands mid-clamp. */
  greeting: {
    fontSize: 32,
    lineHeight: 38,
    textAlign: 'center',
    marginBottom: 18,
    paddingHorizontal: 12,
    maxWidth: 576,
    alignSelf: 'center',
  },
  ideasSection: {
    marginBottom: 20,
    gap: 8,
    paddingHorizontal: 2,
  },
  ideasLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  ideaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 0.5,
  },
  ideaIcon: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ideaPillText: {
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
  composerCardWrap: {
    marginBottom: 6,
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
