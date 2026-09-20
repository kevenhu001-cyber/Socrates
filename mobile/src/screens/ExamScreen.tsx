import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ModelPickerModal } from '../components/ModelPickerModal';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { appStore, useAppStore } from '../stores/appStore';
import { native } from '../native/native';
import type { JsonObject, JsonValue } from '@socrates/contracts';
import { generateExam, gradeExam, type ExamQuestion } from '../data/exam/examGenerator';
import { sessionsApi } from '../data/api/client';

type Mode = 'setup' | 'generating' | 'answering' | 'results';

const QUESTION_TYPE_KEY: Record<string, string> = {
  'multiple-choice': 'exam.typeMc',
  'fill-blank': 'exam.typeFb',
  'short-answer': 'exam.typeSa',
};

/* P1 1:1 — mirrors `frontend/src/exam.js:232-235` (4 difficulties),
 * `adjustExamCount` clamp 1..50 (`exam.js:373-383`), type pills
 * mc/fb/sa default mc+fb (`exam.js:12,293-300`, at least one kept),
 * and the optional instructions textarea (`exam.js:302-306`). */
const DIFFICULTIES: Array<[string, string]> = [
  ['beginner', 'exam.difficultyBeginner'],
  ['intermediate', 'exam.difficultyIntermediate'],
  ['hard', 'exam.difficultyHard'],
  ['expert', 'exam.difficultyExpert'],
];

const QUESTION_TYPES: Array<['mc' | 'fb' | 'sa', string, string, string]> = [
  ['mc', 'multiple-choice', 'exam.typeMc', 'Choose one answer'],
  ['fb', 'fill-blank', 'exam.typeFb', 'Recall key terms'],
  ['sa', 'short-answer', 'exam.typeSa', 'Explain your reasoning'],
];

/* i18n keys for the sectioned setup form are not in strings.ts yet; translate
 * falls back to the key itself, so check before falling through to English. */
function tt(t: (key: string, vars?: Record<string, string | number>) => string, key: string, fallback: string): string {
  const value = t(key);
  return value === key ? fallback : value;
}

/* Pulsing dots — mirrors `.loading span` in `frontend/src/styles.css` used by
 * the exam generating view instead of a spinner orb. */
function PulsingDots({ color }: { color: string }) {
  const a = useRef(new Animated.Value(0.3)).current;
  const b = useRef(new Animated.Value(0.3)).current;
  const c = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const pulse = (v: Animated.Value, delay: number) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        Animated.delay(800 - delay),
      ]),
    );
    const animations = Animated.parallel([pulse(a, 0), pulse(b, 160), pulse(c, 320)]);
    animations.start();
    return () => animations.stop();
  }, [a, b, c]);
  return (
    <View style={styles.dots}>
      {[a, b, c].map((v, i) => (
        <Animated.View key={i} style={[styles.dot, { backgroundColor: color, opacity: v }]} />
      ))}
    </View>
  );
}

