import React, { useEffect, useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Project } from '@socrates/contracts';
import { projectsApi } from '../data/api/client';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/ThemeProvider';
import { colors as themeColors } from '../theme/theme';
import { useT } from '../i18n';
import { appStore } from '../stores/appStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Projects'>;
type Draft = { name: string; description: string; systemPrompt: string; color: string };

const EMPTY_DRAFT: Draft = { name: '', description: '', systemPrompt: '', color: themeColors.accent };

export function ProjectsScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const [projects, setProjects] = useState<Project[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<Project | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try { setProjects((await projectsApi.list()).projects); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('projects.loadFailed')); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const openEditor = (project: Project | null) => {
    setEditing(project);
    setEditorOpen(true);
    setDraft({
      name: project?.name || '',
      description: project?.description || '',
      systemPrompt: project?.systemPrompt || '',
      color: project?.color || themeColors.accent,
    });
  };

  const save = async () => {
    if (!draft.name.trim() || busy) return;
    setBusy(true);
    try {
      const payload = { ...draft, name: draft.name.trim() };
      const saved = editing ? await projectsApi.update(editing.id, payload) : await projectsApi.create(payload);
      setProjects((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      void appStore.refreshProjects().catch(() => undefined);
      setEditing(null);
      setEditorOpen(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('projects.loadFailed')); }
    finally { setBusy(false); }
  };

  const remove = (project: Project) => setPendingDelete(project);

  const confirmRemove = () => {
    const project = pendingDelete;
    if (!project) return;
    setPendingDelete(null);
    void projectsApi.remove(project.id)
      .then(() => {
        setProjects((current) => current.filter((item) => item.id !== project.id));
        return appStore.refreshProjects();
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : t('projects.loadFailed')));
  };

  const startProjectChat = (project: Project) => {
    navigation.navigate('Home', { projectId: project.id });
  };

  return (
    <Screen style={styles.screen}>
      <AppHeader title={t('projects.heading')} onNewChat={() => { appStore.startNewSession('chat'); navigation.navigate('Home'); }} />
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      {loading ? <Text style={[styles.state, { color: colors.textMuted }]}>{t('app.loading')}</Text> : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <AnimatedPressable onPress={() => startProjectChat(item)} style={styles.main}>
                <View style={[styles.swatch, { backgroundColor: item.color || colors.accent, borderRadius: radius.pill }]} />
                <View style={styles.copy}>
                  <Text numberOfLines={1} style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>{item.name}</Text>
                  <Text numberOfLines={2} style={[styles.description, { color: colors.textMuted, fontFamily: typography.body }]}>{item.description || t('projects.emptyBody')}</Text>
                </View>
              </AnimatedPressable>
              <AnimatedPressable accessibilityLabel={t('projects.edit')} onPress={() => openEditor(item)} style={styles.action}>
                <Text style={{ color: colors.accent, fontFamily: typography.medium }}>{t('projects.edit')}</Text>
              </AnimatedPressable>
            </View>
          )}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.display }]}>{t('projects.emptyTitle')}</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted, fontFamily: typography.body }]}>{t('projects.emptyBody')}</Text>
              <AnimatedPressable onPress={() => openEditor(null)} style={[styles.primary, { backgroundColor: colors.text, borderRadius: radius.md }]}>
                <Text style={{ color: colors.background, fontFamily: typography.semibold }}>{t('projects.create')}</Text>
              </AnimatedPressable>
            </View>
          )}
        />
      )}
      {projects.length ? <AnimatedPressable onPress={() => openEditor(null)} style={[styles.floating, { backgroundColor: colors.accent, borderRadius: radius.pill }]}><Text style={{ color: colors.background, fontSize: 24 }}>+</Text></AnimatedPressable> : null}
      <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={() => { setEditorOpen(false); setEditing(null); }}>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.scrim }]}>
          <View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: colors.text, fontFamily: typography.display }]}>{editing ? t('projects.edit') : t('projects.create')}</Text>
              <Field label={t('projects.name')} value={draft.name} placeholder={t('projects.namePlaceholder')} onChangeText={(value) => setDraft({ ...draft, name: value })} colors={colors} radius={radius} />
              <Field label={t('projects.description')} value={draft.description} placeholder={t('projects.descriptionPlaceholder')} onChangeText={(value) => setDraft({ ...draft, description: value })} colors={colors} radius={radius} />
              <Field label={t('projects.instructions')} value={draft.systemPrompt} placeholder={t('projects.instructionsPlaceholder')} onChangeText={(value) => setDraft({ ...draft, systemPrompt: value })} colors={colors} radius={radius} multiline />
              <View style={styles.modalActions}>
                {editing ? <AnimatedPressable onPress={() => { setEditorOpen(false); setEditing(null); remove(editing); }} style={styles.deleteAction}><Text style={{ color: colors.danger }}>{t('projects.delete')}</Text></AnimatedPressable> : <View />}
                <AnimatedPressable onPress={() => { setEditorOpen(false); setEditing(null); }} style={styles.secondary}><Text style={{ color: colors.textMuted }}>{t('common.cancel')}</Text></AnimatedPressable>
                <AnimatedPressable disabled={busy || !draft.name.trim()} onPress={() => { void save(); }} style={[styles.primarySmall, { backgroundColor: colors.accent, borderRadius: radius.md }]}><Text style={{ color: colors.background, fontFamily: typography.semibold }}>{busy ? t('app.loading') : t('projects.save')}</Text></AnimatedPressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <ConfirmDialog
        visible={pendingDelete !== null}
        title={t('projects.delete')}
        message={pendingDelete ? t('projects.deleteConfirm') : undefined}
        confirmLabel={t('projects.delete')}
        cancelLabel={t('common.cancel')}
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmRemove}
      />
    </Screen>
  );
}

