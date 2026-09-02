import React, { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
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

const DIFFICULTIES: Array<[string, string]> = [
  ['beginner', 'exam.difficultyBeginner'],
  ['intermediate', 'exam.difficultyIntermediate'],
  ['advanced', 'exam.difficultyAdvanced'],
];

export function ExamScreen({ navigation }: { navigation: any }) {
  const { colors, radius, spacing, typography } = useTheme();
  const t = useT();
  const [mode, setMode] = useState<Mode>('setup');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('intermediate');
  const [count, setCount] = useState(5);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);
  const [grade, setGrade] = useState<{ correct: number; total: number; results: Array<{ index: number; correct: boolean; answer: string; expected: string[] }> } | null>(null);
  const [error, setError] = useState('');
  const sessionId = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = async () => {
    if (!topic.trim()) { setError(t('exam.needTopic')); return; }
    setError(''); setMode('generating'); setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const generated = await generateExam({ topic: topic.trim(), count, difficulty, types: ['multiple-choice', 'fill-blank', 'short-answer'], onProgress: (done, total) => setProgress(Math.round(done / total * 100)), signal: controller.signal });
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
            types: ['multiple-choice', 'fill-blank', 'short-answer'],
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
    </Screen>
  );

  if (mode === 'answering' && questions.length) {
    const question = questions[current];
    const answer = answers[current] || '';
    return (
      <Screen style={styles.screen}>
        <AppHeader title={t('sidebar.nav.exam')} onNewChat={() => navigation.navigate('Home')} />
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={[styles.kicker, { color: colors.accent }]}>{t('exam.kickerPractice')} · {current + 1} / {questions.length}</Text>
        <Text style={[styles.heading, { color: colors.text, fontFamily: typography.display }]}>{topic}</Text>
        <View style={[styles.questionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg }]}>
          <Text style={[styles.questionType, { color: colors.textSubtle }]}>{t(QUESTION_TYPE_KEY[question.type] || question.type)}</Text>
          <Text style={[styles.question, { color: colors.text }]}>{question.q}</Text>
          {question.type === 'multiple-choice' ? question.opts?.map((option) => (
            <AnimatedPressable key={option.letter} onPress={() => setAnswers({ ...answers, [current]: option.letter })} style={[styles.option, { borderColor: answer === option.letter ? colors.accent : colors.border, backgroundColor: answer === option.letter ? colors.accentSoft : colors.background, borderRadius: radius.md }]}>
              <Text style={[styles.optionLetter, { color: answer === option.letter ? colors.accent : colors.textMuted }]}>{option.letter}</Text>
              <Text style={[styles.optionText, { color: colors.text }]}>{option.text}</Text>
            </AnimatedPressable>
          )) : (
            <TextInput multiline value={answer} onChangeText={(value) => setAnswers({ ...answers, [current]: value })} placeholder={t('exam.placeholderAnswer')} placeholderTextColor={colors.textSubtle} style={[styles.answerInput, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]} />
          )}
        </View>
        <View style={styles.questionActions}>
          {current > 0 ? <AnimatedPressable onPress={() => setCurrent(current - 1)} style={[styles.secondaryButton, { borderColor: colors.border, borderRadius: radius.md }]}><Text style={{ color: colors.textMuted }}>{t('common.previous')}</Text></AnimatedPressable> : <View />}
          {current < questions.length - 1
            ? <AnimatedPressable onPress={() => setCurrent(current + 1)} style={[styles.primaryButton, { backgroundColor: colors.text, borderRadius: radius.md }]}><Text style={{ color: colors.background, fontWeight: '700' }}>{t('common.next')}</Text></AnimatedPressable>
            : <AnimatedPressable onPress={submit} style={[styles.primaryButton, { backgroundColor: colors.accent, borderRadius: radius.md }]}><Text style={{ color: colors.background, fontWeight: '700' }}>{t('exam.seeResults')}</Text></AnimatedPressable>}
        </View>
        </ScrollView>
      </Screen>
    );
  }

  if (mode === 'results' && grade) return (
    <Screen style={styles.screen}>
      <AppHeader title={t('sidebar.nav.exam')} onNewChat={() => navigation.navigate('Home')} />
      <ScrollView contentContainerStyle={styles.page}>
      <Text style={[styles.kicker, { color: colors.accent }]}>{t('exam.kickerComplete')}</Text>
      <Text style={[styles.heading, { color: colors.text, fontFamily: typography.display }]}>{t('exam.resultsHeading')}</Text>
      <View style={[styles.score, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
        <Text style={[styles.scoreValue, { color: colors.text }]}>{grade.correct} / {grade.total}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{t('exam.correctAnswers')}</Text>
      </View>
      {questions.map((question, index) => (
        <View key={`${question.q}-${index}`} style={[styles.review, { borderBottomColor: colors.border }]}>
          <Text style={[styles.reviewNumber, { color: grade.results[index]?.correct ? colors.success : colors.danger }]}>
            {t('exam.questionN', { n: index + 1 })} · {grade.results[index]?.correct ? t('exam.correct') : t('exam.review')}
          </Text>
          <Text style={[styles.reviewText, { color: colors.text }]}>{question.q}</Text>
          {question.explanation ? <Text style={[styles.explanation, { color: colors.textMuted }]}>{question.explanation}</Text> : null}
        </View>
      ))}
      <AnimatedPressable onPress={() => { setMode('setup'); setGrade(null); }} style={[styles.primaryButton, { backgroundColor: colors.text, borderRadius: radius.md, marginTop: 24 }]}><Text style={{ color: colors.background, fontWeight: '700' }}>{t('exam.newSet')}</Text></AnimatedPressable>
      </ScrollView>
    </Screen>
  );

  return (
    <Screen style={styles.screen}>
      <AppHeader title={t('sidebar.nav.exam')} onNewChat={() => navigation.navigate('Home')} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={[styles.kicker, { color: colors.textSubtle }]}>{t('exam.kickerPractice')}</Text>
      <Text style={[styles.heading, { color: colors.text, fontFamily: typography.display }]}>{t('exam.setupHeading')}</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{t('exam.setupBody')}</Text>
      <View style={[styles.setupCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg }]}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{t('exam.topic')}</Text>
        <TextInput value={topic} onChangeText={setTopic} placeholder={t('exam.topicPlaceholder')} placeholderTextColor={colors.textSubtle} style={[styles.topicInput, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]} />
        <Text style={[styles.label, { color: colors.textMuted }]}>{t('exam.difficulty')}</Text>
        <View style={styles.segment}>
          {DIFFICULTIES.map(([value, key]) => (
            <AnimatedPressable key={value} onPress={() => setDifficulty(value)} style={[styles.segmentButton, { borderColor: difficulty === value ? colors.accent : colors.border, backgroundColor: difficulty === value ? colors.accentSoft : colors.background, borderRadius: radius.md }]}>
              <Text style={{ color: colors.text }}>{t(key)}</Text>
            </AnimatedPressable>
          ))}
        </View>
        <Text style={[styles.label, { color: colors.textMuted }]}>{t('exam.questionsCount', { count })}</Text>
        <View style={styles.stepper}>
          <AnimatedPressable accessibilityLabel="Decrease question count" onPress={() => setCount(Math.max(1, count - 1))} style={[styles.stepperButton, { backgroundColor: colors.surfaceRaised, borderRadius: radius.pill }]}><Ionicons name="remove" size={20} color={colors.text} /></AnimatedPressable>
          <Text style={[styles.count, { color: colors.text }]}>{count}</Text>
          <AnimatedPressable accessibilityLabel="Increase question count" onPress={() => setCount(Math.min(10, count + 1))} style={[styles.stepperButton, { backgroundColor: colors.surfaceRaised, borderRadius: radius.pill }]}><Ionicons name="add" size={20} color={colors.text} /></AnimatedPressable>
        </View>
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        <AnimatedPressable onPress={start} style={[styles.primaryButton, { backgroundColor: colors.text, borderRadius: radius.md }]}><Text style={{ color: colors.background, fontWeight: '700' }}>{t('exam.generateSet')}</Text></AnimatedPressable>
      </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 }, page: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 28 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, loadingOrb: { width: 80, height: 80, borderWidth: 1, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }, kicker: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700', paddingTop: 14 }, heading: { fontSize: 32, lineHeight: 39, marginTop: 10 }, body: { fontSize: 15, lineHeight: 23, marginTop: 10 }, setupCard: { borderWidth: 1, marginTop: 28 }, label: { fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 8 }, topicInput: { minHeight: 52, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 }, segment: { flexDirection: 'row', gap: 6 }, segmentButton: { flex: 1, minHeight: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }, stepper: { flexDirection: 'row', alignItems: 'center', gap: 18 }, stepperButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, count: { minWidth: 24, textAlign: 'center', fontSize: 18, fontWeight: '700' }, primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }, secondaryButton: { minHeight: 50, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }, error: { fontSize: 13, lineHeight: 19, marginVertical: 12 }, progressTrack: { width: '100%', height: 6, borderRadius: 3, marginTop: 24, overflow: 'hidden' }, progressFill: { height: '100%' }, questionCard: { borderWidth: 1, marginTop: 24 }, questionType: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }, question: { fontSize: 19, lineHeight: 28, marginTop: 14 }, option: { minHeight: 54, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginTop: 10 }, optionLetter: { width: 26, fontWeight: '800' }, optionText: { flex: 1, fontSize: 15, lineHeight: 21 }, answerInput: { minHeight: 120, borderWidth: 1, marginTop: 18, padding: 14, fontSize: 15, textAlignVertical: 'top' }, questionActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }, score: { borderWidth: 1, alignItems: 'center', padding: 26, marginTop: 26 }, scoreValue: { fontSize: 42, fontWeight: '800' }, review: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth }, reviewNumber: { fontSize: 12, fontWeight: '700' }, reviewText: { fontSize: 15, lineHeight: 22, marginTop: 6 }, explanation: { fontSize: 13, lineHeight: 20, marginTop: 6 },
});
