import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getThemePaletteHex, type ThemeMode } from '@socrates/theme';
import { useAppStrings } from './strings';

/* Tutor setup: topic + question count, then per-question generation
 * progress with cancel. The generated diagnostic becomes a new tutor
 * session owned by App (diagnostic card first, teaching after submit). */

export interface TutorSetupInput {
  topic: string;
  count: number;
}

export interface TutorRunState {
  running: boolean;
  progress: { done: number; total: number; phase: string } | null;
  error: string | null;
}

const COUNTS = [3, 5];

export function TutorSetupScreen({ mode, running, progress, error, onStart, onCancel, onClose }: {
  mode: ThemeMode;
  running: boolean;
  progress: TutorRunState['progress'];
  error: string | null;
  onStart(input: TutorSetupInput): void;
  onCancel(): void;
  onClose(): void;
}) {
  const p = getThemePaletteHex(mode);
  const s = useAppStrings();
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const canStart = topic.trim().length > 0 && !running;
  const chip = (active: boolean) => [styles.chip, { borderColor: active ? p.accent.strong : p.border.default, backgroundColor: active ? p.bg.hover : 'transparent' }];

  return <View style={[styles.wrap, { backgroundColor: p.bg.page }]}>
    <View style={[styles.header, { borderBottomColor: p.border.default }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={s.backToChat} onPress={onClose} style={styles.back}>
        <Text style={[styles.backText, { color: p.text.primary }]}>‹</Text>
      </Pressable>
      <Text style={[styles.title, { color: p.text.primary }]}>{s.tutorSetupTitle}</Text>
      <View style={styles.back} />
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {running ? <View style={[styles.progressBox, { borderColor: p.border.default, backgroundColor: p.bg.sunken }]}>
        <ActivityIndicator color={p.text.muted} />
        <Text style={{ color: p.text.primary, fontWeight: '600' }}>{s.tutorGenerating}</Text>
        {progress ? <Text style={{ color: p.text.muted }}>{s.tutorProgressText(progress.done, progress.total)}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={s.cancel} onPress={onCancel} style={[styles.chip, { borderColor: p.border.default }]}>
          <Text style={{ color: p.text.primary, fontWeight: '600' }}>{s.cancel}</Text>
        </Pressable>
      </View> : <>
        <Text style={[styles.label, { color: p.text.muted }]}>{s.tutorTopicLabel}</Text>
        <TextInput
          accessibilityLabel={s.tutorTopicLabel}
          value={topic}
          onChangeText={setTopic}
          placeholder={s.tutorTopicPlaceholder}
          placeholderTextColor={p.text.muted}
          autoFocus
          style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]}
        />
        <Text style={[styles.hint, { color: p.text.muted }]}>{s.tutorSetupHint}</Text>

        <Text style={[styles.label, { color: p.text.muted }]}>{s.tutorCountLabel}</Text>
        <View style={styles.rowWrap}>
          {COUNTS.map((option) => <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={s.tutorCountOption(option)}
            accessibilityState={{ selected: count === option }}
            onPress={() => setCount(option)}
            style={chip(count === option)}
          >
            <Text style={{ color: p.text.primary, fontWeight: '600' }}>{option}</Text>
          </Pressable>)}
        </View>

        {error ? <Text accessibilityRole="alert" style={{ color: p.danger }}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={s.tutorStart}
          disabled={!canStart}
          onPress={() => onStart({ topic: topic.trim(), count })}
          style={[styles.start, { borderColor: p.accent.strong, backgroundColor: p.bg.hover, opacity: canStart ? 1 : 0.4 }]}
        >
          <Text style={{ color: p.accent.strong, fontWeight: '600' }}>{s.tutorStart}</Text>
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
  hint: { fontSize: 13, lineHeight: 20 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  progressBox: { borderWidth: 1, borderRadius: 12, padding: 20, gap: 10, alignItems: 'center' },
  start: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
});
