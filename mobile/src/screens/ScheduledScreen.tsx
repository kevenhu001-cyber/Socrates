import React, { useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ScheduledTask } from '@socrates/contracts';
import { scheduledApi } from '../data/api/client';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Overlay } from '../components/Overlay';
import { Icon, type NativeIconName } from '../components/Icon';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { appStore } from '../stores/appStore';
import { useResponsive } from '../theme/responsive';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Scheduled'>;
type Draft = { title: string; prompt: string; frequency: string; nextRunAt: string };
const EMPTY_DRAFT: Draft = { title: '', prompt: '', frequency: 'once', nextRunAt: '' };

const FREQUENCIES: Array<[string, string]> = [
  ['once', 'scheduled.once'],
  ['daily', 'scheduled.daily'],
  ['weekly', 'scheduled.weekly'],
  ['monthly', 'scheduled.monthly'],
];

const RECOMMENDATIONS: Array<{ icon: NativeIconName; titleKey: string; titleFallback: string; descriptionKey: string; descriptionFallback: string; prompt: string }> = [
  { icon: 'sun', titleKey: 'scheduled.template.daily', titleFallback: 'Daily briefing', descriptionKey: 'scheduled.template.dailyDesc', descriptionFallback: 'Summarize the updates I care about each morning.', prompt: 'Send me a concise daily briefing with the latest updates on my saved topics.' },
  { icon: 'inbox', titleKey: 'scheduled.template.inbox', titleFallback: 'Inbox check', descriptionKey: 'scheduled.template.inboxDesc', descriptionFallback: 'Surface messages that need my attention.', prompt: 'Check my inbox and tell me which messages need a reply or follow-up.' },
  { icon: 'search', titleKey: 'scheduled.template.research', titleFallback: 'Weekly research pulse', descriptionKey: 'scheduled.template.researchDesc', descriptionFallback: 'Compare the latest work in a topic I follow.', prompt: 'Give me a weekly research briefing comparing the latest work on my chosen topic.' },
  { icon: 'robot', titleKey: 'scheduled.template.digest', titleFallback: 'AI research digest', descriptionKey: 'scheduled.template.digestDesc', descriptionFallback: 'Send the best new work every Friday.', prompt: 'Give me the best new AI research every Friday with a short explanation of why it matters.' },
  { icon: 'laptop', titleKey: 'scheduled.template.project', titleFallback: 'Project status', descriptionKey: 'scheduled.template.projectDesc', descriptionFallback: 'Keep me posted on progress and blockers.', prompt: 'Give me a weekly progress brief on my active project and its next milestone.' },
];

