import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ScheduledTask } from '@socrates/contracts';
import { scheduledApi } from '../data/api/client';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { appStore } from '../stores/appStore';
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

export function ScheduledScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<ScheduledTask | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  const remove = (task: ScheduledTask) => Alert.alert(t('scheduled.delete'), t('common.delete'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('scheduled.delete'), style: 'destructive', onPress: () => void scheduledApi.remove(task.id).then(() => setTasks((current) => current.filter((item) => item.id !== task.id))).catch((caught) => setError(caught instanceof Error ? caught.message : t('scheduled.loadFailed'))) },
  ]);

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

  return (
    <Screen style={styles.screen}>
      <AppHeader title={t('scheduled.heading')} onNewChat={() => { appStore.startNewSession('chat'); navigation.navigate('Home'); }} />
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      {loading ? <Text style={[styles.state, { color: colors.textMuted }]}>{t('app.loading')}</Text> : tasks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.display }]}>{t('scheduled.emptyTitle')}</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted, fontFamily: typography.body }]}>{t('scheduled.emptyBody')}</Text>
          <AnimatedPressable onPress={() => openEditor(null)} style={[styles.primary, { backgroundColor: colors.text, borderRadius: radius.md }]}><Text style={{ color: colors.background, fontFamily: typography.semibold }}>{t('scheduled.create')}</Text></AnimatedPressable>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const active = item.status !== 'paused' && item.status !== 'completed' && item.status !== 'failed';
            return <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <View style={[styles.icon, { backgroundColor: active ? colors.accentSoft : colors.surfaceRaised, borderRadius: radius.sm }]}><Text style={{ color: active ? colors.accent : colors.textSubtle }}>✓</Text></View>
              <AnimatedPressable onPress={() => openEditor(item)} style={styles.main}>
                <Text numberOfLines={1} style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>{item.title}</Text>
                <Text numberOfLines={2} style={[styles.meta, { color: colors.textMuted, fontFamily: typography.body }]}>{statusLabel(item, active, t)}</Text>
              </AnimatedPressable>
              <View style={styles.actions}>
                <AnimatedPressable accessibilityLabel={t('scheduled.runNow')} disabled={busy} onPress={() => { void run(item); }} style={styles.action}><Text style={{ color: colors.accent, fontSize: 12 }}>{t('scheduled.runNow')}</Text></AnimatedPressable>
                <AnimatedPressable accessibilityLabel={active ? t('scheduled.pause') : t('scheduled.resume')} onPress={() => { void toggle(item); }} style={styles.action}><Text style={{ color: colors.textMuted, fontSize: 12 }}>{active ? t('scheduled.pause') : t('scheduled.resume')}</Text></AnimatedPressable>
              </View>
            </View>;
          }}
        />
      )}
      {tasks.length ? <AnimatedPressable onPress={() => openEditor(null)} style={[styles.floating, { backgroundColor: colors.accent, borderRadius: radius.pill }]}><Text style={{ color: colors.background, fontSize: 24 }}>+</Text></AnimatedPressable> : null}
      <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={() => { setEditorOpen(false); setEditing(null); }}>
        <View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}>
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
        </View></View>
      </Modal>
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

const styles = StyleSheet.create({ screen: { paddingTop: 0 }, list: { paddingHorizontal: 18, paddingBottom: 100 }, row: { minHeight: 86, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 }, icon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }, main: { flex: 1, minWidth: 0, justifyContent: 'center' }, title: { fontSize: 15 }, meta: { fontSize: 11, lineHeight: 17, marginTop: 5 }, actions: { alignItems: 'flex-end' }, action: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 3 }, empty: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 120 }, emptyTitle: { fontSize: 24, textAlign: 'center' }, emptyBody: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 10 }, primary: { minHeight: 48, minWidth: 150, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 24 }, floating: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, alignItems: 'center', justifyContent: 'center', elevation: 5 }, error: { marginHorizontal: 18, marginTop: 8, fontSize: 12 }, state: { textAlign: 'center', marginTop: 48 }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', justifyContent: 'flex-end' }, modal: { maxHeight: '88%', borderWidth: 1, padding: 20 }, modalTitle: { fontSize: 24, marginBottom: 12 }, field: { marginTop: 12 }, label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 7 }, input: { minHeight: 46, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 }, multiline: { minHeight: 92, textAlignVertical: 'top', paddingTop: 12 }, frequencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, frequency: { minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, modalActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 }, primarySmall: { minHeight: 44, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' }, secondary: { minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }, deleteAction: { minHeight: 44, justifyContent: 'center', flex: 1 }, });
