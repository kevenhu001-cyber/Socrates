import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ExamData } from '@socrates/contracts';
import { getThemePaletteHex, type ThemeMode } from '@socrates/theme';
import {
  examAnswersOf, examAnswerValue, examProgress, gradeExam, missingExamAnswers, parseExamQuestions,
  type ExamAnswerValue, type ExamAnswers, type ExamQuestion,
} from './examModel';
import { uiStrings, type UiLanguage } from './strings';

const green = (mode: ThemeMode) => (mode === 'dark' ? '#4cc38a' : '#1a7f4b');

/* Exam surface: renders the questions stored on the session, collects
 * answers (persisted by the host), and grades locally on submit — the same
 * client-side contract as the web baseline's exam panel. No generation here:
 * a session without `examData.questions` keeps the normal transcript. */
export function ExamView({ examData, mode = 'light', language = 'en', saving, onChange, onSubmit }: {
  examData: ExamData;
  mode?: ThemeMode;
  language?: UiLanguage;
  saving?: boolean;
  onChange?(examData: ExamData, immediate: boolean): void;
  onSubmit?(examData: ExamData): void;
}) {
  const p = getThemePaletteHex(mode);
  const t = uiStrings(language);
  const questions = useMemo(() => parseExamQuestions(examData), [examData]);
  const [answers, setAnswers] = useState<ExamAnswers>(() => examAnswersOf(examData));
  const [submitted, setSubmitted] = useState(examData.submitted === true);
  const [notice, setNotice] = useState('');
  const grade = useMemo(() => gradeExam(questions, answers), [questions, answers]);
  const progress = examProgress(questions, answers);
  const nextExamData = (nextAnswers: ExamAnswers, nextSubmitted: boolean): ExamData => ({
    ...examData,
    answers: nextAnswers as unknown as ExamData['answers'],
    submitted: nextSubmitted,
  });
  const answer = (question: ExamQuestion, value: ExamAnswerValue) => {
    const next = { ...answers, [question.index]: value };
    setNotice('');
    setAnswers(next);
    onChange?.(nextExamData(next, submitted), false);
  };
  const submit = () => {
    if (missingExamAnswers(questions, answers).length) { setNotice(t.examMissingAnswers); return; }
    setNotice('');
    setSubmitted(true);
    onSubmit?.(nextExamData(answers, true));
  };
  const typeLabel = (question: ExamQuestion): string => question.type === 'multiple-choice'
    ? t.examMultipleChoice : question.type === 'fill-blank' ? t.examFillBlank : t.examShortAnswer;

  return <ScrollView style={styles.wrap} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={[styles.summary, { borderColor: p.border.default, backgroundColor: p.bg.sunken }]}>
      <Text numberOfLines={2} style={[styles.title, { color: p.text.primary }]}>{examData.topic || t.examTitle}</Text>
      <Text style={{ color: p.text.muted }}>
        {submitted ? t.examScore(grade.correct, grade.total, grade.percent) : t.examAnsweredOf(progress.answered, progress.total)}
        {saving ? ` · ${t.examSaved}` : ''}
      </Text>
    </View>
    {questions.map((question, order) => {
      const verdict = submitted ? grade.results[question.index] : undefined;
      const value = answers[question.index];
      const selected = question.type === 'multiple-choice' ? examAnswerValue(question, value) : undefined;
      return <View key={question.index} style={[styles.card, { borderColor: p.border.default }]}>
        <View style={styles.cardHeadRow}>
          <Text style={[styles.cardHead, { color: p.text.muted }]}>
            {t.examQuestionOf(order + 1, questions.length)} · {typeLabel(question)}
          </Text>
          {verdict !== undefined ? <Text style={[styles.verdict, { color: verdict ? green(mode) : p.danger }]}>{verdict ? t.examCorrect : t.examIncorrect}</Text> : null}
        </View>
        <Text selectable style={[styles.prompt, { color: p.text.primary }]}>{question.prompt}</Text>
        {question.type === 'multiple-choice' ? question.options.map((option, index) => {
          const isCorrect = submitted && option.letter === question.answer;
          const isWrongPick = submitted && selected === index && !isCorrect;
          const isPicked = selected === index;
          const borderColor = isCorrect ? green(mode) : isWrongPick ? p.danger : isPicked ? p.accent.strong : p.border.default;
          return <Pressable
            key={`${question.index}-${index}`}
            accessibilityRole={submitted ? undefined : 'button'}
            accessibilityLabel={`${option.letter}. ${option.text}`}
            accessibilityState={submitted ? undefined : { selected: isPicked }}
            onPress={submitted ? undefined : () => answer(question, index)}
            style={[styles.option, { borderColor, backgroundColor: isPicked || isCorrect ? p.bg.hover : 'transparent' }]}
          >
            <Text style={{ color: p.text.muted, width: 22 }}>{option.letter}</Text>
            <Text style={{ color: p.text.primary, flex: 1 }}>{option.text}</Text>
          </Pressable>;
        }) : submitted ? (
          <View style={[styles.answerBox, { borderColor: verdict ? green(mode) : p.danger }]}>
            <Text selectable style={{ color: p.text.primary }}>{String(value ?? '')}</Text>
          </View>
        ) : (
          <TextInput
            accessibilityLabel={`Answer for question ${order + 1}`}
            value={typeof value === 'string' ? value : ''}
            onChangeText={(text) => answer(question, text)}
            placeholder={t.examAnswerPlaceholder}
            placeholderTextColor={p.text.muted}
            multiline={question.type === 'short-answer'}
            style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]}
          />
        )}
        {submitted && verdict === false && question.type !== 'multiple-choice' ? (
          <Text style={{ color: green(mode), fontSize: 13 }}>
            {t.examCorrectAnswer}: <Text style={{ fontWeight: '600' }}>{question.type === 'fill-blank' ? question.answers.join(', ') : question.answer}</Text>
          </Text>
        ) : null}
        {submitted && question.explanation ? (
          <Text style={[styles.explain, { color: p.text.secondary }]}>{t.examExplanation}: {question.explanation}</Text>
        ) : null}
      </View>;
    })}
    {notice ? <Text accessibilityRole="alert" style={{ color: p.danger }}>{notice}</Text> : null}
    {!submitted ? <Pressable accessibilityRole="button" accessibilityLabel={t.examSubmit} onPress={submit} style={[styles.submit, { borderColor: p.accent.strong, backgroundColor: p.bg.hover }]}>
      <Text style={{ color: p.accent.strong, fontWeight: '600' }}>{t.examSubmit}</Text>
    </Pressable> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48, maxWidth: 768, width: '100%', alignSelf: 'center' },
  summary: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  title: { fontSize: 17, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  cardHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardHead: { fontSize: 12, fontWeight: '600', flex: 1 },
  verdict: { fontSize: 12, fontWeight: '700' },
  prompt: { fontSize: 15, lineHeight: 22 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, minHeight: 42 },
  answerBox: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  explain: { fontSize: 13, lineHeight: 19 },
  submit: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
});
