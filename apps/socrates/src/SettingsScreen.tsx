import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { ThemeMode } from '@socrates/theme';
import { getThemePaletteHex } from '@socrates/theme';
import { useSettingsStore } from '@socrates/settings';
import { storage } from './storage';

// Settings screen for the Universal App — the 4th module in the migration
// order (Chat/Composer → Sidebar/Nav → Auth → Settings → …). State lives in
// `@socrates/settings` (persisted via the injected KeyValueStore); this file
// is pure RN UI with no document/window/localStorage.
export function SettingsScreen({
  mode,
  onClose,
  onSignOut,
}: {
  mode: ThemeMode;
  onClose(): void;
  onSignOut(): void;
}) {
  const p = getThemePaletteHex(mode);
  const theme = useSettingsStore((s) => s.theme);
  const language = useSettingsStore((s) => s.language);
  const haptics = useSettingsStore((s) => s.haptics);
  const update = useSettingsStore((s) => s.update);

  const row = [styles.row, { borderBottomColor: p.border.default }];
  return (
    <View style={[styles.wrap, { backgroundColor: p.bg.page }]}>
      <View style={[styles.header, { borderBottomColor: p.border.default }]}>
        <Pressable accessibilityLabel="Back to chat" onPress={onClose} style={styles.back}>
          <Text style={[styles.backText, { color: p.text.primary }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: p.text.primary }]}>Settings</Text>
        <View style={styles.back} />
      </View>

      <View style={row}>
        <Text style={[styles.label, { color: p.text.primary }]}>Appearance</Text>
        <View style={styles.segment}>
          {(['light', 'dark'] as const).map((m) => (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityLabel={`${m} theme`}
              accessibilityState={{ selected: theme === m }}
              onPress={() => void update({ theme: m }, storage)}
              style={[styles.chip, { borderColor: p.border.default }, theme === m && { backgroundColor: p.bg.hover }]}
            >
              <Text style={[styles.chipText, { color: p.text.primary }]}>{m === 'light' ? '☀ Light' : '☾ Dark'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={row}>
        <Text style={[styles.label, { color: p.text.primary }]}>Language</Text>
        <View style={styles.segment}>
          {(['en', 'zh'] as const).map((l) => (
            <Pressable
              key={l}
              accessibilityRole="button"
              accessibilityLabel={`${l} language`}
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
        <Text style={[styles.label, { color: p.text.primary }]}>Haptics</Text>
        <Switch
          accessibilityLabel="Haptics"
          value={haptics}
          onValueChange={(v) => void update({ haptics: v }, storage)}
        />
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={onSignOut} style={[styles.signOut, { borderColor: p.border.default }]}>
        <Text style={[styles.signOutText, { color: p.danger }]}>Sign out</Text>
      </Pressable>
    </View>
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
  segment: { flexDirection: 'row', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 14, fontWeight: '600' },
  signOut: { marginTop: 24, marginHorizontal: 20, maxWidth: 728, width: '100%', alignSelf: 'center', borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  signOutText: { fontWeight: '600', fontSize: 16 },
});
