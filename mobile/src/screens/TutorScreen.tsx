import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Markdown } from '../render/MarkdownView';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { appStore, useAppStore } from '../stores/appStore';
import {
  applyDiagnosticResults,
  buildFallbackDiagnosticQuestions,
  generateDiagnosticQuestions,
  generateTopicKnowledgeNodes,
  type TutorDiagnosticQuestion,
  type TutorKnowledgeNode,
  type TutorKnowledgeStatus,
  type TutorTeachingPlan,
} from '../data/tutor/tutorFlow';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Tutor'>;
type FlowPhase = 'overview' | 'choice' | 'generating' | 'questions' | 'results';

const STAGES = [
  ['motivate', 'tutor.stageMotivate'],
  ['define', 'tutor.stageDefine'],
  ['develop', 'tutor.stageDevelop'],
  ['illustrate', 'tutor.stageIllustrate'],
  ['exercise', 'tutor.stageExercise'],
  ['check', 'tutor.stageCheck'],
] as const;

const STATUS_KEY: Record<TutorKnowledgeStatus, string> = {
  internalized: 'knowledge.internalized',
  fuzzy: 'knowledge.fuzzy',
  blank: 'knowledge.blank',
};

function tt(t: (key: string) => string, key: string, fallback: string): string {
  const value = t(key);
  return value === key ? fallback : value;
}

function countKnowledge(nodes: TutorKnowledgeNode[]) {
  return nodes.reduce(
    (acc, node) => {
      if (node.status === 'internalized') acc.internalized += 1;
      else if (node.status === 'fuzzy') acc.fuzzy += 1;
      else acc.blank += 1;
      return acc;
    },
    { internalized: 0, fuzzy: 0, blank: 0 },
  );
}

