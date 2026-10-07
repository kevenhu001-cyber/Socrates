import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StoredFile } from '@socrates/contracts';
import { getThemePaletteHex, type ThemeMode } from '@socrates/theme';
import { fileKindLabel, formatFileSize } from '@socrates/ui';
import { useAppStrings } from './strings';

/* File library: every durable upload (composer attachments and tool outputs)
 * with preview/delete. Data access is supplied by App so this screen owns no
 * api singleton. */
export function FilesScreen({ mode, list, remove, onOpen, onClose }: {
  mode: ThemeMode;
  list(): Promise<{ files: StoredFile[]; nextCursor?: string | null }>;
  remove(id: string): Promise<void>;
  onOpen(file: StoredFile): void;
  onClose(): void;
}) {
  const p = getThemePaletteHex(mode);
  const s = useAppStrings();
  const [files, setFiles] = useState<StoredFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    void list().then((page) => setFiles(page.files)).catch((failure) => {
      setFiles([]);
      setError(failure instanceof Error ? failure.message : s.filesLoadFailed);
    });
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const drop = useCallback((file: StoredFile) => {
    if (confirmId !== file.id) { setConfirmId(file.id); setFailedId(null); return; }
    setConfirmId(null);
    void remove(file.id).then(() => {
      setFiles((prev) => (prev || []).filter((row) => row.id !== file.id));
    }).catch(() => {
      setFailedId(file.id);
      setError(s.fileDeleteFailed);
    });
  }, [confirmId, remove]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.wrap, { backgroundColor: p.bg.page }]}>
      <View style={[styles.header, { borderBottomColor: p.border.default }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={s.backToChat} onPress={onClose} style={styles.back}>
          <Text style={[styles.backText, { color: p.text.primary }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: p.text.primary }]}>{s.filesTitle}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={s.retryLoadingFiles} onPress={load} style={styles.back}>
          <Text style={{ color: p.text.muted }}>⟳</Text>
        </Pressable>
      </View>
      {files === null ? <Text style={[styles.status, { color: p.text.muted }]}>{s.loadingFiles}</Text> : null}
      {files !== null && error && files.length === 0 ? (
        <View style={styles.statusBox}>
          <Text style={{ color: p.text.muted }}>{error}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={s.retryLoadingFiles} onPress={load} style={[styles.retry, { borderColor: p.border.default }]}>
            <Text style={{ color: p.text.primary }}>{s.retry}</Text>
          </Pressable>
        </View>
      ) : null}
      {files !== null && files.length === 0 && !error ? <Text style={[styles.status, { color: p.text.muted }]}>{s.filesEmpty}</Text> : null}
      <FlatList
        data={files || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <View style={[styles.row, { borderColor: p.border.default }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={item.name} onPress={() => onOpen(item)} style={styles.rowMain}>
            <Text numberOfLines={1} style={{ color: p.text.primary, fontWeight: '500' }}>{item.name}</Text>
            <Text numberOfLines={1} style={{ color: p.text.muted, fontSize: 12 }}>
              {fileKindLabel(item.name, item.mimeType)}{item.size ? ` · ${formatFileSize(item.size)}` : ''}{item.uploadedAt ? ` · ${String(item.uploadedAt).slice(0, 10)}` : ''}
            </Text>
            {failedId === item.id ? <Text style={{ color: p.danger, fontSize: 12 }}>{error}</Text> : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={confirmId === item.id ? s.confirmDeleteFileOf(item.name) : s.fileDeleteOf(item.name)}
            onPress={() => drop(item)}
            style={[styles.delete, { borderColor: confirmId === item.id ? p.danger : p.border.default }]}
          >
            <Text style={{ color: confirmId === item.id ? p.danger : p.text.muted }}>{confirmId === item.id ? '!' : '🗑'}</Text>
          </Pressable>
        </View>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  backText: { fontSize: 26, lineHeight: 28 },
  title: { flex: 1, fontSize: 16, fontWeight: '600' },
  status: { padding: 16 },
  statusBox: { padding: 16, gap: 10, alignItems: 'flex-start' },
  retry: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  list: { padding: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  rowMain: { flex: 1, gap: 2 },
  delete: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10 },
});