export function ExamScreen({ navigation }: { navigation: any }) {
  const { colors, radius, spacing, typography } = useTheme();
  const t = useT();
  /* P0 perf — focused selectors. The previous `useAppStore()` subscription
   * re-rendered this screen on every keystroke or streaming token committed
   * by the chat tutor. */
  const providers = useAppStore((s) => s.providers);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const currentProvider = providers.find((provider) => provider.id === selectedModel);
  const currentModelName = currentProvider ? ((currentProvider.label && currentProvider.label !== 'Default') ? currentProvider.label : (currentProvider.model || currentProvider.label || 'Model')) : 'Model';
  const [mode, setMode] = useState<Mode>('setup');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('intermediate');
  const [count, setCount] = useState(5);
  const [selectedTypes, setSelectedTypes] = useState<{ mc: boolean; fb: boolean; sa: boolean }>({ mc: true, fb: true, sa: false });
  const [instructions, setInstructions] = useState('');
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [current, setCurrent] = useState(0);
  /* Questions finished so far while generating (null = still preparing).
   * Mirrors web `updateProgress(i)` (`exam.js:500-512`). */
  const [genDone, setGenDone] = useState<number | null>(null);
  const [grade, setGrade] = useState<{ correct: number; total: number; results: Array<{ index: number; correct: boolean; answer: string; expected: string[] }> } | null>(null);
  const [error, setError] = useState('');
  const [abandonArmed, setAbandonArmed] = useState(false);
  const sessionId = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (mode === 'answering' || mode === 'generating') {
          /* Destructive step uses the themed ConfirmDialog (same copy
           * as the old Alert), not a native sheet. */
          setAbandonArmed(true);
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [mode]),
  );

  const confirmAbandon = useCallback(() => {
    setAbandonArmed(false);
    abortRef.current?.abort();
    setMode('setup');
    setQuestions([]);
    setAnswers({});
    setCurrent(0);
    setGrade(null);
    navigation.goBack();
  }, [navigation]);

  const toggleType = (key: 'mc' | 'fb' | 'sa') => {
    setSelectedTypes((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      /* Keep at least one response format (`exam.js:355-363`). */
      if (!next.mc && !next.fb && !next.sa) return prev;
      return next;
    });
  };

  const activeTypes = QUESTION_TYPES.filter(([key]) => selectedTypes[key]).map(([, value]) => value as 'multiple-choice' | 'fill-blank' | 'short-answer');

  const start = async () => {
    if (!topic.trim()) { setError(t('exam.needTopic')); return; }
    /* P_exam-noprovider — mirrors `exam.js:405-414`: gate generation on a
     * usable active provider instead of entering the loading view and
     * failing there. */
    if (!currentProvider) { setError(t('exam.noProvider')); return; }
    if (!activeTypes.length) { setError(t('exam.needType') || 'Select at least one question type'); return; }
    setError(''); setMode('generating'); setGenDone(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const generated = await generateExam({ topic: topic.trim(), count, difficulty, types: activeTypes, instructions: instructions.trim() || undefined, onProgress: (done) => setGenDone(done), signal: controller.signal });
      sessionId.current = generated.sessionId;
      setQuestions(generated.questions); setAnswers({}); setCurrent(0); setMode('answering');
      await native.vibrate('success');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('exam.failedToGenerate'));
      setMode('setup');
    } finally { abortRef.current = null; }
  };

  const submit = async () => {
    const result = gradeExam(questions, answers);
    setGrade(result); setMode('results');
    if (sessionId.current) {
      try {
        await sessionsApi.patch(sessionId.current, {
          examData: {
            topic,
            difficulty,
            count,
            types: activeTypes,
            instructions: instructions.trim() || undefined,
            questions: questions as unknown as JsonValue[],
            answers: answers as unknown as JsonObject,
            submitted: true,
            results: result as unknown as JsonValue,
          },
        });
      } catch (patchErr) {
        console.warn('[Exam] Failed to save exam results:', patchErr);
      }
    }
  };

  if (mode === 'generating') return (
    <Screen style={styles.screen}>
      <AppHeader title={t('sidebar.nav.exam')} onNewChat={() => navigation.navigate('Home')} />
      <View style={styles.center}>
      <PulsingDots color={colors.accent} />
      {/* 1:1 Parity with the web generating card (`exam.js:459-465`,
       * `updateProgress` at `exam.js:500-512`): title, real per-question
       * progress bar (92 * done / count), a step label, and a sub message —
       * no fabricated percentage. */}
      <Text style={[styles.generatingMsg, { color: colors.textMuted }]}>{t('exam.generating')}</Text>
      <View style={[styles.progressTrack, { backgroundColor: withAlpha(colors.border, 0.25) }]}><View style={[styles.progressFill, { backgroundColor: colors.accent, width: `${genDone != null ? Math.round(92 * genDone / Math.max(1, count)) : 0}%` }]} /></View>
      <Text style={[styles.genStep, { color: colors.text }]}>{genDone == null ? t('exam.genPreparing') : t('exam.genStep', { n: genDone + 1 })}</Text>
      <Text style={[styles.genSub, { color: colors.textSubtle }]}>{genDone == null ? t('exam.genSubPrep') : t('exam.genSub', { n: genDone + 1, count })}</Text>
      <AnimatedPressable onPress={() => { abortRef.current?.abort(); setMode('setup'); }} style={[styles.secondaryButton, { borderColor: colors.border, borderRadius: radius.md }]}><Text style={{ color: colors.textMuted }}>{t('common.cancel')}</Text></AnimatedPressable>
      </View>
      <ConfirmDialog
        visible={abandonArmed}
        title={t('exam.abandonTitle') || 'Abandon exam?'}
        message={t('exam.abandonBody') || 'Your current answers will be lost.'}
        confirmLabel={t('common.discard') || 'Discard'}
        cancelLabel={t('common.cancel') || 'Cancel'}
        danger
        onCancel={() => setAbandonArmed(false)}
        onConfirm={confirmAbandon}
      />
    </Screen>
  );

  if (mode === 'answering' && questions.length) {
    const question = questions[current];
    const answer = answers[current] || '';
    const answeredCount = Object.keys(answers).filter((k) => String(answers[Number(k)] || '').trim()).length;
    return (
      <Screen style={styles.screen}>
        <AppHeader title={t('sidebar.nav.exam')} onNewChat={() => navigation.navigate('Home')} />
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.formContainer}>
        <Text style={[styles.kicker, { color: colors.accent }]}>{t('exam.kickerPractice')} · {current + 1} / {questions.length} · {answeredCount}/{questions.length}</Text>
        <Text style={[styles.heading, { color: colors.text, fontFamily: typography.display }]}>{topic}</Text>
        {/* Question nav pills — mirrors frontend `.exam-nav-bar` pills so
         * long papers can jump instead of paging one-by-one. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navPills} keyboardShouldPersistTaps="handled">
          {questions.map((_, index) => {
            const isCurrent = index === current;
            const isAnswered = String(answers[index] || '').trim().length > 0;
            return (
              <AnimatedPressable
                key={index}
                accessibilityRole="button"
                accessibilityLabel={`Question ${index + 1}`}
                accessibilityState={{ selected: isCurrent }}
                onPress={() => setCurrent(index)}
                style={[
                  styles.navPill,
                  {
                    borderColor: isCurrent ? colors.accent : isAnswered ? withAlpha(colors.success, 0.5) : colors.border,
                    backgroundColor: isCurrent ? colors.accentSoft : isAnswered ? withAlpha(colors.success, 0.08) : 'transparent',
                    borderRadius: radius.pill,
                  },
                ]}
              >
                <Text style={[styles.navPillText, { color: isCurrent ? colors.accent : isAnswered ? colors.success : colors.textMuted }]}>{index + 1}{isAnswered && !isCurrent ? ' ·' : ''}</Text>
              </AnimatedPressable>
            );
          })}
        </ScrollView>
        <View style={[styles.questionCard, { backgroundColor: colors.surface, borderColor: withAlpha(colors.border, 0.3), borderRadius: radius.lg, padding: spacing.lg }]}>
          <Text style={[styles.questionType, { color: colors.textSubtle }]}>{t(QUESTION_TYPE_KEY[question.type] || question.type)}</Text>
          <Text style={[styles.question, { color: colors.text }]}>{question.q}</Text>
          {question.type === 'multiple-choice' ? question.opts?.map((option) => {
            const isSelected = answer === option.letter;
            return (
              /* frontend `.exam-q-opt { padding: 10px 12px; border-radius: 8px }`,
               * `.exam-q-opt-letter` is an 18px square at radius 3. */
              <AnimatedPressable
                key={option.letter}
                onPress={() => setAnswers({ ...answers, [current]: option.letter })}
                style={[
                  styles.option,
                  {
                    borderColor: isSelected ? colors.accent : withAlpha(colors.border, 0.4),
                    backgroundColor: isSelected ? colors.accentSoft : 'transparent',
                    borderRadius: 8,
                  },
                ]}
              >
                <View
                  style={[
                    styles.optionBadge,
                    { borderColor: withAlpha(colors.textSubtle, 0.35) },
                    isSelected && { backgroundColor: colors.accent, borderColor: colors.accent, borderWidth: 0 },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionLetterText,
                      { color: isSelected ? colors.background : colors.textMuted },
                    ]}
                  >
                    {option.letter}
                  </Text>
                </View>
                <Text style={[styles.optionText, { color: colors.text, fontFamily: typography.body }]}>{option.text}</Text>
              </AnimatedPressable>
            );
          }) : question.type === 'fill-blank' ? (
            <TextInput value={answer} onChangeText={(value) => setAnswers({ ...answers, [current]: value })} placeholder={t('exam.placeholderAnswer')} placeholderTextColor={colors.textSubtle} style={[styles.answerInput, styles.answerInputSingle, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]} />
          ) : (
            <TextInput multiline value={answer} onChangeText={(value) => setAnswers({ ...answers, [current]: value })} placeholder={t('exam.placeholderAnswer')} placeholderTextColor={colors.textSubtle} style={[styles.answerInput, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]} />
          )}
        </View>
        <View style={styles.questionActions}>
          {current > 0 ? <AnimatedPressable onPress={() => setCurrent(current - 1)} style={[styles.secondaryButton, { borderColor: colors.border, borderRadius: radius.md }]}><Text style={{ color: colors.textMuted }}>{t('common.previous')}</Text></AnimatedPressable> : <View />}
          {current < questions.length - 1
            ? <AnimatedPressable onPress={() => setCurrent(current + 1)} style={[styles.primaryButton, { backgroundColor: colors.text, borderRadius: radius.md }]}><Text style={{ color: colors.background, fontWeight: '700' }}>{t('common.next')}</Text></AnimatedPressable>
            : <AnimatedPressable onPress={submit} style={[styles.primaryButton, { backgroundColor: colors.accent, borderRadius: radius.md }]}><Text style={{ color: colors.background, fontWeight: '700' }}>{t('exam.seeResults')}</Text></AnimatedPressable>}
        </View>
        </View>
        </ScrollView>
        <ConfirmDialog
          visible={abandonArmed}
          title={t('exam.abandonTitle') || 'Abandon exam?'}
          message={t('exam.abandonBody') || 'Your current answers will be lost.'}
          confirmLabel={t('common.discard') || 'Discard'}
          cancelLabel={t('common.cancel') || 'Cancel'}
          danger
          onCancel={() => setAbandonArmed(false)}
          onConfirm={confirmAbandon}
        />
      </Screen>
    );
  }

  if (mode === 'results' && grade) return (
    <Screen style={styles.screen}>
      <AppHeader title={t('sidebar.nav.exam')} onNewChat={() => navigation.navigate('Home')} />
      <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.formContainer}>
      <Text style={[styles.kicker, { color: colors.accent }]}>{t('exam.kickerComplete')}</Text>
      <Text style={[styles.heading, { color: colors.text, fontFamily: typography.display }]}>{t('exam.resultsHeading')}</Text>
      {/* 1:1 Parity with frontend `.exam-score` (styles.css:2658-2661) —
       * plain block, no card chrome, "{pct}% correct" label. */}
      <View style={styles.score}>
        <View style={styles.scoreValRow}>
          <Text style={[styles.scoreVal, { color: colors.text, fontFamily: typography.semibold }]}>{grade.correct}</Text>
          <Text style={[styles.scoreTotal, { color: colors.textMuted }]}> / {grade.total}</Text>
        </View>
        <Text style={[styles.scoreLbl, { color: colors.textSubtle, fontFamily: typography.body }]}>
          {grade.total > 0 ? Math.round(grade.correct / grade.total * 100) : 0}% {t('exam.correctAnswers')}
        </Text>
      </View>
      {/* 1:1 Parity with frontend results `.exam-q-card` (exam.js:1007-1036):
       * full option list color-coded — green expected badge, red user's wrong
       * pick, selected marker; fb/sa answers get green/red bordered readonly
       * text with the expected answer below when wrong. */}
      {questions.map((question, index) => {
        const res = grade.results[index];
        const userAns = res?.answer || answers[index] || '';
        const expectedList = (res?.expected || []).filter((v) => String(v || '').trim());
        return (
          <View key={`${question.q}-${index}`} style={[styles.review, { borderBottomColor: withAlpha(colors.border, 0.2) }]}>
            <Text style={[styles.reviewNumber, { color: res?.correct ? colors.success : colors.danger }]}>
              {t('exam.questionN', { n: index + 1 })} · {res?.correct ? t('exam.correct') : t('exam.review')} · {t(QUESTION_TYPE_KEY[question.type] || question.type)}
            </Text>
            <Text style={[styles.reviewText, { color: colors.text }]}>{question.q}</Text>
            {question.type === 'multiple-choice' && question.opts?.length ? (
              <View style={styles.reviewOpts}>
                {question.opts.map((option) => {
                  const isExpected = question.answer === option.letter;
                  const isUserPick = userAns === option.letter || userAns === option.text;
                  const isWrongPick = isUserPick && !isExpected;
                  const tone = isExpected ? colors.success : isWrongPick ? colors.danger : null;
                  return (
                    <View
                      key={option.letter}
                      style={[
                        styles.reviewOpt,
                        {
                          borderColor: tone ? withAlpha(tone, 0.5) : withAlpha(colors.border, 0.4),
                          backgroundColor: tone ? withAlpha(tone, 0.08) : 'transparent',
                          borderRadius: 8,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.optionBadge,
                          { borderColor: withAlpha(colors.textSubtle, 0.35) },
                          tone && { backgroundColor: tone, borderColor: tone, borderWidth: 0 },
                        ]}
                      >
                        <Text style={[styles.optionLetterText, { color: tone ? colors.background : colors.textMuted }]}>
                          {option.letter}
                        </Text>
                      </View>
                      <Text style={[styles.optionText, { color: tone || colors.text, fontFamily: typography.body }]}>
                        {option.text}
                        {isExpected ? `  ✓` : isUserPick ? `  ${tt(t, 'exam.yourPick', '· your pick')}` : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <>
                <View
                  style={[
                    styles.reviewAnswerBox,
                    {
                      borderColor: res?.correct ? withAlpha(colors.success, 0.5) : withAlpha(colors.danger, 0.5),
                      borderRadius: radius.md,
                    },
                  ]}
                >
                  <Text style={{ color: colors.text, fontFamily: typography.body, fontSize: 13, lineHeight: 19 }}>
                    {userAns || '—'}
                  </Text>
                </View>
                {!res?.correct && expectedList.length ? (
                  <Text style={[styles.reviewExpected, { color: colors.success }]}>
                    {t('exam.correctAnswer')}: {expectedList.join(', ')}
                  </Text>
                ) : null}
              </>
            )}
            {question.explanation ? <Text style={[styles.explanation, { color: colors.textMuted }]}>{question.explanation}</Text> : null}
          </View>
        );
      })}
      <AnimatedPressable onPress={() => { setMode('setup'); setGrade(null); }} style={[styles.primaryButton, { backgroundColor: colors.text, borderRadius: radius.md, marginTop: 24 }]}><Text style={{ color: colors.background, fontWeight: '700' }}>{t('exam.newSet')}</Text></AnimatedPressable>
      </View>
      </ScrollView>
    </Screen>
  );

  return (
    <Screen style={styles.screen}>
      <AppHeader title={t('sidebar.nav.exam')} onNewChat={() => navigation.navigate('Home')} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.formContainer}>
      {/* Editorial hero — mirrors `.exam-form-hero` (exam.js:256-260). */}
      <Text style={[styles.heroEyebrow, { color: colors.accent }]}>{tt(t, 'exam.heroEyebrow', 'Assessment studio')}</Text>
      <Text style={[styles.heading, { color: colors.text, fontFamily: typography.display }]}>{t('exam.setupHeading')}</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{t('exam.setupBody')}</Text>
      {/* frontend `.exam-form-section` cards (styles.css:2461-2473): numbered
       * index chip + title + description per section. */}
      {(
        [
          ['01', t('exam.topic'), tt(t, 'exam.topicDesc', 'Name the subject or learning objective')],
        ] as const
      ).map(([index, title, desc]) => (
        <View key={index} style={[styles.setupCard, { backgroundColor: colors.surface, borderColor: withAlpha(colors.border, 0.3), borderRadius: 16, padding: spacing.lg }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIndex, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.sectionIndexText, { color: colors.accent }]}>{index}</Text>
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
              <Text style={[styles.sectionDesc, { color: colors.textSubtle }]}>{desc}</Text>
            </View>
          </View>
          <TextInput value={topic} onChangeText={setTopic} placeholder={t('exam.topicPlaceholder')} placeholderTextColor={colors.textSubtle} style={[styles.topicInput, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]} />
        </View>
      ))}

      <View style={[styles.setupCard, { backgroundColor: colors.surface, borderColor: withAlpha(colors.border, 0.3), borderRadius: 16, padding: spacing.lg }]}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIndex, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.sectionIndexText, { color: colors.accent }]}>02</Text>
          </View>
          <View style={styles.sectionHeaderCopy}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{tt(t, 'exam.paperSettings', 'Paper settings')}</Text>
            <Text style={[styles.sectionDesc, { color: colors.textSubtle }]}>{tt(t, 'exam.paperSettingsDesc', 'Select the model, difficulty, and length')}</Text>
          </View>
        </View>
        {/* Model — mirrors frontend exam model dropdown
         * (`exam.js:264-276`); generation uses the selected model. */}
        <Text style={[styles.label, { color: colors.textMuted, marginTop: 0 }]}>{t('settings.model')}</Text>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={currentModelName}
          onPress={() => setModelPickerOpen(true)}
          style={[styles.modelRow, { borderColor: colors.border, borderRadius: radius.md }]}
        >
          <Text numberOfLines={1} style={[styles.modelName, { color: colors.text }]}>{currentModelName}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </AnimatedPressable>
        <Text style={[styles.label, { color: colors.textMuted }]}>{t('exam.difficulty')}</Text>
        <View style={styles.difficultyGrid}>
          {DIFFICULTIES.map(([value, key]) => (
            /* frontend `.exam-seg-btn { border-radius: 9px }` */
              <AnimatedPressable key={value} onPress={() => setDifficulty(value)} style={[styles.segmentButton, styles.difficultyButton, { borderColor: difficulty === value ? colors.accent : colors.border, backgroundColor: difficulty === value ? colors.accentSoft : 'transparent', borderRadius: 9 }]}>
              <Text style={{ color: colors.text }}>{t(key)}</Text>
            </AnimatedPressable>
          ))}
        </View>
        <Text style={[styles.label, { color: colors.textMuted }]}>{t('exam.questionsCount', { count })}</Text>
        {/* frontend `.exam-stepper` (styles.css:2508-2512): bordered pill
         * container, ghost +/- buttons, tabular-nums value. */}
        <View style={[styles.stepper, { borderColor: withAlpha(colors.border, 0.4), borderRadius: 9, backgroundColor: colors.surfaceRaised }]}>
          <AnimatedPressable accessibilityLabel={t('exam.decreaseCount')} onPress={() => setCount(Math.max(1, count - 1))} style={styles.stepperButton}><Ionicons name="remove" size={18} color={colors.textMuted} /></AnimatedPressable>
          <Text style={[styles.count, { color: colors.text, fontVariant: ['tabular-nums'] }]}>{count}</Text>
          <AnimatedPressable accessibilityLabel={t('exam.increaseCount')} onPress={() => setCount(Math.min(50, count + 1))} style={styles.stepperButton}><Ionicons name="add" size={18} color={colors.textMuted} /></AnimatedPressable>
        </View>
      </View>

      <View style={[styles.setupCard, { backgroundColor: colors.surface, borderColor: withAlpha(colors.border, 0.3), borderRadius: 16, padding: spacing.lg }]}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIndex, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.sectionIndexText, { color: colors.accent }]}>03</Text>
          </View>
          <View style={styles.sectionHeaderCopy}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('exam.types')}</Text>
            <Text style={[styles.sectionDesc, { color: colors.textSubtle }]}>{tt(t, 'exam.typesDesc', 'Keep at least one response format')}</Text>
          </View>
        </View>
        {/* frontend `.exam-form-toggle-card` (styles.css:2516-2556): dot +
         * title + subtitle. */}
        <View style={styles.typeGrid}>
          {QUESTION_TYPES.map(([key, , labelKey, descFallback]) => {
            const selected = selectedTypes[key];
            return (
              <AnimatedPressable
                key={key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => toggleType(key)}
                style={[styles.typeCard, { borderColor: selected ? withAlpha(colors.accent, 0.5) : colors.border, backgroundColor: selected ? colors.accentSoft : 'transparent', borderRadius: 11 }]}
              >
                <View style={[styles.typeDot, { borderColor: selected ? colors.accent : colors.textSubtle, backgroundColor: selected ? colors.accent : 'transparent' }]} />
                <View style={styles.typeCopy}>
                  <Text style={[styles.typeTitle, { color: selected ? colors.accent : colors.text }]}>{t(labelKey)}</Text>
                  <Text style={[styles.typeDesc, { color: colors.textSubtle }]}>{tt(t, `exam.type${key.toUpperCase()}Desc`, descFallback)}</Text>
                </View>
              </AnimatedPressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.setupCard, { backgroundColor: colors.surface, borderColor: withAlpha(colors.border, 0.3), borderRadius: 16, padding: spacing.lg }]}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIndex, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.sectionIndexText, { color: colors.accent }]}>04</Text>
          </View>
          <View style={styles.sectionHeaderCopy}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('exam.instructions')}</Text>
            <Text style={[styles.sectionDesc, { color: colors.textSubtle }]}>{tt(t, 'exam.instructionsDesc', 'Optional constraints for the examiner')}</Text>
          </View>
        </View>
        <TextInput
          value={instructions}
          onChangeText={setInstructions}
          multiline
          numberOfLines={3}
          placeholder={t('exam.instructionsPlaceholder')}
          placeholderTextColor={colors.textSubtle}
          textAlignVertical="top"
          style={[styles.instructionsInput, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
        />
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        {/* Web parity (`exam.js:405-414`): without an active provider the
         * generate action is disabled and the user is told to configure a
         * model in Settings first. */}
        {!currentProvider ? <Text style={[styles.error, { color: colors.textMuted }]}>{t('exam.noProvider')}</Text> : null}
        <AnimatedPressable onPress={start} disabled={!currentProvider} disabledOpacity={0.5} style={[styles.primaryButton, { backgroundColor: colors.text, borderRadius: radius.md }]}><Text style={{ color: colors.background, fontWeight: '700' }}>{t('exam.generateSet')}</Text></AnimatedPressable>
      </View>
      </View>
      <ModelPickerModal
        visible={modelPickerOpen}
        providers={providers}
        selectedId={selectedModel}
        onSelect={(modelId) => { void appStore.setSelectedModel(modelId); }}
        onClose={() => setModelPickerOpen(false)}
        onManageSettings={() => navigation.navigate('Settings')}
      />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  page: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 28 },
  formContainer: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dots: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  generatingMsg: { fontSize: 13, lineHeight: 20, marginTop: 18, textAlign: 'center' },
  /* `.exam-progress-step` / `.exam-loading-sub` (styles.css, used by
   * `exam.js:462-464`). */
  genStep: { fontSize: 12, fontWeight: '600', marginTop: 12, textAlign: 'center' },
  genSub: { fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  heroEyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '800', textTransform: 'uppercase', paddingTop: 14, marginBottom: 9 },
  kicker: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700', paddingTop: 14 },
  heading: { fontSize: 32, lineHeight: 39, marginTop: 10 },
  body: { fontSize: 15, lineHeight: 23, marginTop: 10 },
  setupCard: { borderWidth: 1, marginTop: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  sectionIndex: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sectionIndexText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  sectionHeaderCopy: { flex: 1, gap: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '600', letterSpacing: -0.1 },
  sectionDesc: { fontSize: 11, lineHeight: 15 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  typeCard: { flexBasis: '48%', flexGrow: 1, borderWidth: 0.5, paddingHorizontal: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 7 },
  typeDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, flexShrink: 0 },
  typeCopy: { flex: 1, gap: 2 },
  typeTitle: { fontSize: 12, fontWeight: '600' },
  typeDesc: { fontSize: 10, lineHeight: 13 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  topicInput: { minHeight: 52, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  difficultyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  segmentButton: { flex: 1, minHeight: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  difficultyButton: { flexBasis: '48%', flexGrow: 1 },
  instructionsInput: { minHeight: 76, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, lineHeight: 20 },
  navPills: { flexDirection: 'row', gap: 8, paddingVertical: 12 },
  navPill: { minWidth: 36, height: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  navPillText: { fontSize: 13, fontWeight: '700' },
  modelRow: { minHeight: 52, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  modelName: { flex: 1, fontSize: 15, marginRight: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 0.5, padding: 4, alignSelf: 'flex-start' },
  stepperButton: { width: 34, height: 34, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 46, textAlign: 'center', fontSize: 15, fontWeight: '600' },
  primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondaryButton: { minHeight: 50, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  error: { fontSize: 13, lineHeight: 19, marginVertical: 12 },
  progressTrack: { width: 260, maxWidth: '100%', height: 3, borderRadius: 2, marginTop: 16, overflow: 'hidden' },
  progressFill: { height: '100%' },
  questionCard: { borderWidth: 1, marginTop: 24 },
  questionType: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  question: { fontSize: 19, lineHeight: 28, marginTop: 14 },
  option: { minHeight: 44, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10 },
  optionBadge: {
    width: 18,
    height: 18,
    borderRadius: 3,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  optionLetterText: {
    fontSize: 11,
    fontWeight: '500',
  },
  optionText: { flex: 1, fontSize: 13, lineHeight: 19 },
  answerInput: { minHeight: 120, borderWidth: 1, marginTop: 18, padding: 14, fontSize: 15, textAlignVertical: 'top' },
  answerInputSingle: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10 },
  questionActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 },
  score: {
    paddingVertical: 4,
    marginTop: 20,
    marginBottom: 12,
  },
  scoreValRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  scoreVal: {
    fontSize: 24,
    letterSpacing: -0.2,
  },
  scoreTotal: {
    fontSize: 15,
    fontWeight: '400',
  },
  scoreLbl: {
    fontSize: 12,
    marginTop: 3,
  },
  review: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  reviewNumber: { fontSize: 12, fontWeight: '700' },
  reviewText: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  reviewOpts: { gap: 8, marginTop: 12 },
  reviewOpt: { borderWidth: 0.5, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  reviewAnswerBox: { borderWidth: 0.5, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10 },
  reviewExpected: { fontSize: 12, lineHeight: 18, marginTop: 8, fontWeight: '700' },
  explanation: { fontSize: 13, lineHeight: 20, marginTop: 6 },
});