export function ScheduledScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const { isCompact, width } = useResponsive();
  const t = useT();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<ScheduledTask | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ScheduledTask | null>(null);
  const [quickDraft, setQuickDraft] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try { setTasks((await scheduledApi.list()).tasks); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('scheduled.loadFailed')); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const openEditor = (task: ScheduledTask | null) => {
    setEditing(task);
    setEditorOpen(true);
    setDraft({
      title: task?.title || '',
      prompt: task?.prompt || '',
      frequency: task?.frequency || 'once',
      nextRunAt: task?.nextRunAt ? new Date(task.nextRunAt).toISOString().slice(0, 16) : '',
    });
  };

  const save = async () => {
    if (!draft.title.trim() || !draft.prompt.trim() || busy) return;
    setBusy(true);
    try {
      const payload = { ...draft, title: draft.title.trim(), prompt: draft.prompt.trim(), nextRunAt: draft.nextRunAt ? new Date(draft.nextRunAt).toISOString() : null };
      const saved = editing ? await scheduledApi.update(editing.id, payload) : await scheduledApi.create(payload);
      setTasks((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      setEditing(null);
      setEditorOpen(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('scheduled.loadFailed')); }
    finally { setBusy(false); }
  };

  const remove = (task: ScheduledTask) => setPendingDelete(task);

  const confirmRemove = () => {
    const task = pendingDelete;
    if (!task) return;
    setPendingDelete(null);
    void scheduledApi.remove(task.id).then(() => setTasks((current) => current.filter((item) => item.id !== task.id))).catch((caught) => setError(caught instanceof Error ? caught.message : t('scheduled.loadFailed')));
  };

  const toggle = async (task: ScheduledTask) => {
    const active = task.status !== 'paused' && task.status !== 'completed' && task.status !== 'failed';
    try {
      const updated = await scheduledApi.update(task.id, { status: active ? 'paused' : 'active' });
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('scheduled.loadFailed')); }
  };

  const run = async (task: ScheduledTask) => {
    setBusy(true);
    try {
      const updated = await scheduledApi.run(task.id);
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
      await appStore.refreshSessions().catch((err) => {
        console.warn('[Scheduled] Failed to refresh sessions after running task:', err);
      });
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('scheduled.loadFailed')); }
    finally { setBusy(false); }
  };

  const visibleTasks = activeOnly
    ? tasks.filter((task) => task.status !== 'paused' && task.status !== 'completed' && task.status !== 'failed')
    : tasks;

  const openQuickCreate = (prompt?: string, title?: string) => {
    setEditing(null);
    setEditorOpen(true);
    setDraft({ ...EMPTY_DRAFT, title: title || '', prompt: prompt || quickDraft.trim() });
    setQuickDraft('');
  };

  const text = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };

  return (
    <Screen style={styles.screen}>
      <AppHeader
        showNavigation={isCompact}
        showIncognito={false}
        leadingTitle={isCompact ? t('scheduled.heading') : undefined}
        onNewChat={() => { appStore.startNewSession('chat'); navigation.navigate('Home'); }}
      />
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      {loading ? <Text style={[styles.state, { color: colors.textMuted }]}>{t('app.loading')}</Text> : (
        <FlatList
          style={isCompact ? (width < 600 ? styles.listFrameCompactNarrow : styles.listFrameCompactWide) : styles.listFrameDesktop}
          data={visibleTasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, isCompact ? styles.listCompact : styles.listDesktop]}
          ListHeaderComponent={(
            <>
              {isCompact ? (
                <View style={[styles.head, styles.headMobile]}>
                  <AnimatedPressable accessibilityRole="button" accessibilityState={{ selected: activeOnly }} onPress={() => setActiveOnly((value) => !value)} style={[styles.filterButton, styles.filterButtonMobile, { borderColor: colors.border, backgroundColor: activeOnly ? colors.surfaceHover : colors.surface, borderRadius: radius.pill }]}>
                    <Icon name="filter" size={16} color={colors.textMuted} />
                    <Text style={[styles.filterText, { color: colors.textMuted, fontFamily: typography.medium }]}>{activeOnly ? text('scheduled.activeOnly', 'Active') : text('scheduled.allTasks', 'All tasks')}</Text>
                  </AnimatedPressable>
                  <Text style={[styles.subheading, styles.subheadingMobile, { color: colors.textMuted, fontFamily: typography.body }]}>{text('scheduled.subtitle', 'Let Socrates plan follow-ups, reminders, and recurring updates for you.')}</Text>
                </View>
              ) : (
                <View style={[styles.head, styles.headDesktop]}>
                  <View style={styles.headCopy}>
                    <Text style={[styles.heading, { color: colors.text, fontFamily: typography.semibold }]}>{t('scheduled.heading')}</Text>
                  </View>
                  <AnimatedPressable accessibilityRole="button" accessibilityState={{ selected: activeOnly }} onPress={() => setActiveOnly((value) => !value)} style={[styles.filterButton, styles.filterButtonDesktop, { borderColor: colors.border, backgroundColor: activeOnly ? colors.surfaceHover : colors.surface, borderRadius: radius.pill }]}>
                    <Icon name="filter" size={16} color={colors.textMuted} />
                    <Text style={[styles.filterText, { color: colors.textMuted, fontFamily: typography.medium }]}>{activeOnly ? text('scheduled.activeOnly', 'Active') : text('scheduled.allTasks', 'All tasks')}</Text>
                  </AnimatedPressable>
                </View>
              )}
              <View style={[styles.composer, isCompact ? styles.composerMobile : styles.composerDesktop, { backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: radius.pill }]}>
                <AnimatedPressable accessibilityLabel={text('scheduled.createTask', 'Create task')} onPress={() => openQuickCreate()} style={styles.composerButton}><Icon name="plus" size={22} color={colors.textMuted} /></AnimatedPressable>
                <TextInput value={quickDraft} onChangeText={setQuickDraft} onSubmitEditing={() => openQuickCreate()} returnKeyType="send" placeholder={text('scheduled.inputPlaceholder', 'What should Socrates do, and when?')} placeholderTextColor={colors.textMuted} style={[styles.composerInput, { color: colors.text, fontFamily: typography.body }]} />
                <AnimatedPressable accessibilityLabel={text('scheduled.createTask', 'Create task')} onPress={() => openQuickCreate()} style={[styles.composerButton, { backgroundColor: colors.text, borderRadius: radius.pill }]}><Icon name="send" size={17} color={colors.background} /></AnimatedPressable>
              </View>
              <View style={styles.sectionHeading}><Text style={[styles.sectionLabel, { color: colors.text, fontFamily: typography.medium }]}>{text('scheduled.recommendations', 'Suggestions')}</Text><Icon name="chevron-down" size={16} color={colors.textMuted} />{!isCompact ? <Text style={[styles.sectionHint, { color: colors.textMuted, fontFamily: typography.body }]}>{text('scheduled.pickOne', 'Start with a template')}</Text> : null}</View>
              <View style={styles.recommendations}>
                {RECOMMENDATIONS.map((recommendation) => {
                  const title = text(recommendation.titleKey, recommendation.titleFallback);
                  return <AnimatedPressable key={recommendation.titleKey} onPress={() => openQuickCreate(recommendation.prompt, title)} style={[styles.recommendation, { borderBottomColor: withAlpha(colors.border, 0.45) }]}><View style={[styles.recommendationIcon, { backgroundColor: colors.surfaceRaised, borderRadius: radius.md }]}><Icon name={recommendation.icon} size={21} color={colors.textMuted} /></View><View style={styles.recommendationCopy}><Text style={[styles.recommendationTitle, { color: colors.text, fontFamily: typography.medium }]}>{title}</Text><Text numberOfLines={2} style={[styles.recommendationDescription, { color: colors.textMuted, fontFamily: typography.body }]}>{text(recommendation.descriptionKey, recommendation.descriptionFallback)}</Text></View><Icon name="plus" size={18} color={colors.textSubtle} /></AnimatedPressable>;
                })}
              </View>
              {visibleTasks.length ? <View style={styles.taskHeading}><Text style={[styles.sectionLabel, { color: colors.text, fontFamily: typography.medium }]}>{text('scheduled.yourTasks', 'Your tasks')}</Text><Text style={[styles.count, { color: colors.textMuted, fontFamily: typography.medium }]}>{visibleTasks.length}</Text></View> : null}
            </>
          )}
          renderItem={({ item }) => {
            const active = item.status !== 'paused' && item.status !== 'completed' && item.status !== 'failed';
            const statusColor = item.status === 'failed' ? colors.danger : active ? colors.success : colors.warning;
            return <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <View style={[styles.taskIcon, { backgroundColor: withAlpha(statusColor, 0.14), borderRadius: radius.md }]}><Icon name="calendar" size={20} color={statusColor} /></View>
              <AnimatedPressable onPress={() => openEditor(item)} style={styles.main}>
                <Text numberOfLines={1} style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>{item.title}</Text>
                <Text numberOfLines={2} style={[styles.meta, { color: colors.textMuted, fontFamily: typography.body }]}>{statusLabel(item, active, t)}</Text>
              </AnimatedPressable>
              <View style={styles.actions}>
                <AnimatedPressable accessibilityLabel={t('scheduled.runNow')} disabled={busy} onPress={() => { void run(item); }} style={styles.action}><Text style={{ color: colors.accent, fontSize: 12 }}>{t('scheduled.runNow')}</Text></AnimatedPressable>
                <AnimatedPressable accessibilityLabel={active ? t('scheduled.pause') : t('scheduled.resume')} onPress={() => { void toggle(item); }} style={styles.action}><Text style={{ color: colors.textMuted, fontSize: 12 }}>{active ? t('scheduled.pause') : t('scheduled.resume')}</Text></AnimatedPressable>
                <AnimatedPressable accessibilityLabel={t('scheduled.delete')} onPress={() => remove(item)} style={styles.action}><Ionicons name="trash-outline" size={16} color={colors.textMuted} /></AnimatedPressable>
              </View>
            </View>;
          }}
          ListEmptyComponent={<View style={styles.empty}><Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.semibold }]}>{activeOnly ? text('scheduled.noActive', 'No active tasks') : t('scheduled.emptyTitle')}</Text><Text style={[styles.emptyBody, { color: colors.textMuted, fontFamily: typography.body }]}>{activeOnly ? text('scheduled.noActiveDesc', 'Paused and completed tasks are hidden.') : t('scheduled.emptyBody')}</Text><AnimatedPressable onPress={() => openQuickCreate()} style={[styles.primary, { backgroundColor: colors.text, borderRadius: radius.md }]}><Text style={{ color: colors.background, fontFamily: typography.semibold }}>{t('scheduled.create')}</Text></AnimatedPressable></View>}
        />
      )}
      <Overlay visible={editorOpen} presentation="bottom" onClose={() => { setEditorOpen(false); setEditing(null); }} maxWidth={560} testID="scheduled-editor" style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.modalTitle, { color: colors.text, fontFamily: typography.display }]}>{editing ? t('scheduled.edit') : t('scheduled.create')}</Text>
            <Field label={t('scheduled.title')} value={draft.title} placeholder={t('scheduled.title')} onChangeText={(value) => setDraft({ ...draft, title: value })} colors={colors} radius={radius} />
            <Field label={t('scheduled.prompt')} value={draft.prompt} placeholder={t('scheduled.prompt')} onChangeText={(value) => setDraft({ ...draft, prompt: value })} colors={colors} radius={radius} multiline />
            <Text style={[styles.label, { color: colors.textMuted }]}>{t('scheduled.frequency')}</Text>
            <View style={styles.frequencyRow}>{FREQUENCIES.map(([value, key]) => <AnimatedPressable key={value} onPress={() => setDraft({ ...draft, frequency: value })} style={[styles.frequency, { borderColor: draft.frequency === value ? colors.accent : colors.border, backgroundColor: draft.frequency === value ? colors.accentSoft : colors.background, borderRadius: radius.md }]}><Text style={{ color: draft.frequency === value ? colors.accent : colors.textMuted, fontSize: 12 }}>{t(key)}</Text></AnimatedPressable>)}</View>
            <Field label={t('scheduled.firstRun')} value={draft.nextRunAt} placeholder="YYYY-MM-DDTHH:mm" onChangeText={(value) => setDraft({ ...draft, nextRunAt: value })} colors={colors} radius={radius} />
            <View style={styles.modalActions}>
              {editing ? <AnimatedPressable onPress={() => { setEditorOpen(false); setEditing(null); remove(editing); }} style={styles.deleteAction}><Text style={{ color: colors.danger }}>{t('scheduled.delete')}</Text></AnimatedPressable> : <View />}
              <AnimatedPressable onPress={() => { setEditorOpen(false); setEditing(null); }} style={styles.secondary}><Text style={{ color: colors.textMuted }}>{t('common.cancel')}</Text></AnimatedPressable>
              <AnimatedPressable disabled={busy || !draft.title.trim() || !draft.prompt.trim()} onPress={() => { void save(); }} style={[styles.primarySmall, { backgroundColor: colors.accent, borderRadius: radius.md }]}><Text style={{ color: colors.background, fontFamily: typography.semibold }}>{busy ? t('app.loading') : t('scheduled.save')}</Text></AnimatedPressable>
            </View>
          </ScrollView>
      </Overlay>
      <ConfirmDialog
        visible={pendingDelete !== null}
        title={t('scheduled.delete')}
        message={pendingDelete?.title}
        confirmLabel={t('scheduled.delete')}
        cancelLabel={t('common.cancel')}
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmRemove}
      />
    </Screen>
  );
}

