import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { appStore, useAppStore } from '../stores/appStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Tutor'>;

/** Teaching stage id (as the server reports it) paired with its label key. */
const STAGES = [
  ['motivate', 'tutor.stageMotivate'],
  ['define', 'tutor.stageDefine'],
  ['develop', 'tutor.stageDevelop'],
  ['illustrate', 'tutor.stageIllustrate'],
  ['exercise', 'tutor.stageExercise'],
  ['check', 'tutor.stageCheck'],
] as const;

export function TutorScreen({ navigation }: Props) {
  const { colors, radius, spacing } = useTheme();
  const t = useT();
  const state = useAppStore();
  const stage = state.activeSession?.teachingStage || 'motivate';
  const openTutorChat = () => { if (!state.activeSession || state.activeSession.mode !== 'tutor') appStore.startNewSession('tutor'); navigation.navigate('Chat'); };
  /* Knowledge summary — mirrors the web three-section KB view
   * (internalized / fuzzy / blank) in `tutorSocratic.js:226-247`.
   * Counts only; the force-graph stays web-only. */
  const kbRaw = state.activeSession?.kbNodes;
  const kbCounts = Array.isArray(kbRaw) ? (kbRaw as Array<{ status?: string }>).reduce(
    (acc, node) => {
      const s = String(node?.status || 'blank');
      if (s === 'internalized') acc.internalized += 1;
      else if (s === 'fuzzy') acc.fuzzy += 1;
      else acc.blank += 1;
      return acc;
    },
    { internalized: 0, fuzzy: 0, blank: 0 },
  ) : null;
  return (
    <Screen scroll>
      <Text style={[styles.kicker, { color: colors.accent }]}>{t('tutor.kickerMode')}</Text>
      <Text style={[styles.heading, { color: colors.text }]}>{t('tutor.heading')}</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{t('tutor.body')}</Text>
      <View style={styles.steps}>
        {STAGES.map(([id, labelKey], index) => (
          <View key={id} style={styles.step}>
            <View style={[styles.stepDot, { backgroundColor: id === stage ? colors.accent : colors.surfaceRaised, borderColor: id === stage ? colors.accent : colors.border }]}>
              <Text style={{ color: id === stage ? colors.background : colors.textSubtle, fontSize: 11 }}>{index + 1}</Text>
            </View>
            <Text style={[styles.stepText, { color: id === stage ? colors.text : colors.textSubtle }]}>{t(labelKey)}</Text>
          </View>
        ))}
      </View>
      {kbCounts && (kbCounts.internalized + kbCounts.fuzzy + kbCounts.blank) > 0 ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{t('tutor.kbHeading') || 'Knowledge map'}</Text>
          <View style={styles.kbRow}>
            <View style={styles.kbCell}>
              <Text style={[styles.kbValue, { color: colors.success }]}>{kbCounts.internalized}</Text>
              <Text style={[styles.kbLabel, { color: colors.textMuted }]}>{t('knowledge.internalized')}</Text>
            </View>
            <View style={styles.kbCell}>
              <Text style={[styles.kbValue, { color: colors.accent }]}>{kbCounts.fuzzy}</Text>
              <Text style={[styles.kbLabel, { color: colors.textMuted }]}>{t('knowledge.fuzzy')}</Text>
            </View>
            <View style={styles.kbCell}>
              <Text style={[styles.kbValue, { color: colors.textSubtle }]}>{kbCounts.blank}</Text>
              <Text style={[styles.kbLabel, { color: colors.textMuted }]}>{t('knowledge.blank')}</Text>
            </View>
          </View>
        </View>
      ) : null}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{t('tutor.boundary')}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{t('tutor.boundaryBody')}</Text>
        <AnimatedPressable onPress={openTutorChat} style={[styles.button, { backgroundColor: colors.accent, borderRadius: radius.md }]}>
          <Text style={{ color: colors.textInverse, fontWeight: '700' }}>{t('tutor.beginDiagnosis')}</Text>
        </AnimatedPressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ kicker: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700', paddingTop: 14 }, heading: { fontSize: 30, lineHeight: 38, marginTop: 10, fontWeight: '700' }, body: { fontSize: 14, lineHeight: 22, marginTop: 9 }, steps: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 }, step: { alignItems: 'center', gap: 8 }, stepDot: { width: 29, height: 29, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, stepText: { fontSize: 10, textTransform: 'capitalize' }, card: { borderWidth: 1, marginTop: 34 }, cardTitle: { fontSize: 18, fontWeight: '700' }, button: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 24 }, kbRow: { flexDirection: 'row', marginTop: 16, gap: 12 }, kbCell: { flex: 1, alignItems: 'center' }, kbValue: { fontSize: 24, fontWeight: '800' }, kbLabel: { fontSize: 11, marginTop: 4, textAlign: 'center' } });