export function TutorScreen({ navigation, route }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const t = useT();
  /* P0 perf — focused selectors for the slices this screen reads. */
  const activeSessionTopic = useAppStore((s) => s.activeSession?.topic ?? null);
  const activeSessionDomain = useAppStore((s) => s.activeSession?.domain ?? null);
  const activeSessionMode = useAppStore((s) => s.activeSession?.mode ?? null);
  const activeSessionKbNodes = useAppStore((s) => s.activeSession?.kbNodes ?? null);
  const activeSessionTeachingStage = useAppStore((s) => s.activeSession?.teachingStage ?? null);
  const teachingPlan = useAppStore((s) => (s.activeSession?.teachingPlan ?? null) as TutorTeachingPlan | null);
  const practicePhase = useAppStore((s) => s.activeSession?.practicePhase ?? null);
  const practiceAttempts = useAppStore((s) => s.activeSession?.practiceAttempts ?? 0);
  const substantiveCount = useAppStore((s) => s.tutorSubstantiveCount);
  const activeSessionMessagesLength = useAppStore((s) => s.activeSession?.messages?.length ?? 0);
  const user = useAppStore((s) => s.user);
  const reasoningEffort = useAppStore((s) => s.reasoningEffort);
  const storeError = useAppStore((s) => s.error);
  /* P0 android-edge-to-edge: this flow has no AppHeader, so it owns the top
   * safe-area inset itself — otherwise the kicker/progress bar slides under
   * the Android status bar now that the window draws edge-to-edge. */
  const insets = useSafeAreaInsets();
  const flowTopPad = { paddingTop: insets.top + 18 };
  const initialTopic = String(route.params?.initialTopic || '').trim();
  const existingTopic = String(activeSessionTopic || activeSessionDomain || '').trim();
  const topic = initialTopic || existingTopic;

  const [phase, setPhase] = useState<FlowPhase>(initialTopic ? 'choice' : 'overview');
  const [questionCount, setQuestionCount] = useState(5);
  const [nodes, setNodes] = useState<TutorKnowledgeNode[]>([]);
  const [questions, setQuestions] = useState<TutorDiagnosticQuestion[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  const [localError, setLocalError] = useState<string | null>(null);
  /* Which generation was last attempted — drives the failure-state Retry
   * button and the generating-phase Cancel affordance. */
  const lastAction = React.useRef<'teach' | 'explore'>('teach');
  /* Generation is not abortable at the API layer, so Cancel bumps a token;
   * in-flight work still finishes but its results are discarded. */
  const generationToken = React.useRef(0);

  useEffect(() => {
    if (!initialTopic) return;
    if (!activeSessionMode || activeSessionMode !== 'tutor') {
      appStore.startNewSession('tutor', true);
    }
    setPhase('choice');
    setQuestionCount(5);
    setNodes([]);
    setQuestions([]);
    setAnswers([]);
    setQuestionIndex(0);
    setLocalError(null);
  }, [initialTopic]);

  const modelContext = useMemo(() => ({
    customInstructions: user?.customInstructions,
    reasoningEffort,
  }), [reasoningEffort, user?.customInstructions]);

  const existingNodes = useMemo(
    () => Array.isArray(activeSessionKbNodes)
      ? (activeSessionKbNodes as unknown as TutorKnowledgeNode[])
      : [],
    [activeSessionKbNodes],
  );

  const resultNodes = useMemo(
    () => questions.length ? applyDiagnosticResults(nodes, questions, answers) : nodes,
    [answers, nodes, questions],
  );
  const resultCounts = useMemo(() => countKnowledge(resultNodes), [resultNodes]);

  const startTeaching = async (
    sourceNodes: TutorKnowledgeNode[],
    sourceQuestions: TutorDiagnosticQuestion[] = [],
    sourceAnswers: number[] = [],
  ) => {
    setLocalError(null);
    const ok = await appStore.beginTutorTeaching(topic, sourceNodes, sourceQuestions, sourceAnswers);
    if (ok) navigation.replace('Chat');
    else setLocalError(storeError || t('chat.offline') || 'Unable to start Tutor.');
  };

  const cancelGeneration = () => {
    generationToken.current += 1;
    setPhase('choice');
  };

  const startWithoutQuestions = async () => {
    if (!topic) return;
    lastAction.current = 'teach';
    const token = ++generationToken.current;
    setPhase('generating');
    setLocalError(null);
    setGenerationProgress({ current: 0, total: 1 });
    try {
      const generatedNodes = await generateTopicKnowledgeNodes(topic, modelContext);
      if (generationToken.current !== token) return;
      setNodes(generatedNodes);
      setGenerationProgress({ current: 1, total: 1 });
      await startTeaching(generatedNodes);
    } catch (error) {
      if (generationToken.current !== token) return;
      setLocalError(error instanceof Error ? error.message : 'Unable to prepare the lesson.');
      setPhase('choice');
    }
  };

  const startExploration = async () => {
    if (!topic) return;
    lastAction.current = 'explore';
    const token = ++generationToken.current;
    setPhase('generating');
    setLocalError(null);
    try {
      setGenerationProgress({ current: 0, total: questionCount + 1 });
      const generatedNodes = await generateTopicKnowledgeNodes(topic, modelContext);
      if (generationToken.current !== token) return;
      setNodes(generatedNodes);
      setGenerationProgress({ current: 1, total: questionCount + 1 });
      const generatedQuestions = await generateDiagnosticQuestions(
        topic,
        questionCount,
        modelContext,
        (current, total) => setGenerationProgress({ current: current + 1, total: total + 1 }),
      );
      if (generationToken.current !== token) return;
      setQuestions(generatedQuestions);
      setAnswers([]);
      setQuestionIndex(0);
      setPhase('questions');
    } catch (error) {
      if (generationToken.current !== token) return;
      /* tutorFlow already substitutes `buildFallbackDiagnosticQuestions`
       * inside `generateDiagnosticQuestions`; a throw reaching here means a
       * hard failure (e.g. node generation), so fall back to the built-in
       * question set instead of dead-ending on the choice card. */
      setQuestions(buildFallbackDiagnosticQuestions(topic, questionCount));
      setAnswers([]);
      setQuestionIndex(0);
      setLocalError(error instanceof Error ? error.message : 'Unable to generate the diagnostic.');
      setPhase('questions');
    }
  };

  const selectOption = (index: number) => {
    setAnswers((current) => {
      const next = current.slice();
      next[questionIndex] = index;
      return next;
    });
  };

  const moveNext = () => {
    if (answers[questionIndex] === undefined) return;
    if (questionIndex >= questions.length - 1) {
      setPhase('results');
      return;
    }
    setQuestionIndex((index) => index + 1);
  };

  const skipQuestion = () => {
    setAnswers((current) => {
      const next = current.slice();
      next[questionIndex] = -1;
      return next;
    });
    if (questionIndex >= questions.length - 1) setPhase('results');
    else setQuestionIndex((index) => index + 1);
  };

  const stage = activeSessionTeachingStage || 'motivate';
  const currentQuestion = questions[questionIndex];
  const existingCounts = countKnowledge(existingNodes);

  if (phase === 'choice') {
    return (
      <Screen scroll style={[styles.flowScreen, flowTopPad]}>
        <Text style={[styles.kicker, { color: colors.accent, fontFamily: typography.medium }]}>
          {t('tutor.kickerMode') || 'TUTOR MODE'}
        </Text>
        <Text style={[styles.topic, { color: colors.text, fontFamily: typography.display }]}>
          {topic}
        </Text>
        <View style={[styles.dialogCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20 }]}>
          <Text style={[styles.dialogKicker, { color: colors.textMuted, fontFamily: typography.medium }]}>
            {t('tutor.optionalStart') || 'Optional starting point'}
          </Text>
          <Text style={[styles.dialogTitle, { color: colors.text, fontFamily: typography.semibold }]}>
            {t('tutor.exploreBoundaryTitle') || 'Explore your knowledge boundary first?'}
          </Text>
          <Text style={[styles.body, { color: colors.textMuted, fontFamily: typography.body }]}>
            {t('tutor.exploreBoundaryBody') || 'A short multiple-choice exploration helps the tutor choose a starting point. You can also skip it and begin learning.'}
          </Text>

          <View style={[styles.countRow, { borderColor: colors.border, borderRadius: radius.md }]}>
            <View style={styles.countCopy}>
              <Text style={[styles.countTitle, { color: colors.text, fontFamily: typography.medium }]}>
                {t('tutor.questionCount') || 'Number of questions'}
              </Text>
              <Text style={[styles.countHint, { color: colors.textSubtle, fontFamily: typography.body }]}>
                {t('tutor.questionCountHint') || '1 to 10, all multiple choice'}
              </Text>
            </View>
            <View style={styles.stepper}>
              <AnimatedPressable
                accessibilityLabel={t('exam.decreaseCount')}
                onPress={() => setQuestionCount((value) => Math.max(1, value - 1))}
                style={[styles.stepperButton, { backgroundColor: colors.surfaceRaised }]}
              >
                <Text style={[styles.stepperGlyph, { color: colors.text }]}>−</Text>
              </AnimatedPressable>
              <Text style={[styles.countValue, { color: colors.text, fontFamily: typography.semibold }]}>
                {questionCount}
              </Text>
              <AnimatedPressable
                accessibilityLabel={t('exam.increaseCount')}
                onPress={() => setQuestionCount((value) => Math.min(10, value + 1))}
                style={[styles.stepperButton, { backgroundColor: colors.surfaceRaised }]}
              >
                <Text style={[styles.stepperGlyph, { color: colors.text }]}>+</Text>
              </AnimatedPressable>
            </View>
          </View>

          {localError ? (
            <View style={styles.errorRow}>
              <Text style={[styles.error, { color: colors.danger }]}>{localError}</Text>
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => void (lastAction.current === 'explore' ? startExploration() : startWithoutQuestions())}
                style={[styles.retryButton, { borderColor: colors.border, borderRadius: radius.md }]}
              >
                <Text style={[styles.retryButtonText, { color: colors.text, fontFamily: typography.medium }]}>
                  {t('common.retry') || 'Retry'}
                </Text>
              </AnimatedPressable>
            </View>
          ) : null}

          <View style={styles.dialogActions}>
            <AnimatedPressable
              onPress={() => void startWithoutQuestions()}
              style={[styles.secondaryButton, { borderColor: colors.border, borderRadius: radius.md }]}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text, fontFamily: typography.medium }]}>
                {t('tutor.startWithoutQuestions') || 'Start without questions'}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => void startExploration()}
              style={[styles.primaryButton, { backgroundColor: colors.text, borderRadius: radius.md }]}
            >
              <Text style={[styles.primaryButtonText, { color: colors.background, fontFamily: typography.semibold }]}>
                {t('tutor.startExploration') || 'Start exploration'}
              </Text>
            </AnimatedPressable>
          </View>
        </View>
      </Screen>
    );
  }

  if (phase === 'generating') {
    const total = Math.max(1, generationProgress.total);
    const progress = Math.min(1, generationProgress.current / total);
    return (
      <Screen style={[styles.centerScreen, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.accent} size="small" />
        <Text style={[styles.generatingTitle, { color: colors.text, fontFamily: typography.semibold }]}>
          {t('tutor.analyzingTopic') || 'Preparing your learning path…'}
        </Text>
        <Text style={[styles.generatingHint, { color: colors.textMuted, fontFamily: typography.body }]}>
          {generationProgress.current}/{total}
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceRaised }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.accent, width: `${Math.max(4, progress * 100)}%` }]} />
        </View>
        <AnimatedPressable
          onPress={cancelGeneration}
          style={[styles.secondaryButton, { borderColor: colors.border, borderRadius: radius.md }]}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.text, fontFamily: typography.medium }]}>
            {t('common.cancel') || 'Cancel'}
          </Text>
        </AnimatedPressable>
      </Screen>
    );
  }

  if (phase === 'questions' && currentQuestion) {
    const selected = answers[questionIndex];
    return (
      <Screen scroll style={[styles.flowScreen, flowTopPad]}>
        <Text style={[styles.kicker, { color: colors.textMuted, fontFamily: typography.medium }]}>
          {t('tutor.knowledgeBoundary') || 'KNOWLEDGE BOUNDARY'}
        </Text>
        <View style={styles.questionMeta}>
          <Text style={[styles.questionProgress, { color: colors.textSubtle, fontFamily: typography.medium }]}>
            {tt(t, 'tutor.questionOf', 'Question {n} of {total}').replace('{n}', String(questionIndex + 1)).replace('{total}', String(questions.length))}
          </Text>
          <View style={[styles.questionProgressTrack, { backgroundColor: colors.surfaceRaised }]}>
            <View
              style={[
                styles.questionProgressFill,
                { backgroundColor: colors.accent, width: `${((questionIndex + 1) / questions.length) * 100}%` },
              ]}
            />
          </View>
        </View>
        <View style={[styles.questionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
          <Markdown text={currentQuestion.q} />
          {currentQuestion.knowledgePoint ? (
            <Text style={[styles.knowledgePoint, { color: colors.textMuted, fontFamily: typography.body }]}>
              {currentQuestion.knowledgePoint}
            </Text>
          ) : null}
          <View style={styles.options}>
            {currentQuestion.opts.map((option, optionIndex) => {
              const active = selected === optionIndex;
              return (
                <AnimatedPressable
                  key={option.letter}
                  onPress={() => selectOption(optionIndex)}
                  style={[
                    styles.option,
                    {
                      borderColor: active ? colors.accent : colors.border,
                      backgroundColor: active ? colors.accentSoft : 'transparent',
                      borderRadius: radius.md,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.optionLetter,
                      {
                        borderColor: active ? colors.accent : colors.borderStrong,
                        backgroundColor: active ? colors.accent : 'transparent',
                      },
                    ]}
                  >
                    <Text style={{ color: active ? colors.textInverse : colors.textMuted, fontFamily: typography.semibold, fontSize: 12 }}>
                      {option.letter}
                    </Text>
                  </View>
                  <View style={styles.optionTextWrap}>
                    <Markdown text={option.text} />
                  </View>
                </AnimatedPressable>
              );
            })}
          </View>
        </View>
        <View style={styles.questionActions}>
          <AnimatedPressable
            onPress={questionIndex > 0 ? () => setQuestionIndex((index) => index - 1) : undefined}
            style={[styles.textButton, questionIndex === 0 ? styles.disabled : null]}
          >
            <Text style={[styles.textButtonLabel, { color: colors.textMuted, fontFamily: typography.medium }]}>
              {t('common.previous') || 'Previous'}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable onPress={skipQuestion} style={styles.textButton}>
            <Text style={[styles.textButtonLabel, { color: colors.textMuted, fontFamily: typography.medium }]}>
              {t('common.skip') || 'Skip'}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={selected === undefined ? undefined : moveNext}
            style={[
              styles.nextButton,
              {
                backgroundColor: selected === undefined ? colors.surfaceRaised : colors.text,
                borderRadius: radius.md,
              },
            ]}
          >
            <Text
              style={[
                styles.nextButtonLabel,
                {
                  color: selected === undefined ? colors.textSubtle : colors.background,
                  fontFamily: typography.semibold,
                },
              ]}
            >
              {questionIndex === questions.length - 1
                ? (t('common.finish') || 'Finish')
                : (t('common.next') || 'Next')}
            </Text>
          </AnimatedPressable>
        </View>
      </Screen>
    );
  }

  if (phase === 'results') {
    return (
      <Screen scroll style={[styles.flowScreen, flowTopPad]}>
        <Text style={[styles.kicker, { color: colors.textMuted, fontFamily: typography.medium }]}>
          {t('tutor.boundaryResult') || 'YOUR STARTING POINT'}
        </Text>
        <Text style={[styles.resultTitle, { color: colors.text, fontFamily: typography.display }]}>
          {t('tutor.boundaryReady') || 'Your learning path is ready'}
        </Text>
        <Text style={[styles.body, { color: colors.textMuted, fontFamily: typography.body }]}>
          {t('tutor.boundaryReadyBody') || 'This diagnostic is only a baseline depth cue. Socrates will still teach every sub-topic from its foundation.'}
        </Text>
        {/* Baseline-not-mastery notice — the diagnostic only sets depth cues;
         * the tutor still teaches every sub-topic from its foundation. */}
        <View style={[styles.notice, { backgroundColor: withAlpha(colors.accent, 0.08), borderColor: withAlpha(colors.accent, 0.3), borderRadius: radius.md }]}>
          <Text style={[styles.noticeText, { color: colors.textMuted, fontFamily: typography.body }]}>
            {tt(t, 'tutor.baselineNotice', 'Baseline, not mastery — even strong answers start from the core definition.')}
          </Text>
        </View>
        <View style={[styles.resultGrid, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
          <View style={styles.resultCell}>
            <Text style={[styles.resultValue, { color: colors.success }]}>{resultCounts.internalized}</Text>
            <Text style={[styles.resultLabel, { color: colors.textMuted }]}>{t('knowledge.internalized')}</Text>
          </View>
          <View style={styles.resultCell}>
            <Text style={[styles.resultValue, { color: colors.warning }]}>{resultCounts.fuzzy}</Text>
            <Text style={[styles.resultLabel, { color: colors.textMuted }]}>{t('knowledge.fuzzy')}</Text>
          </View>
          <View style={styles.resultCell}>
            <Text style={[styles.resultValue, { color: colors.textSubtle }]}>{resultCounts.blank}</Text>
            <Text style={[styles.resultLabel, { color: colors.textMuted }]}>{t('knowledge.blank')}</Text>
          </View>
        </View>

        <View style={styles.nodeList}>
          {resultNodes.map((node, nodeIndex) => (
            <View key={node.name} style={[styles.nodeRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.nodeIndex, { borderColor: colors.border }]}>
                <Text style={{ color: colors.textSubtle, fontSize: 10 }}>{nodeIndex + 1}</Text>
              </View>
              <Text style={[styles.nodeName, { color: colors.text, fontFamily: typography.medium }]}>{node.name}</Text>
              <Text
                style={[
                  styles.nodeStatus,
                  {
                    color: node.status === 'internalized'
                      ? colors.success
                      : node.status === 'fuzzy'
                        ? colors.warning
                        : colors.textSubtle,
                    fontFamily: typography.medium,
                  },
                ]}
              >
                {t(STATUS_KEY[node.status] || 'knowledge.blank')}
              </Text>
            </View>
          ))}
        </View>

        {localError ? <Text style={[styles.error, { color: colors.danger }]}>{localError}</Text> : null}
        <AnimatedPressable
          onPress={() => void startTeaching(nodes, questions, answers)}
          style={[styles.primaryButton, { backgroundColor: colors.text, borderRadius: radius.md }]}
        >
          <Text style={[styles.primaryButtonText, { color: colors.background, fontFamily: typography.semibold }]}>
            {t('tutor.beginTeaching') || 'Begin teaching'}
          </Text>
        </AnimatedPressable>
      </Screen>
    );
  }

  return (
    <Screen scroll style={[styles.flowScreen, flowTopPad]}>
      <Text style={[styles.kicker, { color: colors.accent, fontFamily: typography.medium }]}>
        {t('tutor.kickerMode') || 'TUTOR MODE'}
      </Text>
      <Text style={[styles.heading, { color: colors.text, fontFamily: typography.display }]}>
        {topic || t('tutor.heading') || 'Learn with Socrates'}
      </Text>
      <Text style={[styles.body, { color: colors.textMuted, fontFamily: typography.body }]}>
        {t('tutor.body') || 'Build understanding from foundations through practice and checks.'}
      </Text>

      {/* Six stages crammed into one row were illegible (~9.5px labels);
       * a horizontal strip keeps every label readable. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.steps}>
        {STAGES.map(([id, labelKey], index) => (
          <View key={id} style={styles.step}>
            <View
              style={[
                styles.stepDot,
                {
                  backgroundColor: id === stage ? colors.accent : colors.surfaceRaised,
                  borderColor: id === stage ? colors.accent : colors.border,
                },
              ]}
            >
              <Text style={{ color: id === stage ? colors.background : colors.textSubtle, fontSize: 11 }}>{index + 1}</Text>
            </View>
            <Text style={[styles.stepText, { color: id === stage ? colors.text : colors.textSubtle }]}>
              {t(labelKey)}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Web `.teaching-plan` (`tutorSocratic.js:519-570`): progress, per
       * sub-topic status, the live stage, and the 3-answer depth counter that
       * actually gates advancement — without it progress looks arbitrary. */}
      {teachingPlan?.subtopics?.length ? (() => {
        const planDone = teachingPlan.subtopics.filter((subtopic) => subtopic.status === 'internalized').length;
        const planPct = Math.round((planDone / teachingPlan.subtopics.length) * 100);
        return (
        <View style={[styles.planCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
          <Text style={[styles.planTitle, { color: colors.text, fontFamily: typography.semibold }]}>{t('tutor.planTitle')}</Text>
          <View style={styles.planProgressRow}>
            <View style={[styles.planTrack, { backgroundColor: colors.surfaceRaised }]}>
              <View style={[styles.planFill, { backgroundColor: colors.accent, width: `${planPct}%` }]} />
            </View>
            <Text style={[styles.planProgressText, { color: colors.textMuted }]}>
              {`${planDone} / ${teachingPlan.subtopics.length} (${planPct}%)`}
            </Text>
          </View>
          {teachingPlan.subtopics.map((subtopic, index) => {
            const done = subtopic.status === 'internalized';
            const current = index === teachingPlan.currentSubtopicIdx && !done;
            const stageKey = STAGES.find(([id]) => id === stage)?.[1] || 'tutor.stageMotivate';
            return (
              <View key={`${subtopic.name}-${index}`} style={styles.planRow}>
                <Text style={[styles.planMarker, { color: done ? colors.success : current ? colors.accent : colors.textSubtle }]}>
                  {done ? t('tutor.done') : current ? '>' : '·'}
                </Text>
                <Text numberOfLines={1} style={[styles.planName, { color: done || current ? colors.text : colors.textMuted, fontFamily: typography.medium }]}>
                  {subtopic.name}
                </Text>
                <Text style={[styles.planStatus, { color: subtopic.status === 'internalized' ? colors.success : subtopic.status === 'fuzzy' ? colors.warning : colors.textSubtle }]}>
                  {t(STATUS_KEY[subtopic.status] || 'knowledge.blank')}
                </Text>
                {current ? (
                  <Text style={[styles.planStage, { color: colors.textSubtle }]}>{`${t(stageKey)} · ${Math.min(substantiveCount, 3)}/3`}</Text>
                ) : null}
              </View>
            );
          })}
          {practicePhase ? (
            <Text style={[styles.practiceChip, { color: colors.textMuted, backgroundColor: colors.surfaceRaised, borderRadius: radius.pill }]}>
              {`${t(practicePhase === 'foundation' ? 'tutor.practiceFoundation' : 'tutor.practiceTransfer')} · ${practiceAttempts}`}
            </Text>
          ) : null}
        </View>
        );
      })() : null}

      {existingNodes.length ? (
        <View style={[styles.resultGrid, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
          <View style={styles.resultCell}>
            <Text style={[styles.resultValue, { color: colors.success }]}>{existingCounts.internalized}</Text>
            <Text style={[styles.resultLabel, { color: colors.textMuted }]}>{t('knowledge.internalized')}</Text>
          </View>
          <View style={styles.resultCell}>
            <Text style={[styles.resultValue, { color: colors.accent }]}>{existingCounts.fuzzy}</Text>
            <Text style={[styles.resultLabel, { color: colors.textMuted }]}>{t('knowledge.fuzzy')}</Text>
          </View>
          <View style={styles.resultCell}>
            <Text style={[styles.resultValue, { color: colors.textSubtle }]}>{existingCounts.blank}</Text>
            <Text style={[styles.resultLabel, { color: colors.textMuted }]}>{t('knowledge.blank')}</Text>
          </View>
        </View>
      ) : null}

      {activeSessionMode === 'tutor' && activeSessionMessagesLength ? (
        <AnimatedPressable
          onPress={() => navigation.navigate('Chat')}
          style={[styles.primaryButton, { backgroundColor: colors.text, borderRadius: radius.md }]}
        >
          <Text style={[styles.primaryButtonText, { color: colors.background, fontFamily: typography.semibold }]}>
            {t('tutor.continue') || 'Continue teaching'}
          </Text>
        </AnimatedPressable>
      ) : (
        <AnimatedPressable
          onPress={() => {
            appStore.startNewSession('tutor', true);
            navigation.navigate('Home');
          }}
          style={[styles.primaryButton, { backgroundColor: colors.text, borderRadius: radius.md }]}
        >
          <Text style={[styles.primaryButtonText, { color: colors.background, fontFamily: typography.semibold }]}>
            {t('tutor.chooseTopic') || 'Choose a topic'}
          </Text>
        </AnimatedPressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flowScreen: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 32,
  },
  centerScreen: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '600',
  },
  heading: {
    fontSize: 30,
    lineHeight: 38,
    marginTop: 10,
    fontWeight: '400',
  },
  topic: {
    marginTop: 12,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '400',
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    marginTop: 9,
  },
  dialogCard: {
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 34,
    padding: 20,
  },
  dialogKicker: {
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  dialogTitle: {
    fontSize: 22,
    lineHeight: 28,
    marginTop: 8,
  },
  countRow: {
    minHeight: 68,
    marginTop: 22,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  countCopy: {
    flex: 1,
  },
  countTitle: {
    fontSize: 14,
  },
  countHint: {
    fontSize: 11,
    marginTop: 3,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGlyph: {
    fontSize: 21,
    lineHeight: 24,
  },
  countValue: {
    width: 22,
    textAlign: 'center',
    fontSize: 15,
  },
  dialogActions: {
    marginTop: 24,
    gap: 10,
  },
  primaryButton: {
    minHeight: 48,
    marginTop: 24,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
  },
  secondaryButton: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    fontSize: 14,
  },
  generatingTitle: {
    marginTop: 18,
    fontSize: 18,
  },
  generatingHint: {
    marginTop: 6,
    fontSize: 12,
  },
  progressTrack: {
    width: '72%',
    height: 3,
    borderRadius: 2,
    marginTop: 18,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  questionMeta: {
    marginTop: 18,
  },
  questionProgress: {
    fontSize: 12,
  },
  questionProgressTrack: {
    height: 3,
    marginTop: 8,
    borderRadius: 2,
    overflow: 'hidden',
  },
  questionProgressFill: {
    height: 3,
    borderRadius: 2,
  },
  questionCard: {
    marginTop: 22,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  knowledgePoint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
  },
  options: {
    gap: 10,
    marginTop: 20,
  },
  option: {
    minHeight: 64,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionLetter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextWrap: {
    flex: 1,
  },
  questionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 26,
    gap: 8,
  },
  textButton: {
    minHeight: 42,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButtonLabel: {
    fontSize: 13,
  },
  nextButton: {
    minWidth: 92,
    minHeight: 42,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  nextButtonLabel: {
    fontSize: 13,
  },
  disabled: {
    opacity: 0.35,
  },
  resultTitle: {
    marginTop: 12,
    fontSize: 28,
    lineHeight: 36,
  },
  resultGrid: {
    minHeight: 96,
    marginTop: 26,
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
  },
  resultCell: {
    flex: 1,
    alignItems: 'center',
  },
  resultValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  resultLabel: {
    marginTop: 4,
    fontSize: 11,
    textAlign: 'center',
  },
  nodeList: {
    marginTop: 22,
  },
  nodeRow: {
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nodeName: {
    flex: 1,
    fontSize: 13,
  },
  nodeStatus: {
    fontSize: 11,
    textTransform: 'uppercase',
  },
  planCard: { marginTop: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  planTitle: { fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
  planProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  planFill: { height: 4, borderRadius: 2 },
  planProgressText: { fontSize: 11 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  planMarker: { fontSize: 11, minWidth: 34, textAlign: 'left' },
  planName: { fontSize: 13, flex: 1, minWidth: 0 },
  planStatus: { fontSize: 11 },
  planStage: { fontSize: 11 },
  practiceChip: { alignSelf: 'flex-start', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  steps: {
    flexDirection: 'row',
    gap: 18,
    paddingTop: 30,
    paddingBottom: 4,
  },
  step: {
    alignItems: 'center',
    gap: 8,
  },
  stepDot: {
    width: 29,
    height: 29,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontSize: 11,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  errorRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  error: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  retryButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    fontSize: 12,
  },
  notice: {
    marginTop: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 18,
  },
  nodeIndex: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