function statusLabel(task: ScheduledTask, active: boolean, t: (key: string) => string) {
  const status = task.status === 'paused' ? t('scheduled.paused') : task.status === 'completed' ? t('scheduled.completed') : task.status === 'failed' ? t('scheduled.failed') : active ? t('scheduled.active') : task.status;
  const frequency = t(`scheduled.${task.frequency === 'daily' || task.frequency === 'weekly' || task.frequency === 'monthly' ? task.frequency : 'once'}`);
  const next = task.nextRunAt ? ` · ${new Date(task.nextRunAt).toLocaleString()}` : '';
  return `${status} · ${frequency}${next}`;
}

function Field({ label, value, placeholder, onChangeText, colors, radius, multiline = false }: { label: string; value: string; placeholder: string; onChangeText: (value: string) => void; colors: { text: string; textMuted: string; textSubtle: string; background: string; border: string }; radius: { md: number } ; multiline?: boolean }) {
  return <View style={styles.field}><Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textSubtle} multiline={multiline} style={[styles.input, multiline && styles.multiline, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, borderRadius: radius.md }]} /></View>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  listFrameCompactNarrow: { marginTop: 0 },
  listFrameCompactWide: { marginTop: 0 },
  listFrameDesktop: { flex: 1 },
  list: { paddingBottom: 40 },
  listCompact: { paddingHorizontal: 16 },
  listDesktop: { width: '100%', maxWidth: 704, alignSelf: 'center', paddingHorizontal: 0, paddingTop: 72 },
  head: { gap: 14 },
  headMobile: { paddingTop: 0, gap: 0 },
  headDesktop: { paddingTop: 0, paddingBottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 11, letterSpacing: 1.7 },
  heading: { fontSize: 30, lineHeight: 36, letterSpacing: -0.5 },
  subheading: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  subheadingMobile: { fontSize: 17, lineHeight: 26, marginTop: 10 },
  filterButton: { minHeight: 42, alignSelf: 'flex-start', borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13 },
  filterButtonMobile: { marginTop: 9 },
  filterButtonDesktop: { minHeight: 36, paddingHorizontal: 12 },
  filterText: { fontSize: 13 },
  composer: { borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 6 },
  composerMobile: { minHeight: 84, marginTop: 22, marginBottom: 21 },
  composerDesktop: { minHeight: 58, marginTop: 32, marginBottom: 22 },
  composerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  composerInput: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 14, paddingVertical: 0 },
  sectionHeading: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  sectionLabel: { fontSize: 14 },
  sectionHint: { flex: 1, fontSize: 12, marginLeft: 7 },
  recommendations: { marginBottom: 24 },
  recommendation: { minHeight: 72, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  recommendationIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  recommendationCopy: { flex: 1, minWidth: 0, gap: 3 },
  recommendationTitle: { fontSize: 16, lineHeight: 22 },
  recommendationDescription: { fontSize: 14, lineHeight: 20 },
  taskHeading: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7 },
  count: { fontSize: 12 },
  row: { minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  taskIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 4 },
  title: { fontSize: 14 },
  meta: { fontSize: 11, lineHeight: 17 },
  actions: { alignItems: 'flex-end', gap: 2 },
  action: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 3 },
  empty: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 30 },
  emptyTitle: { fontSize: 16, textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9 },
  primary: { minHeight: 44, minWidth: 150, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 20 },
  error: { marginHorizontal: 18, marginTop: 8, fontSize: 12 },
  state: { textAlign: 'center', marginTop: 48 },
  modal: { maxHeight: '88%', borderWidth: 1, padding: 20 },
  modalTitle: { fontSize: 24, marginBottom: 12 },
  field: { marginTop: 12 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 7 },
  input: { minHeight: 46, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  multiline: { minHeight: 92, textAlignVertical: 'top', paddingTop: 12 },
  frequencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  frequency: { minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  modalActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 },
  primarySmall: { minHeight: 44, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  secondary: { minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  deleteAction: { minHeight: 44, justifyContent: 'center', flex: 1 },
});
