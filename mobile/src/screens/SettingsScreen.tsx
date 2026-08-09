import React, { useEffect, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppHeader } from '../components/AppHeader';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n, useT, type Language } from '../i18n';
import { getPreferences, loadPreferences, setPreference, subscribeToPreferences } from '../data/preferences';
import { registerPushNotifications, unregisterPushNotifications } from '../native/push';

const LANGUAGE_OPTIONS: Array<[Language, string]> = [
  ['en', 'common.languageEn'],
  ['zh', 'common.languageZh'],
];

export function SettingsScreen({ navigation }: { navigation: any }) {
  const { colors, radius, spacing } = useTheme();
  const { language, setLanguage } = useI18n();
  const t = useT();
  const prefs = useSyncExternalStore(subscribeToPreferences, getPreferences, getPreferences);

  useEffect(() => { void loadPreferences(); }, []);

  const toggleNotifications = async (value: boolean) => {
    await setPreference('notifications', value);
    // Actually act on the switch instead of only remembering it.
    if (value) await registerPushNotifications().catch(() => undefined);
    else await unregisterPushNotifications().catch(() => undefined);
  };

  const segment = <T extends string>(
    options: Array<[T, string]>,
    active: T,
    onPick: (value: T) => void,
  ) => (
    <View style={styles.segment}>
      {options.map(([value, key]) => {
        const selected = value === active;
        return (
          <AnimatedPressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onPick(value)}
            style={[styles.segmentButton, {
              borderColor: selected ? colors.accent : colors.border,
              backgroundColor: selected ? colors.accentSoft : colors.background,
              borderRadius: radius.md,
            }]}
          >
            <Text style={{ color: selected ? colors.accent : colors.textMuted, fontWeight: selected ? '700' : '500' }}>{t(key)}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );

  return (
    <Screen style={styles.screen}>
      <AppHeader title={t('settings.heading')} onNewChat={() => navigation.navigate('Home')} />
      <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md }]}> 
        <Text style={[styles.sectionLabel, { color: colors.textSubtle }]}>{t('settings.appearance')}</Text>
        <Text style={[styles.title, { color: colors.text }]}>{t('display.theme')}</Text>
        <View style={[styles.lockedTheme, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.md }]}> 
          <Ionicons name="moon" size={18} color={colors.accent} />
          <Text style={{ color: colors.text, fontWeight: '600' }}>{t('settings.darkLocked')}</Text>
        </View>
        <Text style={[styles.title, { color: colors.text, marginTop: 22 }]}>{t('common.language')}</Text>
        {segment(LANGUAGE_OPTIONS, language, (value) => { void setLanguage(value); })}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginTop: 16 }]}>
        <View style={styles.row}>
          <View style={styles.rowCopy}>
            <Text style={[styles.title, { color: colors.text }]}>{t('settings.notifications')}</Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>{t('settings.notificationsBody')}</Text>
          </View>
          <Switch
            value={prefs.notifications}
            onValueChange={(value) => { void toggleNotifications(value); }}
            thumbColor={colors.text}
            trackColor={{ false: colors.surfaceRaised, true: colors.accent }}
          />
        </View>
        <View style={[styles.row, styles.rowDivided, { borderTopColor: colors.border }]}>
          <View style={styles.rowCopy}>
            <Text style={[styles.title, { color: colors.text }]}>{t('settings.haptics')}</Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>{t('settings.hapticsBody')}</Text>
          </View>
          <Switch
            value={prefs.haptics}
            onValueChange={(value) => { void setPreference('haptics', value); }}
            thumbColor={colors.text}
            trackColor={{ false: colors.surfaceRaised, true: colors.accent }}
          />
        </View>
      </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  content: { paddingHorizontal: 18, paddingBottom: 28 },
  card: { borderWidth: 1 },
  sectionLabel: { fontSize: 11, letterSpacing: 1.4, fontWeight: '700', marginBottom: 14 },
  segment: { flexDirection: 'row', gap: 6, marginTop: 10 },
  segmentButton: { flex: 1, minHeight: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  lockedTheme: { minHeight: 46, borderWidth: 1, paddingHorizontal: 13, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowDivided: { borderTopWidth: StyleSheet.hairlineWidth },
  rowCopy: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 12, marginTop: 4, lineHeight: 17 },
});
