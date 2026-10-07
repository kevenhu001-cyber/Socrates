import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getThemePaletteHex, type ThemeMode } from '@socrates/theme';
import type { ExamQuestionType } from '@socrates/ui';
import { useAppStrings } from './strings';

/* Exam setup: topic, question count, difficulty, question types and
 * instructions, then the per-question generation progress with cancel. The
 * generated exam becomes a new session owned by App. */

export interface ExamSetupInput {
  topic: string;
  count: number;
  difficulty: string;
  types: ExamQuestionType[];
  instructions: string;
}

export interface ExamRunState {
  running: boolean;
  progress: { done: number; total: number; phase: string } | null;
  error: string | null;
}

const COUNTS = [3, 5, 10];
const DIFFICULTIES = ['beginner', 'intermediate', 'hard', 'expert'] as const;

export function ExamSetupScreen({ mode, running, progress, error, onStart, onCancel, onClose }: {
  mode: ThemeMode;
  running: boolean;
  progress: ExamRunState['progress'];
  error: string | null;
  onStart(input: ExamSetupInput): void;
  onCancel(): void;
  onClose(): void;
}) {
  const p = getThemePaletteHex(mode);
  const s = useAppStrings();
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<string>('intermediate');
  const [types, setTypes] = useState<ExamQuestionType[]>(['multiple-choice', 'fill-blank']);
  const [instructions, setInstructions] = useState('');
  const difficultyLabels: Record<string, string> = {
    beginner: s.examBeginner, intermediate: s.examIntermediate, hard: s.examHard, expert: s.examExpert,
  };
  const toggleType = (type: ExamQuestionType) => setTypes((prev) => (prev.includes(type)
    ? (prev.length > 1 ? prev.filter((entry) => entry !== type) : prev)
    : [...prev, type]));
  const canStart = topic.trim().length > 0 && !running;
  const chip = (active: boolean) => [styles.chip, { borderColor: active ? p.accent.strong : p.border.default, backgroundColor: active ? p.bg.hover : 'transparent' }];

  return <View style={[styles.wrap, { backgroundColor: p.bg.page }]}>
    <View style={[styles.header, { borderBottomColor: p.border.default }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={s.backToChat} onPress={onClose} style={styles.back}>
        <Text style={[styles.backText, { color: p.text.primary }]}>‹</Text>
      </Pressable>
      <Text style={[styles.title, { color: p.text.primary }]}>{s.examSetupTitle}</Text>
      <View style={styles.back} />
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {running ? <View style={[styles.progressBox, { borderColor: p.border.default, backgroundColor: p.bg.sunken }]}>
        <ActivityIndicator color={p.text.muted} />
        <Text style={{ color: p.text.primary, fontWeight: '600' }}>{s.examGenerating}</Text>
        {progress ? <Text style={{ color: p.text.muted }}>{s.examProgressText(progress.done, progress.total)}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={s.cancel} onPress={onCancel} style={[styles.chip, { borderColor: p.border.default }]}>
          <Text style={{ color: p.text.primary, fontWeight: '600' }}>{s.cancel}</Text>
        </Pressable>
      </View> : <>
        <Text style={[styles.label, { color: p.text.muted }]}>{s.examTopicLabel}</Text>
        <TextInput
          accessibilityLabel={s.examTopicLabel}
          value={topic}
          onChangeText={setTopic}
          placeholder={s.examTopicPlaceholder}
          placeholderTextColor={p.text.muted}
          autoFocus
          style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]}
        />

        <Text style={[styles.label, { color: p.text.muted }]}>{s.examCountLabel}</Text>
        <View style={styles.rowWrap}>
          {COUNTS.map((option) => <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={s.examCountOption(option)}
            accessibilityState={{ selected: count === option }}
            onPress={() => setCount(option)}
            style={chip(count === option)}
          >
            <Text style={{ color: p.text.primary, fontWeight: '600' }}>{option}</Text>
          </Pressable>)}
        </View>

        <Text style={[styles.label, { color: p.text.muted }]}>{s.examDifficultyLabel}</Text>
        <View style={styles.rowWrap}>
          {DIFFICULTIES.map((option) => <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={difficultyLabels[option]}
            accessibilityState={{ selected: difficulty === option }}
            onPress={() => setDifficulty(option)}
            style={chip(difficulty === option)}
          >
            <Text style={{ color: p.text.primary }}>{difficultyLabels[option]}</Text>
          </Pressable>)}
        </View>

        <Text style={[styles.label, { color: p.text.muted }]}>{s.examTypesLabel}</Text>
        <View style={styles.rowWrap}>
          {([['multiple-choice', s.examTypeMc], ['fill-blank', s.examTypeFb], ['short-answer', s.examTypeSa]] as Array<[ExamQuestionType, string]>).map(([type, label]) => <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: types.includes(type) }}
            onPress={() => toggleType(type)}
            style={chip(types.includes(type))}
          >
            <Text style={{ color: p.text.primary }}>{label}</Text>
          </Pressable>)}
        </View>

        <Text style={[styles.label, { color: p.text.muted }]}>{s.examInstructionsLabel}</Text>
        <TextInput
          accessibilityLabel={s.examInstructionsLabel}
          value={instructions}
          onChangeText={setInstructions}
          placeholder={s.examInstructionsPlaceholder}
          placeholderTextColor={p.text.muted}
          multiline
          style={[styles.input, { borderColor: p.border.default, color: p.text.primary, minHeight: 64 }]}
        />

        {error ? <Text accessibilityRole="alert" style={{ color: p.danger }}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={s.examStart}
          disabled={!canStart}
          onPress={() => onStart({ topic: topic.trim(), count, difficulty, types, instructions: instructions.trim() })}
          style={[styles.start, { borderColor: p.accent.strong, backgroundColor: p.bg.hover, opacity: canStart ? 1 : 0.4 }]}
        >
          <Text style={{ color: p.accent.strong, fontWeight: '600' }}>{s.examStart}</Text>
        </Pressable>
      </>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 26 },
  title: { flex: 1, textAlign: 'center', fontWeight: '600', fontSize: 17 },
  content: { padding: 20, gap: 10, paddingBottom: 40, maxWidth: 768, width: '100%', alignSelf: 'center' },
  label: { fontSize: 12, fontWeight: '600', marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  progressBox: { borderWidth: 1, borderRadius: 12, padding: 20, gap: 10, alignItems: 'center' },
  start: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
});
