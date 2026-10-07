import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { ProviderKey } from '@socrates/contracts';
import type { ThemeMode } from '@socrates/theme';
import { getThemePaletteHex } from '@socrates/theme';
import { useAppStrings } from './strings';

// Models & keys screen — provider management for the Universal App. Server
// holds the secrets (list returns hasKey/keyHint only); the client sends a
// key once over TLS when creating or rotating. Activating one provider
// deactivates the rest server-side. Built-in rows are the fallback and are
// never deleted from here. Pure RN UI; App.tsx owns fetching.
export function ProvidersScreen({
  mode,
  providers,
  loading,
  error,
  onClose,
  onActivate,
  onCreate,
  onDelete,
  onRetry,
}: {
  mode: ThemeMode;
  providers: ProviderKey[];
  loading: boolean;
  error: string | null;
  onClose(): void;
  onActivate(id: string): Promise<void>;
  onCreate(entry: { label: string; url: string; model: string; key: string; isMultimodal: boolean }): Promise<void>;
  onDelete(id: string): Promise<void>;
  onRetry(): void;
}) {
  const p = getThemePaletteHex(mode);
  const s = useAppStrings();
  const [operationError, setOperationError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [vision, setVision] = useState(true);
  const [creating, setCreating] = useState(false);

  const run = async (id: string | null, action: () => Promise<void>, done?: () => void) => {
    if (busyId) return;
    setBusyId(id || 'create');
    setOperationError(null);
    try {
      await action();
      done?.();
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : s.operationFailed);
    } finally {
      setBusyId(null);
    }
  };

  const canCreate = url.trim().length > 8 && model.trim().length > 0 && key.length > 0 && !creating;
  const create = () =>
    run(null, async () => {
      setCreating(true);
      try {
        await onCreate({ label: label.trim() || 'Custom', url: url.trim(), model: model.trim(), key, isMultimodal: vision });
      } finally {
        setCreating(false);
      }
    }, () => {
      setAdding(false); setLabel(''); setUrl(''); setModel(''); setKey('');
    });

  const hostOf = (value: string) => {
    try { return new URL(value).host; } catch { return value; }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: p.bg.page }]}>
      <View style={[styles.header, { borderBottomColor: p.border.default }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={s.backToChat} onPress={onClose} style={styles.back}>
          <Text style={[styles.backText, { color: p.text.primary }]}>‹</Text>
        </Pressable>
        <Text numberOfLines={1} style={[styles.title, { color: p.text.primary }]}>{s.providersTitle}</Text>
        <View style={styles.back} />
      </View>

      <View style={styles.body}>
        {operationError ? <Text accessibilityRole="alert" style={[styles.status, { color: p.danger }]}>{operationError}</Text> : null}
        <Text style={[styles.hint, { color: p.text.muted }]}>{s.providersHint}</Text>

        {loading && !providers.length ? (
          <Text style={[styles.status, { color: p.text.muted }]}>{s.loadingProviders}</Text>
        ) : null}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={[styles.status, { color: p.danger }]}>{error}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={s.retryLoadingProviders} onPress={() => onRetry()} style={[styles.chip, { borderColor: p.border.default }]}>
              <Text style={[styles.chipText, { color: p.text.primary }]}>{s.retry}</Text>
            </Pressable>
          </View>
        ) : null}

        <FlatList
          data={providers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const busy = busyId === item.id;
            const active = !!item.isActive;
            return (
              <View style={[styles.row, { borderColor: p.border.default }, active && { backgroundColor: p.bg.hover }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={s.activateProvider(item.label || item.model)}
                  accessibilityState={{ selected: active }}
                  disabled={busy || active}
                  onPress={() => void run(item.id, () => onActivate(item.id))}
                >
                  <View style={styles.rowHead}>
                    <Text numberOfLines={1} style={[styles.rowTitle, { color: p.text.primary }]}>
                      {active ? '● ' : '○ '}{item.label || item.model}
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.rowSub, { color: p.text.muted }]}>
                    {item.model} · {hostOf(item.url)}{item.isBuiltIn ? ` · ${s.builtIn}` : ''}{item.hasKey ? '' : ` · ${s.noKeyStored}`}
                  </Text>
                </Pressable>
                {!item.isBuiltIn ? (
                  <View style={styles.rowActions}>
                    {confirmDeleteId === item.id ? (
                      <>
                        <Text style={[styles.rowSub, { color: p.danger }]}>{s.deleteProviderWarning}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={s.confirmDeleteProvider(item.label || item.model)} disabled={busy} onPress={() => void run(item.id, () => onDelete(item.id), () => setConfirmDeleteId(null))} style={styles.miniBtn}>
                          <Text style={[styles.miniBtnText, { color: p.danger }]}>{busy ? '…' : s.deleteConfirm}</Text>
                        </Pressable>
                        <Pressable accessibilityRole="button" accessibilityLabel={s.cancelDelete} onPress={() => setConfirmDeleteId(null)} style={styles.miniBtn}>
                          <Text style={[styles.miniBtnText, { color: p.text.muted }]}>✕</Text>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable accessibilityRole="button" accessibilityLabel={s.deleteProvider(item.label || item.model)} onPress={() => setConfirmDeleteId(item.id)} style={styles.miniBtn}>
                        <Text style={[styles.miniBtnText, { color: p.text.muted }]}>🗑</Text>
                      </Pressable>
                    )}
                  </View>
                ) : null}
              </View>
            );
          }}
        />

        {adding ? (
          <View style={[styles.form, { borderColor: p.border.default }]}>
            <TextInput accessibilityLabel={s.providerLabel} value={label} onChangeText={setLabel} placeholder={s.providerLabelHint} placeholderTextColor={p.text.muted} style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]} />
            <TextInput accessibilityLabel={s.providerUrl} value={url} onChangeText={setUrl} placeholder="https://api.example.com/v1" placeholderTextColor={p.text.muted} autoCapitalize="none" keyboardType="url" style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]} />
            <TextInput accessibilityLabel={s.providerModel} value={model} onChangeText={setModel} placeholder="model-id" placeholderTextColor={p.text.muted} autoCapitalize="none" style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]} />
            <TextInput accessibilityLabel={s.providerKey} value={key} onChangeText={setKey} placeholder="••••••••" placeholderTextColor={p.text.muted} secureTextEntry autoCapitalize="none" style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]} />
            <View style={styles.visionRow}>
              <Text style={[styles.rowSub, { color: p.text.secondary }]}>{s.providerVision}</Text>
              <Switch accessibilityLabel={s.providerVision} value={vision} onValueChange={setVision} />
            </View>
            <View style={styles.formBtns}>
              <Pressable accessibilityRole="button" accessibilityLabel={s.cancel} onPress={() => setAdding(false)} style={styles.miniBtn}>
                <Text style={[styles.miniBtnText, { color: p.text.muted }]}>{s.cancel}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={s.addProvider} disabled={!canCreate} onPress={() => void create()} style={[styles.miniBtn, { opacity: canCreate ? 1 : 0.4 }]}>
                <Text style={[styles.miniBtnText, { color: p.text.primary }]}>{creating ? '…' : s.addProvider}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={s.addProvider} onPress={() => { setOperationError(null); setAdding(true); }} style={[styles.addBtn, { borderColor: p.border.default }]}>
            <Text style={[styles.chipText, { color: p.text.primary }]}>+ {s.addProvider}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 26 },
  title: { flex: 1, textAlign: 'center', fontWeight: '600', fontSize: 17 },
  body: { flex: 1, width: '100%', maxWidth: 768, alignSelf: 'center', padding: 16 },
  hint: { fontSize: 13, marginBottom: 12 },
  row: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 16, fontWeight: '600', flex: 1 },
  rowSub: { fontSize: 13, marginTop: 4 },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6, alignItems: 'center', gap: 4 },
  miniBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  miniBtnText: { fontSize: 15, fontWeight: '600' },
  status: { textAlign: 'center', marginVertical: 12 },
  errorBox: { alignItems: 'center', marginVertical: 8 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8 },
  chipText: { fontSize: 14, fontWeight: '600' },
  form: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8, gap: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  visionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  formBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4 },
  addBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
});
