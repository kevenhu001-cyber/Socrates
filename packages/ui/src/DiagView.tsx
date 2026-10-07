import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getThemePaletteHex, type ThemeMode } from '@socrates/theme';
import type { DiagQuestion } from './tutor';
import { uiStrings, type UiLanguage } from './strings';

/* Cold-start diagnostic surface: one card per generated question with
 * A/B/C level options (internalized / fuzzy / blank). The host persists
 * the answers; submit folds them into the KB baseline and starts
 * teaching. Mirrors the ExamView shape without grading — diagnostic
 * levels are baselines, never scores. */
export function DiagView({ questions, answers: initial, mode = 'light', language = 'en', onChange, onSubmit }: {
  questions: DiagQuestion[];
  answers: Record<number, number>;
  mode?: ThemeMode;
  language?: UiLanguage;
  onChange?(answers: Record<number, number>): void;
  onSubmit?(answers: Record<number, number>): void;
}) {
  const p = getThemePaletteHex(mode);
  const t = uiStrings(language);
  const [answers, setAnswers] = useState<Record<number, number>>(() => ({ ...initial }));
  const [notice, setNotice] = useState('');
  const answered = useMemo(() => questions.filter((q, i) => answers[i] !== undefined).length, [questions, answers]);
  const pick = (index: number, opt: number) => {
    const next = { ...answers, [index]: opt };
    setAnswers(next);
    setNotice('');
    onChange?.(next);
  };
  const submit = () => {
    if (answered < questions.length) {
      setNotice(t.diagMissing);
      return;
    }
    onSubmit?.(answers);
  };
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
    <Text style={[styles.title, { color: p.text.primary }]}>{t.diagTitle}</Text>
    <Text style={{ color: p.text.muted }}>{t.diagAnsweredOf(answered, questions.length)}</Text>
    {questions.map((question, index) => (
      <View key={index} style={[styles.card, { borderColor: p.border.default, backgroundColor: p.bg.raised }]}>
        <Text style={[styles.question, { color: p.text.primary }]}>{`${index + 1}. ${question.q}`}</Text>
        {question.opts.map((opt, optIdx) => {
          const selected = answers[index] === optIdx;
          return <Pressable
            key={opt.letter}
            accessibilityRole="button"
            accessibilityLabel={t.diagOption(question.q, opt.letter)}
            accessibilityState={{ selected }}
            onPress={() => pick(index, optIdx)}
            style={[styles.opt, { borderColor: selected ? p.accent.strong : p.border.default }, selected && { backgroundColor: p.bg.hover }]}
          >
            <Text style={[styles.letter, { color: selected ? p.accent.strong : p.text.muted }]}>{opt.letter}</Text>
            <Text style={[styles.optText, { color: p.text.primary }]}>{opt.text}</Text>
          </Pressable>;
        })}
      </View>
    ))}
    {notice ? <Text accessibilityRole="alert" style={{ color: p.danger }}>{notice}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={t.diagSubmit} onPress={submit} style={[styles.submit, { backgroundColor: p.text.primary }]}>
      <Text style={[styles.submitText, { color: p.onAccent }]}>{t.diagSubmit}</Text>
    </Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  list: { gap: 12, padding: 16, paddingBottom: 120 },
  title: { fontSize: 20, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  question: { fontSize: 16, fontWeight: '600', lineHeight: 24 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 10, padding: 12 },
  letter: { fontSize: 16, fontWeight: '700', width: 22, textAlign: 'center' },
  optText: { flex: 1, fontSize: 15, lineHeight: 22 },
  submit: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  submitText: { fontSize: 16, fontWeight: '700' },
});
