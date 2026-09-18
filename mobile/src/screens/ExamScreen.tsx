import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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

const QUESTION_TYPES: Array<['mc' | 'fb' | 'sa', string, string]> = [
  ['mc', 'multiple-choice', 'exam.typeMc'],
  ['fb', 'fill-blank', 'exam.typeFb'],
  ['sa', 'short-answer', 'exam.typeSa'],
];

export function ExamScreen({ navigation }: { navigation: any }) {
  const { colors, radius, spacing, typography } = useTheme();
  const t = useT();
  const examState = useAppStore();
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const currentProvider = examState.providers.find((provider) => provider.id === examState.selectedModel);
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
  const [progress, setProgress] = useState(0);
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
    if (!activeTypes.length) { setError(t('exam.needType') || 'Select at least one question type'); return; }
    setError(''); setMode('generating'); setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const generated = await generateExam({ topic: topic.trim(), count, difficulty, types: activeTypes, instructions: instructions.trim() || undefined, onProgress: (done, total) => setProgress(Math.round(done / total * 100)), signal: controller.signal });
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
      <View style={[styles.loadingOrb, { borderColor: colors.accent }]}><ActivityIndicator color={colors.accent} size="large" /></View>
      <Text style={[styles.heading, { color: colors.text, fontFamily: typography.display }]}>{t('exam.buildingHeading')}</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{t('exam.buildingBody', { percent: progress })}</Text>
      <View style={[styles.progressTrack, { backgroundColor: colors.surfaceRaised }]}><View style={[styles.progressFill, { backgroundColor: colors.accent, width: `${Math.max(4, progress)}%` }]} /></View>
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
                    borderColor: isCurrent ? colors.accent : colors.border,
                    backgroundColor: isCurrent ? colors.accentSoft : isAnswered ? colors.surfaceRaised : 'transparent',
                    borderRadius: radius.pill,
                  },
                ]}
              >
                <Text style={[styles.navPillText, { color: isCurrent ? colors.accent : colors.textMuted }]}>{index + 1}</Text>
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
          }) : (
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
      {/* 1:1 Parity with frontend `.exam-score` (styles.css:2567-2570) */}
      <View style={[styles.score, { backgroundColor: colors.surface, borderColor: withAlpha(colors.border, 0.3), borderRadius: 16 }]}>
        <View style={styles.scoreValRow}>
          <Text style={[styles.scoreVal, { color: colors.text, fontFamily: typography.semibold }]}>{grade.correct}</Text>
          <Text style={[styles.scoreTotal, { color: colors.textMuted }]}> / {grade.total}</Text>
        </View>
        <Text style={[styles.scoreLbl, { color: colors.textSubtle, fontFamily: typography.body }]}>{t('exam.correctAnswers') || 'Correct answers'}</Text>
      </View>
      {questions.map((question, index) => {
        const res = grade.results[index];
        const userAns = res?.answer || answers[index] || '';
        const expectedList = (res?.expected || []).filter((v) => String(v || '').trim());
        return (
          <View key={`${question.q}-${index}`} style={[styles.review, { borderBottomColor: withAlpha(colors.border, 0.2) }]}>
            <Text style={[styles.reviewNumber, { color: res?.correct ? colors.success : colors.danger }]}>
              {t('exam.questionN', { n: index + 1 })} · {res?.correct ? t('exam.correct') : t('exam.review')}
            </Text>
            <Text style={[styles.reviewText, { color: colors.text }]}>{question.q}</Text>
            {/* frontend `exam.js:1030,1034` shows your answer + correct
             * answer when wrong; previously only the stem rendered. */}
            {userAns ? (
              <Text style={[styles.reviewAnswer, { color: colors.textMuted }]}>
                {t('exam.yourAnswer')}: {userAns}
              </Text>
            ) : null}
            {!res?.correct && expectedList.length ? (
              <Text style={[styles.reviewExpected, { color: colors.success }]}>
                {t('exam.correctAnswer')}: {expectedList.join(', ')}
              </Text>
            ) : null}
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
      <Text style={[styles.kicker, { color: colors.textSubtle }]}>{t('exam.kickerPractice')}</Text>
      <Text style={[styles.heading, { color: colors.text, fontFamily: typography.display }]}>{t('exam.setupHeading')}</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{t('exam.setupBody')}</Text>
      {/* frontend `.exam-form-section { border-radius: 16px }` */}
      <View style={[styles.setupCard, { backgroundColor: colors.surface, borderColor: withAlpha(colors.border, 0.3), borderRadius: 16, padding: spacing.lg }]}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{t('exam.topic')}</Text>
        <TextInput value={topic} onChangeText={setTopic} placeholder={t('exam.topicPlaceholder')} placeholderTextColor={colors.textSubtle} style={[styles.topicInput, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]} />
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
        <View style={styles.stepper}>
          <AnimatedPressable accessibilityLabel="Decrease question count" onPress={() => setCount(Math.max(1, count - 1))} style={[styles.stepperButton, { backgroundColor: colors.surfaceRaised, borderRadius: radius.pill }]}><Ionicons name="remove" size={20} color={colors.text} /></AnimatedPressable>
          <Text style={[styles.count, { color: colors.text }]}>{count}</Text>
          <AnimatedPressable accessibilityLabel="Increase question count" onPress={() => setCount(Math.min(50, count + 1))} style={[styles.stepperButton, { backgroundColor: colors.surfaceRaised, borderRadius: radius.pill }]}><Ionicons name="add" size={20} color={colors.text} /></AnimatedPressable>
        </View>
        <Text style={[styles.label, { color: colors.textMuted }]}>{t('exam.types')}</Text>
        <View style={styles.segment}>
          {QUESTION_TYPES.map(([key, , labelKey]) => {
            const selected = selectedTypes[key];
            return (
              <AnimatedPressable
                key={key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => toggleType(key)}
                style={[styles.segmentButton, { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : 'transparent', borderRadius: 9 }]}
              >
                <Text style={{ color: colors.text }}>{t(labelKey)}</Text>
              </AnimatedPressable>
            );
          })}
        </View>
        <Text style={[styles.label, { color: colors.textMuted }]}>{t('exam.instructions')}</Text>
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
        {/* Model — mirrors frontend exam model dropdown
         * (`exam.js:264-276`); generation uses the selected model. */}
        <Text style={[styles.label, { color: colors.textMuted }]}>{t('settings.model')}</Text>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={currentModelName}
          onPress={() => setModelPickerOpen(true)}
          style={[styles.modelRow, { borderColor: colors.border, borderRadius: radius.md }]}
        >
          <Text numberOfLines={1} style={[styles.modelName, { color: colors.text }]}>{currentModelName}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </AnimatedPressable>
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        <AnimatedPressable onPress={start} style={[styles.primaryButton, { backgroundColor: colors.text, borderRadius: radius.md }]}><Text style={{ color: colors.background, fontWeight: '700' }}>{t('exam.generateSet')}</Text></AnimatedPressable>
      </View>
      </View>
      <ModelPickerModal
        visible={modelPickerOpen}
        providers={examState.providers}
        selectedId={examState.selectedModel}
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
  loadingOrb: { width: 80, height: 80, borderWidth: 1, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  kicker: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700', paddingTop: 14 },
  heading: { fontSize: 32, lineHeight: 39, marginTop: 10 },
  body: { fontSize: 15, lineHeight: 23, marginTop: 10 },
  setupCard: { borderWidth: 1, marginTop: 28 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  topicInput: { minHeight: 52, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  segment: { flexDirection: 'row', gap: 6 },
  difficultyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  segmentButton: { flex: 1, minHeight: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  difficultyButton: { flexBasis: '48%', flexGrow: 1 },
  instructionsInput: { minHeight: 76, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, lineHeight: 20 },
  navPills: { flexDirection: 'row', gap: 8, paddingVertical: 12 },
  navPill: { minWidth: 36, height: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  navPillText: { fontSize: 13, fontWeight: '700' },
  modelRow: { minHeight: 52, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  modelName: { flex: 1, fontSize: 15, marginRight: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  stepperButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 24, textAlign: 'center', fontSize: 18, fontWeight: '700' },
  primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondaryButton: { minHeight: 50, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  error: { fontSize: 13, lineHeight: 19, marginVertical: 12 },
  progressTrack: { width: '100%', height: 6, borderRadius: 3, marginTop: 24, overflow: 'hidden' },
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
  questionActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 },
  score: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
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
  reviewAnswer: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  reviewExpected: { fontSize: 12, lineHeight: 18, marginTop: 4, fontWeight: '700' },
  explanation: { fontSize: 13, lineHeight: 20, marginTop: 6 },
});
