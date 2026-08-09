import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { native } from '../native/native';
import { API_BASE_URL } from '../data/api/client';

export function WorkspaceScreen() {
  const { colors, radius, spacing } = useTheme();
  const t = useT();
  return (
    <Screen scroll>
      <Text style={[styles.kicker, { color: colors.textSubtle }]}>{t('workspace.kicker')}</Text>
      <Text style={[styles.heading, { color: colors.text }]}>{t('workspace.heading')}</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{t('workspace.body')}</Text>
      {/* The card advertised "Open workspace →" but had an empty handler. */}
      <AnimatedPressable
        onPress={() => { void native.openBrowser(API_BASE_URL.replace(/\/api\/?$/, '')); }}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg }]}
      >
        <Text style={[styles.cardTitle, { color: colors.text }]}>{t('workspace.projects')}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{t('workspace.projectsBody')}</Text>
        <Text style={[styles.link, { color: colors.accent }]}>{t('workspace.open')}</Text>
      </AnimatedPressable>
    </Screen>
  );
}

const styles = StyleSheet.create({ kicker: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700', paddingTop: 14 }, heading: { fontSize: 31, lineHeight: 38, marginTop: 10 }, body: { fontSize: 14, lineHeight: 22, marginTop: 10 }, card: { borderWidth: 1, marginTop: 30 }, cardTitle: { fontSize: 19, fontWeight: '700' }, link: { fontSize: 14, fontWeight: '700', marginTop: 24 } });
