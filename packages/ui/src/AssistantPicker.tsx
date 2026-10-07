import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Assistant } from '@socrates/contracts';
import { getThemePaletteHex, type ThemeMode } from '@socrates/theme';
import { filterAssistants, assistantRowLabel } from './assistantPicker';
import { uiStrings, type UiLanguage } from './strings';

/* Chat-header assistant switcher: a sheet over the transcript listing the
 * user's personas with the bound one checked, plus a "No assistant" row to
 * unbind and a Manage entry into the full assistants screen. Binding stays
 * in the host app (session PATCH with an epoch-guarded mirror update); this
 * component only collects the pick. The filter box appears at 4+ rows,
 * mirroring the model picker. */
export function AssistantPicker({ assistants, activeId, open, mode = 'light', language = 'en', onPick, onManage, onClose }: {
  assistants: Assistant[];
  activeId: string | null;
  open: boolean;
  mode?: ThemeMode;
  language?: UiLanguage;
  /** null unbinds the session's assistant. */
  onPick(id: string | null): void;
  onManage(): void;
  onClose(): void;
}) {
  const p = getThemePaletteHex(mode);
  const t = uiStrings(language);
  const [filter, setFilter] = useState('');
  const items = useMemo(() => filterAssistants(assistants, filter), [assistants, filter]);
  if (!open) return null;
  return <View style={styles.sheet}>
    <Pressable accessibilityRole="button" accessibilityLabel={t.closeAssistantPicker} onPress={onClose} style={styles.backdrop} />
    <View style={[styles.card, { backgroundColor: p.bg.raised, borderColor: p.border.default }]}>
      <Text style={[styles.title, { color: p.text.primary }]}>{t.assistantTitle}</Text>
      {assistants.length >= 4 ? <TextInput
        accessibilityLabel={t.filterAssistants}
        value={filter}
        onChangeText={setFilter}
        placeholder={t.filterAssistants}
        placeholderTextColor={p.text.muted}
        style={[styles.filter, { color: p.text.primary, borderColor: p.border.default }]}
      /> : null}
      <ScrollView style={styles.list}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.useAssistant(t.noAssistant)}
          accessibilityState={{ selected: !activeId }}
          onPress={() => onPick(null)}
          style={[styles.item, !activeId && { backgroundColor: p.bg.hover }]}
        >
          <Text numberOfLines={1} style={[styles.name, { color: p.text.primary, flex: 1 }]}>{t.noAssistant}</Text>
          {!activeId ? <Text style={{ color: p.accent.strong, fontWeight: '700' }}>✓</Text> : null}
        </Pressable>
        {items.map((item) => {
          const label = assistantRowLabel(item);
          const selected = item.id === activeId;
          return <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={t.useAssistant(label.name)}
            accessibilityState={{ selected }}
            onPress={() => onPick(item.id)}
            style={[styles.item, selected && { backgroundColor: p.bg.hover }]}
          >
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.name, { color: p.text.primary }]}>{label.name}</Text>
              {label.sub ? <Text numberOfLines={1} style={[styles.sub, { color: p.text.muted }]}>{label.sub}</Text> : null}
            </View>
            {selected ? <Text style={{ color: p.accent.strong, fontWeight: '700' }}>✓</Text> : null}
          </Pressable>;
        })}
        {assistants.length && !items.length ? <Text style={{ color: p.text.muted }}>{t.noAssistantMatches}</Text> : null}
        {!assistants.length ? <Text style={{ color: p.text.muted }}>{t.noAssistants}</Text> : null}
      </ScrollView>
      <Pressable accessibilityRole="button" accessibilityLabel={t.manageAssistants} onPress={onManage} style={[styles.manage, { borderColor: p.border.default }]}>
        <Text style={{ color: p.accent.strong, fontWeight: '600' }}>{t.manageAssistants}</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  sheet: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', zIndex: 30 },
  backdrop: { ...StyleSheet.absoluteFill },
  card: { margin: 12, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12, maxHeight: '70%' },
  title: { fontSize: 17, fontWeight: '700' },
  filter: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  list: { gap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10 },
  name: { fontSize: 16, fontWeight: '500' },
  sub: { fontSize: 13, marginTop: 2 },
  manage: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
});
