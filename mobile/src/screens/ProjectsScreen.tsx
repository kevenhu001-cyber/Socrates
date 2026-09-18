import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Project } from '@socrates/contracts';
import { projectsApi } from '../data/api/client';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Overlay } from '../components/Overlay';
import { Icon } from '../components/Icon';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/ThemeProvider';
import { colors as themeColors, withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { appStore } from '../stores/appStore';
import { useResponsive } from '../theme/responsive';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Projects'>;
type Draft = { name: string; description: string; systemPrompt: string; color: string };

const EMPTY_DRAFT: Draft = { name: '', description: '', systemPrompt: '', color: themeColors.accent };

export function ProjectsScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const { isCompact, width } = useResponsive();
  const t = useT();
  const [projects, setProjects] = useState<Project[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<Project | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'owned' | 'shared'>('all');

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

  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => {
      const record = project as Project & { shared?: boolean; isShared?: boolean; visibility?: string };
      const isShared = record.shared === true || record.isShared === true || record.visibility === 'shared';
      const matchesScope = scope === 'all' || (scope === 'shared' ? isShared : !isShared);
      if (!matchesScope) return false;
      if (!needle) return true;
      return [project.name, project.description].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
  }, [projects, query, scope]);

  const closeEditor = () => {
    setEditorOpen(false);
    setEditing(null);
  };

  const text = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };

  const searchField = (
    <View style={[styles.search, isCompact ? styles.searchMobile : styles.searchDesktop, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill }]}>
      <Icon name="search" size={17} color={colors.textMuted} />
      <TextInput
        accessibilityLabel={text('projects.searchPlaceholder', 'Search projects')}
        value={query}
        onChangeText={setQuery}
        placeholder={text('projects.searchPlaceholder', 'Search projects')}
        placeholderTextColor={colors.textSubtle}
        style={[styles.searchInput, { color: colors.text, fontFamily: typography.body }]}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {query ? <AnimatedPressable onPress={() => setQuery('')} style={styles.clearSearch}><Icon name="close" size={16} color={colors.textSubtle} /></AnimatedPressable> : null}
    </View>
  );
  const createButton = (
    <AnimatedPressable accessibilityLabel={text('projects.new', 'New')} onPress={() => openEditor(null)} style={[styles.create, isCompact ? styles.createMobile : styles.createDesktop, { backgroundColor: colors.text, borderRadius: radius.pill }]}>
      {!isCompact ? <Icon name="plus" size={17} color={colors.background} /> : null}
      <Text style={[styles.createText, { color: colors.background, fontFamily: typography.semibold }]}>{text('projects.new', 'New')}</Text>
    </AnimatedPressable>
  );

  return (
    <Screen style={styles.screen}>
      <AppHeader
        showNavigation={isCompact}
        showIncognito={false}
        leadingTitle={isCompact ? t('projects.heading') : undefined}
        headerAction={isCompact ? createButton : undefined}
        onNewChat={() => { appStore.startNewSession('chat'); navigation.navigate('Home'); }}
      />
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      {loading ? <Text style={[styles.state, { color: colors.textMuted }]}>{t('app.loading')}</Text> : (
        <FlatList
          style={isCompact ? styles.listFrameCompact : styles.listFrameDesktop}
          data={visibleProjects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, isCompact ? (width < 600 ? styles.listCompactNarrow : styles.listCompactWide) : styles.listDesktop]}
          ListHeaderComponent={(
            <>
              {isCompact ? (
                <View style={[styles.head, styles.headMobile, width < 600 ? styles.headMobileNarrow : styles.headMobileWide]}>
                  {searchField}
                </View>
              ) : (
                <View style={[styles.head, styles.headDesktop]}>
                  <View style={styles.headCopy}>
                    <Text style={[styles.heading, { color: colors.text, fontFamily: typography.semibold }]}>{t('projects.heading')}</Text>
                    <Text style={[styles.description, { color: colors.textMuted, fontFamily: typography.body }]}>{text('projects.directoryDesc', 'Keep related chats, files, and instructions together.')}</Text>
                  </View>
                  <View style={styles.headActions}>{searchField}{createButton}</View>
                </View>
              )}
              <View style={[styles.filterTabs, isCompact ? styles.filterTabsMobile : styles.filterTabsDesktop, { borderBottomColor: withAlpha(colors.border, 0.45) }]}>
                {([
                  ['all', text('projects.all', 'All')],
                  ['owned', text('projects.owned', 'Created by you')],
                  ['shared', text('projects.shared', 'Shared with you')],
                ] as const).map(([value, label]) => {
                  const active = scope === value;
                  return <AnimatedPressable key={value} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setScope(value)} style={[styles.filterTab, active && { backgroundColor: colors.surfaceHover, borderRadius: radius.pill }]}><Text style={[styles.filterText, { color: active ? colors.text : colors.textMuted, fontFamily: active ? typography.semibold : typography.medium }]}>{label}</Text></AnimatedPressable>;
                })}
              </View>
            </>
          )}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <AnimatedPressable onPress={() => startProjectChat(item)} style={styles.main}>
                <View style={[styles.projectIcon, { backgroundColor: withAlpha(item.color || colors.accent, 0.13), borderRadius: radius.md }]}>
                  <Icon name="folder" size={22} color={item.color || colors.accent} />
                </View>
                <View style={styles.copy}>
                  <Text numberOfLines={1} style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>{item.name}</Text>
                  <Text numberOfLines={2} style={[styles.rowDescription, { color: colors.textMuted, fontFamily: typography.body }]}>{item.description || text('projects.emptyBody', 'Projects keep related chats, files, and instructions together.')}</Text>
                </View>
              </AnimatedPressable>
              <AnimatedPressable accessibilityLabel={t('projects.edit')} onPress={() => openEditor(item)} style={[styles.action, { backgroundColor: colors.surfaceHover, borderRadius: radius.pill }]}>
                <Icon name="more" size={18} color={colors.textMuted} />
              </AnimatedPressable>
            </View>
          )}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.semibold }]}>{query ? text('projects.noMatch', 'No matching projects') : t('projects.emptyTitle')}</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted, fontFamily: typography.body }]}>{query ? text('projects.noMatchDesc', 'Try a different search.') : t('projects.emptyBody')}</Text>
              {!query ? <AnimatedPressable onPress={() => openEditor(null)} style={[styles.primary, { backgroundColor: colors.text, borderRadius: radius.md }]}><Text style={{ color: colors.background, fontFamily: typography.semibold }}>{t('projects.create')}</Text></AnimatedPressable> : null}
            </View>
          )}
        />
      )}
      <Overlay visible={editorOpen} presentation="bottom" onClose={closeEditor} maxWidth={560} testID="project-editor" style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: colors.text, fontFamily: typography.display }]}>{editing ? t('projects.edit') : t('projects.create')}</Text>
              <Field label={t('projects.name')} value={draft.name} placeholder={t('projects.namePlaceholder')} onChangeText={(value) => setDraft({ ...draft, name: value })} colors={colors} radius={radius} />
              <Field label={t('projects.description')} value={draft.description} placeholder={t('projects.descriptionPlaceholder')} onChangeText={(value) => setDraft({ ...draft, description: value })} colors={colors} radius={radius} />
              <Field label={t('projects.instructions')} value={draft.systemPrompt} placeholder={t('projects.instructionsPlaceholder')} onChangeText={(value) => setDraft({ ...draft, systemPrompt: value })} colors={colors} radius={radius} multiline />
              <View style={styles.modalActions}>
                {editing ? <AnimatedPressable onPress={() => { closeEditor(); remove(editing); }} style={styles.deleteAction}><Text style={{ color: colors.danger }}>{t('projects.delete')}</Text></AnimatedPressable> : <View />}
                <AnimatedPressable onPress={closeEditor} style={styles.secondary}><Text style={{ color: colors.textMuted }}>{t('common.cancel')}</Text></AnimatedPressable>
                <AnimatedPressable disabled={busy || !draft.name.trim()} onPress={() => { void save(); }} style={[styles.primarySmall, { backgroundColor: colors.accent, borderRadius: radius.md }]}><Text style={{ color: colors.background, fontFamily: typography.semibold }}>{busy ? t('app.loading') : t('projects.save')}</Text></AnimatedPressable>
              </View>
            </ScrollView>
      </Overlay>
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

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  listFrameCompact: { marginTop: 0 },
  listFrameDesktop: { flex: 1 },
  list: { paddingBottom: 40, flexGrow: 1 },
  listCompactNarrow: { paddingHorizontal: 16 },
  listCompactWide: { paddingHorizontal: 20 },
  listDesktop: { width: '100%', maxWidth: 768, alignSelf: 'center', paddingHorizontal: 0, paddingTop: 72 },
  head: { gap: 16 },
  headMobile: { paddingHorizontal: 0 },
  headMobileNarrow: { paddingTop: 7, gap: 0 },
  headMobileWide: { paddingTop: 25, gap: 0 },
  headDesktop: { paddingBottom: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  headCopy: { maxWidth: 620 },
  heading: { fontSize: 30, lineHeight: 36, letterSpacing: -0.5 },
  description: { fontSize: 14, lineHeight: 22, marginTop: 7 },
  headActions: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  search: { minHeight: 42, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12 },
  searchMobile: { width: '100%' },
  searchDesktop: { width: 240 },
  searchInput: { flex: 1, minHeight: 42, fontSize: 14, paddingVertical: 0 },
  clearSearch: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  create: { minHeight: 42, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14 },
  createMobile: { width: 65, minWidth: 65, marginLeft: 'auto', marginRight: -8, paddingHorizontal: 0 },
  createDesktop: { minWidth: 69 },
  createText: { fontSize: 14 },
  filterTabs: { borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 4 },
  filterTabsMobile: { minHeight: 41, marginTop: 32, marginBottom: 0 },
  filterTabsDesktop: { minHeight: 56, marginTop: 32, marginBottom: 0 },
  filterTab: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16 },
  filterText: { fontSize: 16 },
  row: { minHeight: 82, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16, minWidth: 0, paddingVertical: 10 },
  projectIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 15 },
  rowDescription: { fontSize: 13, lineHeight: 20 },
  action: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 24 },
  emptyTitle: { fontSize: 16, textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10 },
  primary: { minHeight: 44, minWidth: 150, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 20 },
  primarySmall: { minHeight: 44, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  secondary: { minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  deleteAction: { minHeight: 44, justifyContent: 'center', flex: 1 },
  error: { marginHorizontal: 18, marginTop: 8, fontSize: 12 },
  state: { textAlign: 'center', marginTop: 48 },
  modal: { maxHeight: '88%', borderWidth: 1, padding: 20 },
  modalTitle: { fontSize: 24, marginBottom: 12 },
  field: { marginTop: 12 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 7 },
  input: { minHeight: 46, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  multiline: { minHeight: 92, textAlignVertical: 'top', paddingTop: 12 },
  modalActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 },
});