function Field({ label, value, placeholder, onChangeText, colors, radius, multiline = false }: { label: string; value: string; placeholder: string; onChangeText: (value: string) => void; colors: ReturnType<typeof import('../theme/ThemeProvider').useTheme>['colors']; radius: ReturnType<typeof import('../theme/ThemeProvider').useTheme>['radius']; multiline?: boolean }) {
  return <View style={styles.field}><Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textSubtle} multiline={multiline} style={[styles.input, multiline && styles.multiline, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, borderRadius: radius.md }]} /></View>;
}

const styles = StyleSheet.create({ screen: { paddingTop: 0 }, list: { paddingHorizontal: 18, paddingBottom: 100, flexGrow: 1 }, row: { minHeight: 84, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 }, main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }, swatch: { width: 10, height: 10, borderRadius: 5 }, copy: { flex: 1, minWidth: 0 }, title: { fontSize: 16 }, description: { fontSize: 12, lineHeight: 18, marginTop: 5 }, action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }, empty: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 120 }, emptyTitle: { fontSize: 24, textAlign: 'center' }, emptyBody: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 10 }, primary: { minHeight: 48, minWidth: 150, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 24 }, primarySmall: { minHeight: 44, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' }, secondary: { minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }, deleteAction: { minHeight: 44, justifyContent: 'center', flex: 1 }, floating: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, alignItems: 'center', justifyContent: 'center', elevation: 5 }, error: { marginHorizontal: 18, marginTop: 8, fontSize: 12 }, state: { textAlign: 'center', marginTop: 48 }, modalBackdrop: { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' }, modal: { maxHeight: '88%', borderWidth: 1, padding: 20 }, modalTitle: { fontSize: 24, marginBottom: 12 }, field: { marginTop: 12 }, label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 7 }, input: { minHeight: 46, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 }, multiline: { minHeight: 92, textAlignVertical: 'top', paddingTop: 12 }, modalActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 }, });
