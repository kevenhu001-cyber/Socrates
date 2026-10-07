import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Assistant } from '@socrates/contracts';
import type { ThemeMode } from '@socrates/theme';
import { getThemePaletteHex } from '@socrates/theme';
import { assistantConfigOf, assistantRowLabel } from '@socrates/ui';
import { useAppStrings } from './strings';

/* Assistants screen — persona management for the Universal App, mirroring
 * the web baseline's Assistants creation surface: name + description +
 * instructions + starter, with Start chat / edit / delete. The picker in
 * the chat header is the primary entry; this screen backs its Manage
 * action. App.tsx owns fetching and persistence. */
export interface AssistantDraft {
  title: string;
  description: string;
  instructions: string;
  starter: string;
}

export function AssistantsScreen({
  mode,
  assistants,
  boundId,
  loading,
  error,
  onClose,
  onRetry,
  onCreate,
  onUpdate,
  onDelete,
  onUse,
}: {
  mode: ThemeMode;
  assistants: Assistant[];
  /** Session-bound assistant, highlighted in the list. */
  boundId: string | null;
  loading: boolean;
  error: string | null;
  onClose(): void;
  onRetry(): void;
  onCreate(entry: AssistantDraft): Promise<void>;
  onUpdate(id: string, entry: AssistantDraft): Promise<void>;
  onDelete(id: string): Promise<void>;
  onUse(assistant: Assistant): void;
}) {
  const p = getThemePaletteHex(mode);
  const s = useAppStrings();
  const [operationError, setOperationError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [starter, setStarter] = useState('');

  const run = async (id: string | null, action: () => Promise<void>, done?: () => void) => {
    if (busyId) return;
    setBusyId(id || 'save');
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

  const openForm = (assistant: Assistant | null) => {
    setOperationError(null);
    if (assistant) {
      const config = assistantConfigOf(assistant);
      setEditingId(assistant.id);
      setTitle(assistant.title || '');
      setDescription(config.description || '');
      setInstructions(config.instructions || '');
      setStarter(config.starter || '');
    } else {
      setEditingId('new');
      setTitle(''); setDescription(''); setInstructions(''); setStarter('');
    }
  };
  const closeForm = () => { setEditingId(null); setTitle(''); setDescription(''); setInstructions(''); setStarter(''); };
  const canSave = title.trim().length > 0 && instructions.trim().length > 0 && !busyId;
  const save = () =>
    run(null, async () => {
      const entry: AssistantDraft = {
        title: title.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        starter: starter.trim(),
      };
      if (editingId && editingId !== 'new') await onUpdate(editingId, entry);
      else await onCreate(entry);
    }, closeForm);

  return (
    <View style={[styles.wrap, { backgroundColor: p.bg.page }]}>
      <View style={[styles.header, { borderBottomColor: p.border.default }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={s.backToChat} onPress={onClose} style={styles.back}>
          <Text style={[styles.backText, { color: p.text.primary }]}>‹</Text>
        </Pressable>
        <Text numberOfLines={1} style={[styles.title, { color: p.text.primary }]}>{s.assistantsTitle}</Text>
        <View style={styles.back} />
      </View>

      <View style={styles.body}>
        {operationError ? <Text accessibilityRole="alert" style={[styles.status, { color: p.danger }]}>{operationError}</Text> : null}
        <Text style={[styles.hint, { color: p.text.muted }]}>{s.assistantsHint}</Text>

        {loading && !assistants.length ? (
          <Text style={[styles.status, { color: p.text.muted }]}>{s.loadingAssistants}</Text>
        ) : null}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={[styles.status, { color: p.danger }]}>{error}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={s.retryLoadingAssistants} onPress={() => onRetry()} style={[styles.chip, { borderColor: p.border.default }]}>
              <Text style={[styles.chipText, { color: p.text.primary }]}>{s.retry}</Text>
            </Pressable>
          </View>
        ) : null}

        <FlatList
          data={assistants}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={!loading && !error ? <Text style={[styles.status, { color: p.text.muted }]}>{s.emptyAssistants}</Text> : null}
          renderItem={({ item }) => {
            const label = assistantRowLabel(item);
            const busy = busyId === item.id;
            const bound = item.id === boundId;
            return (
              <View style={[styles.row, { borderColor: p.border.default }, bound && { backgroundColor: p.bg.hover }]}>
                <View style={styles.rowHead}>
                  <Text numberOfLines={1} style={[styles.rowTitle, { color: p.text.primary }]}>{bound ? '● ' : ''}{label.name}</Text>
                </View>
                {label.sub ? <Text numberOfLines={2} style={[styles.rowSub, { color: p.text.muted }]}>{label.sub}</Text> : null}
                <View style={styles.rowActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={s.startChatWith(label.name)} disabled={busy} onPress={() => onUse(item)} style={styles.miniBtn}>
                    <Text style={[styles.miniBtnText, { color: p.accent.strong }]}>{s.startChatWith(label.name)}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={s.editAssistantOf(label.name)} disabled={busy} onPress={() => openForm(item)} style={styles.miniBtn}>
                    <Text style={[styles.miniBtnText, { color: p.text.secondary }]}>✎</Text>
                  </Pressable>
                  {confirmDeleteId === item.id ? (
                    <>
                      <Pressable accessibilityRole="button" accessibilityLabel={s.confirmDeleteAssistantOf(label.name)} disabled={busy} onPress={() => void run(item.id, () => onDelete(item.id), () => setConfirmDeleteId(null))} style={styles.miniBtn}>
                        <Text style={[styles.miniBtnText, { color: p.danger }]}>{s.deleteConfirm}</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={s.cancelDelete} onPress={() => setConfirmDeleteId(null)} style={styles.miniBtn}>
                        <Text style={[styles.miniBtnText, { color: p.text.muted }]}>✕</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable accessibilityRole="button" accessibilityLabel={s.deleteAssistantOf(label.name)} disabled={busy} onPress={() => setConfirmDeleteId(item.id)} style={styles.miniBtn}>
                      <Text style={[styles.miniBtnText, { color: p.text.muted }]}>🗑</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          }}
        />

        {editingId ? (
          <View style={[styles.form, { borderColor: p.border.default }]}>
            <TextInput accessibilityLabel={s.assistantName} value={title} onChangeText={setTitle} placeholder={s.assistantName} placeholderTextColor={p.text.muted} style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]} />
            <TextInput accessibilityLabel={s.assistantDescription} value={description} onChangeText={setDescription} placeholder={s.assistantDescription} placeholderTextColor={p.text.muted} style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]} />
            <TextInput accessibilityLabel={s.assistantInstructions} value={instructions} onChangeText={setInstructions} placeholder={s.assistantInstructions} placeholderTextColor={p.text.muted} multiline style={[styles.input, styles.multiline, { borderColor: p.border.default, color: p.text.primary }]} />
            <TextInput accessibilityLabel={s.assistantStarter} value={starter} onChangeText={setStarter} placeholder={s.assistantStarter} placeholderTextColor={p.text.muted} multiline style={[styles.input, styles.multiline, { borderColor: p.border.default, color: p.text.primary }]} />
            <View style={styles.formBtns}>
              <Pressable accessibilityRole="button" accessibilityLabel={s.cancel} onPress={closeForm} style={styles.miniBtn}>
                <Text style={[styles.miniBtnText, { color: p.text.muted }]}>{s.cancel}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={s.assistantSave} disabled={!canSave} onPress={() => void save()} style={[styles.miniBtn, { opacity: canSave ? 1 : 0.4 }]}>
                <Text style={[styles.miniBtnText, { color: p.text.primary }]}>{busyId === 'save' ? '…' : s.assistantSave}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={s.newAssistant} onPress={() => openForm(null)} style={[styles.addBtn, { borderColor: p.border.default }]}>
            <Text style={[styles.chipText, { color: p.text.primary }]}>+ {s.newAssistant}</Text>
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
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  formBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4 },
  addBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
});
