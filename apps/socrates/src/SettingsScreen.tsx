import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { AccountUsage } from '@socrates/contracts';
import type { ThemeMode } from '@socrates/theme';
import { getThemePaletteHex } from '@socrates/theme';
import { TONE_IDS, TONE_PRESETS, useSettingsStore } from '@socrates/settings';
import { useAppStrings } from './strings';
import { storage } from './storage';

// Settings screen for the Universal App — the 4th module in the migration
// order (Chat/Composer → Sidebar/Nav → Auth → Settings → …). Appearance,
// language, haptics and AI tone live in `@socrates/settings` (persisted via
// the injected KeyValueStore); profile + usage are server snapshots owned by
// App.tsx. Provider keys and billing stay on the web baseline — this screen
// never handles secrets. Pure RN UI, no document/window/localStorage.
export function SettingsScreen({
  mode,
  profile,
  usage,
  usageLoading,
  usageError,
  onRetryUsage,
  onChangePassword,
  activeProvider,
  onOpenProviders,
  onClose,
  onSignOut,
}: {
  mode: ThemeMode;
  /** Signed-in identity; null for guest (usage hidden, local prefs only). */
  profile: { displayName: string | null; email: string; tier?: string | null } | null;
  usage: AccountUsage | null;
  usageLoading: boolean;
  usageError: string | null;
  onRetryUsage(): void;
  /** Signed-in password change; rejects with the server message. */
  onChangePassword(oldPassword: string, newPassword: string): Promise<void>;
  /** Active model label for the providers entry; null hides it (guest). */
  activeProvider: string | null;
  onOpenProviders(): void;
  onClose(): void;
  onSignOut(): void;
}) {
  const p = getThemePaletteHex(mode);
  const s = useAppStrings();
  const theme = useSettingsStore((st) => st.theme);
  const language = useSettingsStore((st) => st.language);
  const haptics = useSettingsStore((st) => st.haptics);
  const tone = useSettingsStore((st) => st.tone);
  const update = useSettingsStore((st) => st.update);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwNotice, setPwNotice] = useState<string | null>(null);
  const changePassword = async () => {
    if (pwBusy) return;
    setPwBusy(true); setPwError(null); setPwNotice(null);
    try {
      await onChangePassword(oldPassword, newPassword);
      setOldPassword(''); setNewPassword('');
      setPwNotice(s.passwordChanged);
    } catch (error) {
      setPwError(error instanceof Error ? error.message : s.passwordChangeFailed);
    } finally {
      setPwBusy(false);
    }
  };

  const row = [styles.row, { borderBottomColor: p.border.default }];
  return (
    <View style={[styles.wrap, { backgroundColor: p.bg.page }]}>
      <View style={[styles.header, { borderBottomColor: p.border.default }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={s.backToChat} onPress={onClose} style={styles.back}>
          <Text style={[styles.backText, { color: p.text.primary }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: p.text.primary }]}>{s.settingsTitle}</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
      <View style={row}>
        <Text style={[styles.label, { color: p.text.primary }]}>{s.appearance}</Text>
        <View style={styles.segment}>
          {(['light', 'dark'] as const).map((m) => (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityLabel={m === 'light' ? s.lightTheme : s.darkTheme}
              accessibilityState={{ selected: theme === m }}
              onPress={() => void update({ theme: m }, storage)}
              style={[styles.chip, { borderColor: p.border.default }, theme === m && { backgroundColor: p.bg.hover }]}
            >
              <Text style={[styles.chipText, { color: p.text.primary }]}>{m === 'light' ? s.lightLabel : s.darkLabel}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={row}>
        <Text style={[styles.label, { color: p.text.primary }]}>{s.languageLabel}</Text>
        <View style={styles.segment}>
          {(['en', 'zh'] as const).map((l) => (
            <Pressable
              key={l}
              accessibilityRole="button"
              accessibilityLabel={l === 'en' ? s.enLanguage : s.zhLanguage}
              accessibilityState={{ selected: language === l }}
              onPress={() => void update({ language: l }, storage)}
              style={[styles.chip, { borderColor: p.border.default }, language === l && { backgroundColor: p.bg.hover }]}
            >
              <Text style={[styles.chipText, { color: p.text.primary }]}>{l === 'en' ? 'English' : '中文'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={row}>
        <Text style={[styles.label, { color: p.text.primary }]}>{s.haptics}</Text>
        <Switch
          accessibilityLabel={s.haptics}
          value={haptics}
          onValueChange={(v) => void update({ haptics: v }, storage)}
        />
      </View>

      <View style={[styles.sectionHead, { borderBottomColor: p.border.default }]}>
        <Text style={[styles.sectionTitle, { color: p.text.muted }]}>{s.assistantTone}</Text>
      </View>
      {TONE_IDS.map((id) => {
        const preset = TONE_PRESETS[id];
        const selected = tone === id;
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityLabel={s.toneOf(preset.label)}
            accessibilityState={{ selected }}
            onPress={() => void update({ tone: id }, storage)}
            style={[styles.toneRow, { borderColor: p.border.default }, selected && { backgroundColor: p.bg.hover }]}
          >
            <Text style={[styles.label, { color: p.text.primary }]}>{language === 'zh' ? preset.labelZh : preset.label}</Text>
            <Text style={[styles.sub, { color: p.text.muted }]}>{language === 'zh' ? preset.descriptionZh : preset.description}</Text>
          </Pressable>
        );
      })}

      <View style={[styles.sectionHead, { borderBottomColor: p.border.default }]}>
        <Text style={[styles.sectionTitle, { color: p.text.muted }]}>{s.account}</Text>
      </View>
      <View style={row}>
        <Text style={[styles.label, { color: p.text.primary }]}>{profile?.displayName || profile?.email || s.guestAccount}</Text>
        <Text style={[styles.sub, { color: p.text.muted }]}>{profile ? `${profile.email}${profile.tier ? ` · ${profile.tier}` : ''}` : s.guestHint}</Text>
      </View>
      {profile ? (
        <View style={styles.pwBox}>
          <TextInput
            accessibilityLabel={s.currentPassword}
            secureTextEntry
            value={oldPassword}
            onChangeText={setOldPassword}
            placeholder={s.currentPassword}
            placeholderTextColor={p.text.muted}
            style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]}
          />
          <TextInput
            accessibilityLabel={s.newPassword8}
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder={s.newPassword8}
            placeholderTextColor={p.text.muted}
            style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={s.changePassword}
            disabled={pwBusy || !oldPassword || newPassword.length < 8}
            onPress={() => void changePassword()}
            style={[styles.chip, { borderColor: p.border.default, opacity: pwBusy || !oldPassword || newPassword.length < 8 ? 0.4 : 1 }]}
          >
            <Text style={[styles.chipText, { color: p.text.primary }]}>{pwBusy ? s.changingPassword : s.changePassword}</Text>
          </Pressable>
          {pwError ? <Text accessibilityRole="alert" style={[styles.status, { color: p.danger }]}>{pwError}</Text> : null}
          {pwNotice ? <Text style={[styles.status, { color: p.text.secondary }]}>{pwNotice}</Text> : null}
        </View>
      ) : null}
      {profile ? (
        usageLoading && !usage ? (
          <Text style={[styles.status, { color: p.text.muted }]}>{s.loadingUsage}</Text>
        ) : usageError ? (
          <View style={styles.errorBox}>
            <Text style={[styles.status, { color: p.danger }]}>{usageError}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={s.retryLoadingUsage} onPress={onRetryUsage} style={[styles.chip, { borderColor: p.border.default }]}>
              <Text style={[styles.chipText, { color: p.text.primary }]}>{s.retry}</Text>
            </Pressable>
          </View>
        ) : usage ? (
          <View style={styles.usageBox}>
            {[
              [s.conversationsCount, String(usage.usage.sessionCount)],
              [s.providersCount, String(usage.usage.providerCount)],
              [s.graphNodesCount, String(usage.usage.graphNodes)],
              [s.tokensThisMonth, `${usage.usage.beagleUsed.toLocaleString()} / ${usage.usage.beagleLimit.toLocaleString()}`],
            ].map(([label, value]) => (
              <View key={label} style={[styles.usageRow, { borderBottomColor: p.border.default }]}>
                <Text style={[styles.sub, { color: p.text.muted }]}>{label}</Text>
                <Text style={[styles.label, { color: p.text.primary }]}>{value}</Text>
              </View>
            ))}
          </View>
        ) : null
      ) : null}

      {activeProvider !== null ? (
        <Pressable accessibilityRole="button" accessibilityLabel={s.openProviders} onPress={onOpenProviders} style={[styles.row, { borderTopWidth: 0 }]}>
          <Text style={[styles.label, { color: p.text.primary }]}>{s.providersTitle}</Text>
          <Text numberOfLines={1} style={[styles.sub, { color: p.text.muted }]}>{activeProvider ? `${activeProvider} ›` : '›'}</Text>
        </Pressable>
      ) : null}

      <Pressable accessibilityRole="button" accessibilityLabel={s.signOut} onPress={onSignOut} style={[styles.signOut, { borderColor: p.border.default }]}>
        <Text style={[styles.signOutText, { color: p.danger }]}>{s.signOut}</Text>
      </Pressable>
      </ScrollView>    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 26 },
  title: { flex: 1, textAlign: 'center', fontWeight: '600', fontSize: 17 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, maxWidth: 768, width: '100%', alignSelf: 'center' },
  label: { fontSize: 16 },
  sub: { fontSize: 13, marginTop: 2 },
  sectionHead: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, maxWidth: 768, width: '100%', alignSelf: 'center' },
  sectionTitle: { fontSize: 12, fontWeight: '600' },
  toneRow: { borderWidth: 1, borderRadius: 12, padding: 12, marginHorizontal: 20, marginTop: 8, maxWidth: 728, width: '100%', alignSelf: 'center' },
  usageBox: { marginHorizontal: 20, maxWidth: 728, width: '100%', alignSelf: 'center' },
  usageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  pwBox: { marginHorizontal: 20, maxWidth: 728, width: '100%', alignSelf: 'center', gap: 8, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  status: { textAlign: 'center', marginVertical: 12 },
  errorBox: { alignItems: 'center', marginVertical: 8 },
  scroll: { paddingBottom: 24 },
  segment: { flexDirection: 'row', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 14, fontWeight: '600' },
  signOut: { marginTop: 24, marginHorizontal: 20, maxWidth: 728, width: '100%', alignSelf: 'center', borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  signOutText: { fontWeight: '600', fontSize: 16 },
});
