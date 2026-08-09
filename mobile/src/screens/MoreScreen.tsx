import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { appStore, useAppStore } from '../stores/appStore';
import type { RootStackParamList } from '../navigation/types';

type Props = { navigation: any };

/** Route name paired with the keys for its title and description. */
const ITEMS: Array<[keyof RootStackParamList, string, string]> = [
  ['Settings', 'more.settings', 'more.settingsBody'],
  ['Workspace', 'more.workspace', 'more.workspaceBody'],
  ['Search', 'more.search', 'more.searchBody'],
];

export function MoreScreen({ navigation }: Props) {
  const { colors, radius, spacing } = useTheme();
  const t = useT();
  const state = useAppStore();
  return (
    <Screen scroll>
      <Text style={[styles.kicker, { color: colors.textSubtle }]}>{t('more.kicker')}</Text>
      <Text style={[styles.heading, { color: colors.text }]}>{t('more.heading')}</Text>
      <View style={[styles.profile, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md }]}>
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
          <Text style={{ color: colors.background, fontWeight: '800' }}>{(state.user?.displayName || state.user?.email || 'S').slice(0, 1).toUpperCase()}</Text>
        </View>
        <View>
          <Text style={[styles.profileName, { color: colors.text }]}>{state.user?.displayName || t('more.learner')}</Text>
          <Text style={[styles.profileEmail, { color: colors.textMuted }]}>{state.user?.email || ''}</Text>
        </View>
      </View>
      {ITEMS.map(([route, titleKey, bodyKey]) => (
        <AnimatedPressable key={route} onPress={() => navigation.getParent()?.navigate(route)} style={[styles.row, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.rowTitle, { color: colors.text }]}>{t(titleKey)}</Text>
            <Text style={[styles.rowBody, { color: colors.textMuted }]}>{t(bodyKey)}</Text>
          </View>
          <Text style={{ color: colors.textSubtle, fontSize: 22 }}>›</Text>
        </AnimatedPressable>
      ))}
      <AnimatedPressable onPress={() => appStore.logout()} style={[styles.logout, { borderColor: colors.border, borderRadius: radius.md }]}>
        <Text style={{ color: colors.danger, fontWeight: '700' }}>{t('common.signOut')}</Text>
      </AnimatedPressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700', paddingTop: 14 }, heading: { fontSize: 32, lineHeight: 38, marginTop: 10, marginBottom: 24, fontWeight: '700' }, profile: { borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, profileName: { fontSize: 15, fontWeight: '700' }, profileEmail: { fontSize: 12, marginTop: 3 }, row: { minHeight: 72, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, rowTitle: { fontSize: 15, fontWeight: '700' }, rowBody: { fontSize: 12, marginTop: 5 }, logout: { minHeight: 48, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 32 },
});
