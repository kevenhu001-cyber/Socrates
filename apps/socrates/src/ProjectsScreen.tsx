import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Project } from '@socrates/contracts';
import type { ThemeMode } from '@socrates/theme';
import { getThemePaletteHex } from '@socrates/theme';

// Projects/Library screen — migration module 5 (Chat/Composer → Sidebar/Nav
// → Auth → Settings → Library/Projects → …). Pure RN UI; data comes from
// props so App.tsx owns fetching/caching. Supports list + select-to-filter +
// create + rename + delete, and a pick mode for "move session to project".
export function ProjectsScreen({
  mode,
  projects,
  activeProjectId,
  loading,
  error,
  pickMode,
  onClose,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onRetry,
}: {
  mode: ThemeMode;
  projects: Project[];
  activeProjectId: string | null;
  loading: boolean;
  error: string | null;
  /** When set, tapping a row picks the move target instead of filtering. */
  pickMode?: { sessionTitle: string } | null;
  onClose(): void;
  onSelectProject(id: string | null): void;
  onCreateProject(name: string): Promise<void>;
  onRenameProject(id: string, name: string): Promise<void>;
  onDeleteProject(id: string): Promise<void>;
  onRetry(): void;
}) {
  const p = getThemePaletteHex(mode);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canCreate = draft.trim().length > 0 && !creating;

  const create = async () => {
    if (!canCreate) return;
    setCreating(true);
    setOperationError(null);
    try {
      await onCreateProject(draft.trim());
      setDraft('');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'Operation failed');
    } finally {
      setCreating(false);
    }
  };

  const commitRename = async (id: string) => {
    const name = editName.trim();
    if (!name || busyId) return;
    setBusyId(id);
    setOperationError(null);
    try {
      await onRenameProject(id, name);
      setEditingId(null);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'Operation failed');
    } finally {
      setBusyId(null);
    }
  };

  const commitDelete = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setOperationError(null);
    try {
      await onDeleteProject(id);
      if (confirmDeleteId === id) setConfirmDeleteId(null);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'Operation failed');
    } finally {
      setBusyId(null);
    }
  };

  const pick = (id: string | null) => {
    onSelectProject(id);
    onClose();
  };

  const headerTitle = pickMode ? `Move “${pickMode.sessionTitle}” to…` : 'Projects';

  return (
    <View style={[styles.wrap, { backgroundColor: p.bg.page }]}>
      <View style={[styles.header, { borderBottomColor: p.border.default }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to chat" onPress={onClose} style={styles.back}>
          <Text style={[styles.backText, { color: p.text.primary }]}>‹</Text>
        </Pressable>
        <Text numberOfLines={1} style={[styles.title, { color: p.text.primary }]}>{headerTitle}</Text>
        <View style={styles.back} />
      </View>

      <View style={styles.body}>
        {operationError ? <Text accessibilityRole="alert" style={[styles.status, { color: p.danger }]}>{operationError}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pickMode ? 'Remove from project' : 'All chats'}
          accessibilityState={{ selected: !pickMode && activeProjectId === null }}
          onPress={() => pick(null)}
          style={[styles.row, { borderColor: p.border.default }, !pickMode && activeProjectId === null && { backgroundColor: p.bg.hover }]}
        >
          <Text style={[styles.rowTitle, { color: p.text.primary }]}>{pickMode ? 'No project (unfiled)' : 'All chats'}</Text>
          <Text style={[styles.rowSub, { color: p.text.muted }]}>{pickMode ? 'Remove the session from its project' : 'No project filter'}</Text>
        </Pressable>

        {loading && !projects.length ? (
          <Text style={[styles.status, { color: p.text.muted }]}>Loading projects…</Text>
        ) : null}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={[styles.status, { color: p.danger }]}>{error}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Retry loading projects" onPress={() => onRetry()} style={[styles.chip, { borderColor: p.border.default }]}>
              <Text style={[styles.chipText, { color: p.text.primary }]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !error && !projects.length ? (
          <Text style={[styles.status, { color: p.text.muted }]}>
            No projects yet. Create a project to organize your sessions.
          </Text>
        ) : null}

        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isEditing = editingId === item.id;
            const busy = busyId === item.id;
            return (
              <View
                style={[styles.row, { borderColor: p.border.default }, !pickMode && item.id === activeProjectId && { backgroundColor: p.bg.hover }]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={pickMode ? `Move to ${item.name}` : `Project ${item.name}`}
                  accessibilityState={{ selected: !pickMode && item.id === activeProjectId }}
                  onPress={() => { if (!isEditing) pick(item.id); }}
                >
                  <View style={styles.rowHead}>
                    <View style={[styles.dot, { backgroundColor: item.color || p.text.muted }]} />
                    {isEditing ? (
                      <TextInput
                        accessibilityLabel={`Rename ${item.name}`}
                        value={editName}
                        onChangeText={setEditName}
                        placeholderTextColor={p.text.muted}
                        style={[styles.renameInput, { borderColor: p.border.default, color: p.text.primary }]}
                        onSubmitEditing={() => void commitRename(item.id)}
                      />
                    ) : (
                      <Text numberOfLines={1} style={[styles.rowTitle, { color: p.text.primary }]}>{item.name}</Text>
                    )}
                  </View>
                  {!isEditing && item.description ? <Text numberOfLines={2} style={[styles.rowSub, { color: p.text.muted }]}>{item.description}</Text> : null}
                </Pressable>
                {!pickMode ? (
                  <View style={styles.rowActions}>
                    {isEditing ? (
                      <>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Save name for ${item.name}`} disabled={busy} onPress={() => void commitRename(item.id)} style={styles.miniBtn}>
                          <Text style={[styles.miniBtnText, { color: p.text.primary }]}>✓</Text>
                        </Pressable>
                        <Pressable accessibilityRole="button" accessibilityLabel="Cancel rename" onPress={() => setEditingId(null)} style={styles.miniBtn}>
                          <Text style={[styles.miniBtnText, { color: p.text.muted }]}>✕</Text>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Rename ${item.name}`} onPress={() => { setEditName(item.name); setEditingId(item.id); setConfirmDeleteId(null); }} style={styles.miniBtn}>
                        <Text style={[styles.miniBtnText, { color: p.text.muted }]}>✎</Text>
                      </Pressable>
                    )}
                    {confirmDeleteId === item.id ? (
                      <>
                        <Text style={[styles.rowSub, { color: p.danger }]}>Permanently delete this project and its conversations, files and artifacts?</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Confirm delete ${item.name}`} disabled={busy} onPress={() => void commitDelete(item.id)} style={styles.miniBtn}>
                          <Text style={[styles.miniBtnText, { color: p.danger }]}>{busy ? '…' : 'Delete?'}</Text>
                        </Pressable>
                        <Pressable accessibilityRole="button" accessibilityLabel="Cancel delete" onPress={() => setConfirmDeleteId(null)} style={styles.miniBtn}>
                          <Text style={[styles.miniBtnText, { color: p.text.muted }]}>✕</Text>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.name}`} onPress={() => { setConfirmDeleteId(item.id); setEditingId(null); }} style={styles.miniBtn}>
                        <Text style={[styles.miniBtnText, { color: p.text.muted }]}>🗑</Text>
                      </Pressable>
                    )}
                  </View>
                ) : null}
              </View>
            );
          }}
        />

        {!pickMode ? (
          <View style={[styles.createBox, { borderColor: p.border.default }]}>
            <TextInput
              accessibilityLabel="New project name"
              value={draft}
              onChangeText={setDraft}
              placeholder="New project name"
              placeholderTextColor={p.text.muted}
              style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]}
              onSubmitEditing={() => void create()}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create project"
              disabled={!canCreate}
              onPress={() => void create()}
              style={[styles.createBtn, { backgroundColor: p.text.primary, opacity: canCreate ? 1 : 0.4 }]}
            >
              <Text style={[styles.createBtnText, { color: p.onAccent }]}>{creating ? '…' : '+'}</Text>
            </Pressable>
          </View>
        ) : null}
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
  row: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowTitle: { fontSize: 16, fontWeight: '600', flex: 1 },
  rowSub: { fontSize: 13, marginTop: 4 },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  miniBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  miniBtnText: { fontSize: 15, fontWeight: '600' },
  renameInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16 },
  status: { textAlign: 'center', marginVertical: 12 },
  errorBox: { alignItems: 'center', marginVertical: 8 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8 },
  chipText: { fontSize: 14, fontWeight: '600' },
  createBox: { flexDirection: 'row', gap: 8, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  createBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  createBtnText: { fontSize: 22, fontWeight: '700' },
});
