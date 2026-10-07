import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ProviderKey } from '@socrates/contracts';
import { getThemePaletteHex, type ThemeMode } from '@socrates/theme';
import { filterProviders, providerRowLabel, sortProvidersBuiltInFirst } from './modelPicker';
import { uiStrings, type UiLanguage } from './strings';

/* Chat-header model switcher: a sheet over the transcript listing the
 * providers built-in-first with the active check, plus a Manage entry
 * into the full providers screen. Activation stays in the host app
 * (server PATCH with an epoch-guarded mirror update); this component
 * only collects the pick. The filter box appears at 4+ rows, mirroring
 * the web baseline's picker. */
export function ModelPicker({ providers, activeId, open, mode = 'light', language = 'en', onPick, onManage, onClose }: {
  providers: ProviderKey[];
  activeId: string | null;
  open: boolean;
  mode?: ThemeMode;
  language?: UiLanguage;
  onPick(id: string): void;
  onManage(): void;
  onClose(): void;
}) {
  const p = getThemePaletteHex(mode);
  const t = uiStrings(language);
  const [filter, setFilter] = useState('');
  const items = useMemo(
    () => filterProviders(sortProvidersBuiltInFirst(providers), filter),
    [providers, filter],
  );
  if (!open) return null;
  return <View style={styles.sheet}>
    <Pressable accessibilityRole="button" accessibilityLabel={t.closeModelPicker} onPress={onClose} style={styles.backdrop} />
    <View style={[styles.card, { backgroundColor: p.bg.raised, borderColor: p.border.default }]}>
      <Text style={[styles.title, { color: p.text.primary }]}>{t.modelTitle}</Text>
      {providers.length >= 4 ? <TextInput
        accessibilityLabel={t.filterModels}
        value={filter}
        onChangeText={setFilter}
        placeholder={t.filterModels}
        placeholderTextColor={p.text.muted}
        style={[styles.filter, { color: p.text.primary, borderColor: p.border.default }]}
      /> : null}
      <ScrollView style={styles.list}>
        {items.length ? items.map((item) => {
          const label = providerRowLabel(item);
          const selected = item.id === activeId;
          return <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={t.useModel(label.name)}
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
        }) : <Text style={{ color: p.text.muted }}>{filter ? t.noModelMatches : t.noModels}</Text>}
      </ScrollView>
      <Pressable accessibilityRole="button" accessibilityLabel={t.manageModels} onPress={onManage} style={[styles.manage, { borderColor: p.border.default }]}>
        <Text style={{ color: p.accent.strong, fontWeight: '600' }}>{t.manageModels}</Text>
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
