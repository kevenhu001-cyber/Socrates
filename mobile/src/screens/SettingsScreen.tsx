import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Memory } from '@socrates/contracts';
import { Screen } from '../components/Screen';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppHeader } from '../components/AppHeader';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n, useT, type Language } from '../i18n';
import { getPreferences, loadPreferences, setPreference, subscribeToPreferences } from '../data/preferences';
import { registerPushNotifications, unregisterPushNotifications } from '../native/push';
import { appStore, useAppStore } from '../stores/appStore';
import { memoryApi, usersApi } from '../data/api/client';

const LANGUAGE_OPTIONS: Array<[Language, string]> = [
  ['en', 'common.languageEn'],
  ['zh', 'common.languageZh'],
];

export function SettingsScreen({ navigation }: { navigation: any }) {
  const { colors, radius, spacing } = useTheme();
  const { language, setLanguage } = useI18n();
  const t = useT();
  const state = useAppStore();
  const prefs = useSyncExternalStore(subscribeToPreferences, getPreferences, getPreferences);
  const [displayName, setDisplayName] = useState(state.user?.displayName || '');
  const [customInstructions, setCustomInstructions] = useState(state.user?.customInstructions || '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryBusy, setMemoryBusy] = useState(false);

  useEffect(() => { void loadPreferences(); }, []);
  useEffect(() => {
    setDisplayName(state.user?.displayName || '');
    setCustomInstructions(state.user?.customInstructions || '');
  }, [state.user?.id, state.user?.displayName, state.user?.customInstructions]);
  useEffect(() => {
    let mounted = true;
    setMemoryBusy(true);
    void memoryApi.list()
      .then((result) => { if (mounted) setMemories(result.memories); })
      .catch(() => undefined)
      .finally(() => { if (mounted) setMemoryBusy(false); });
    return () => { mounted = false; };
  }, []);

  const toggleNotifications = async (value: boolean) => {
    await setPreference('notifications', value);
    // Actually act on the switch instead of only remembering it.
    if (value) await registerPushNotifications().catch(() => undefined);
    else await unregisterPushNotifications().catch(() => undefined);
  };

  const saveProfile = async () => {
    setProfileBusy(true);
    setProfileSaved(false);
    try {
      const user = await usersApi.updateMe({ displayName: displayName.trim() || null, customInstructions: customInstructions.trim() || null });
      appStore.setUser(user);
      setProfileSaved(true);
    } catch (caught) {
      Alert.alert(t('settings.profile'), caught instanceof Error ? caught.message : t('settings.profileSaved'));
    } finally {
      setProfileBusy(false);
    }
  };

  const toggleMemory = async (memory: Memory, enabled: boolean) => {
    try {
      const updated = await memoryApi.patch(memory.id, { enabled });
      setMemories((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (caught) {
      Alert.alert(t('settings.memory'), caught instanceof Error ? caught.message : t('settings.memoryLoadFailed'));
    }
  };

  const forgetMemory = (memory: Memory) => Alert.alert(t('settings.memoryDelete'), memory.text, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('settings.memoryDelete'), style: 'destructive', onPress: () => {
      void memoryApi.remove(memory.id).then(() => setMemories((items) => items.filter((item) => item.id !== memory.id))).catch((caught) => Alert.alert(t('settings.memory'), caught instanceof Error ? caught.message : t('settings.memoryLoadFailed')));
    } },
  ]);

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
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md }]}
      >
        <Text style={[styles.sectionLabel, { color: colors.textSubtle }]}>{t('settings.profile')}</Text>
        <Text style={[styles.title, { color: colors.text }]}>{t('settings.displayName')}</Text>
        <TextInput
          accessibilityLabel={t('settings.displayName')}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder={t('settings.displayNamePlaceholder')}
          placeholderTextColor={colors.textSubtle}
          style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.md }]}
        />
        <Text style={[styles.title, { color: colors.text, marginTop: 18 }]}>{t('settings.customInstructions')}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{t('settings.customInstructionsBody')}</Text>
        <TextInput
          accessibilityLabel={t('settings.customInstructions')}
          value={customInstructions}
          onChangeText={setCustomInstructions}
          multiline
          maxLength={4000}
          placeholder={t('settings.customInstructionsPlaceholder')}
          placeholderTextColor={colors.textSubtle}
          textAlignVertical="top"
          style={[styles.input, styles.instructions, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.md }]}
        />
        <View style={styles.profileFooter}>
          {profileSaved ? <Text style={[styles.saved, { color: colors.success }]}>{t('settings.profileSaved')}</Text> : <View />}
          <AnimatedPressable disabled={profileBusy} onPress={() => { void saveProfile(); }} style={[styles.saveButton, { backgroundColor: colors.accent, borderRadius: radius.md }]}>
            {profileBusy ? <ActivityIndicator color={colors.white} /> : <Text style={[styles.saveText, { color: colors.white }]}>{t('settings.saveProfile')}</Text>}
          </AnimatedPressable>
        </View>
      </View>

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

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginTop: 16 }]}
      >
        <Text style={[styles.sectionLabel, { color: colors.textSubtle }]}>{t('settings.memory')}</Text>
        <Text style={[styles.body, { color: colors.textMuted, marginBottom: 10 }]}>{t('settings.memoryBody')}</Text>
        {memoryBusy ? <ActivityIndicator color={colors.accent} style={styles.memoryLoading} /> : memories.length ? memories.map((memory) => (
          <View key={memory.id} style={[styles.memoryRow, { borderTopColor: colors.border }]}
          >
            <View style={styles.memoryCopy}>
              <Text selectable style={[styles.memoryText, { color: colors.text }]}>{memory.text}</Text>
              {memory.enabled === false ? <Text style={[styles.memoryDisabled, { color: colors.textSubtle }]}>{t('settings.memoryDisabled')}</Text> : null}
            </View>
            <Switch value={memory.enabled !== false} onValueChange={(value) => { void toggleMemory(memory, value); }} thumbColor={colors.text} trackColor={{ false: colors.surfaceRaised, true: colors.accent }} />
            <AnimatedPressable accessibilityLabel={`${t('settings.memoryDelete')}: ${memory.text}`} onPress={() => forgetMemory(memory)} style={styles.forgetButton}><Ionicons name="trash-outline" size={18} color={colors.danger} /></AnimatedPressable>
          </View>
        )) : <Text style={[styles.body, { color: colors.textSubtle }]}>{t('settings.noMemories')}</Text>}
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
  input: { minHeight: 46, borderWidth: 1, paddingHorizontal: 12, fontSize: 14, marginTop: 9 },
  instructions: { minHeight: 110, paddingTop: 12, paddingBottom: 12 },
  profileFooter: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 },
  saved: { fontSize: 12 },
  saveButton: { minHeight: 42, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 13, fontWeight: '700' },
  memoryLoading: { paddingVertical: 10 },
  memoryRow: { minHeight: 68, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 8 },
  memoryCopy: { flex: 1, minWidth: 0 },
  memoryText: { fontSize: 13, lineHeight: 19 },
  memoryDisabled: { fontSize: 11, marginTop: 4 },
  forgetButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
});
