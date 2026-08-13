import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Session } from '@socrates/contracts';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { useAppStore, appStore } from '../stores/appStore';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { artifactsApi, filesApi } from '../data/api/client';
import { native } from '../native/native';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Library'>;
type Tab = 'chats' | 'uploads' | 'created';
type FilePreview = { name: string; mimeType: string; text: string; truncated: boolean };

export function RecentsScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const state = useAppStore();
  const [tab, setTab] = useState<Tab>('chats');
  const [files, setFiles] = useState<Array<Record<string, unknown>>>([]);
  const [artifacts, setArtifacts] = useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async (active = tab) => {
    setBusy(true);
    setError('');
    try {
      if (active === 'chats') await appStore.refreshSessions();
      if (active === 'uploads') setFiles((await filesApi.list()).files);
      if (active === 'created') setArtifacts((await artifactsApi.list()).artifacts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('library.refreshFailed'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void load(tab); }, [tab]);

  const data = useMemo<Array<Record<string, unknown>>>(() => {
    if (tab === 'chats') return state.sessions.map((item) => ({ ...item, _kind: 'session' }));
    if (tab === 'uploads') return files.map((item) => ({ ...item, _kind: 'file' }));
    return artifacts.map((item) => ({ ...item, _kind: 'artifact' }));
  }, [artifacts, files, state.sessions, tab]);

  const openItem = async (item: Record<string, unknown>) => {
    if (item._kind === 'session') {
      await appStore.openSession(String(item.id));
      navigation.navigate('Chat');
      return;
    }
    if (item._kind === 'artifact') {
      const artifact = await artifactsApi.get(String(item.id));
      navigation.navigate('ArtifactPreview', {
        artifactId: String(artifact.id),
        html: String(artifact.source || ''),
      });
      return;
    }
    try {
      const result = await filesApi.content(String(item.id));
      setPreview({ name: result.name, mimeType: result.mimeType, text: result.text, truncated: result.truncated });
    } catch (caught) {
      Alert.alert(String(item.name || t('library.upload')), caught instanceof Error ? caught.message : t('library.previewUnavailable'));
    }
  };

  const upload = async () => {
    const result = await native.pickFile();
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    setError('');
    try {
      const asset = result.assets[0];
      await filesApi.upload({ uri: asset.uri, name: asset.name || asset.fileName || 'attachment', mimeType: asset.mimeType, size: asset.size || asset.fileSize });
      await load('uploads');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('library.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const openSessionActions = (item: Record<string, unknown>) => {
    const sessionId = String(item.id);
    const title = String(item.title || item.topic || t('library.untitled'));
    const pinned = item.pinned === true;
    Alert.alert(title, undefined, [
      { text: t('library.rename'), onPress: () => { setRenameId(sessionId); setRenameValue(title); } },
      { text: pinned ? t('library.unpin') : t('library.pin'), onPress: () => { void appStore.togglePinnedSession(item as unknown as Pick<Session, 'id' | 'pinned'>).catch((caught) => setError(caught instanceof Error ? caught.message : t('library.refreshFailed'))); } },
      { text: t('library.archive'), onPress: () => { void appStore.archiveSession(sessionId).catch((caught) => setError(caught instanceof Error ? caught.message : t('library.refreshFailed'))); } },
      { text: t('library.deleteChat'), style: 'destructive', onPress: () => Alert.alert(t('library.deleteChat'), t('library.deleteChatConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => { void appStore.deleteSession(sessionId).catch((caught) => setError(caught instanceof Error ? caught.message : t('library.refreshFailed'))); } },
      ]) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const saveRename = async () => {
    if (!renameId || !renameValue.trim()) return;
    setRenameBusy(true);
    try {
      await appStore.renameSession(renameId, renameValue);
      setRenameId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('library.refreshFailed'));
    } finally {
      setRenameBusy(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <AppHeader title={t('library.heading')} onNewChat={() => { appStore.startNewSession('chat'); navigation.navigate('Home'); }} />
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}> 
        {([
          ['chats', t('library.chats')],
          ['uploads', t('library.uploads')],
          ['created', t('library.created')],
        ] as Array<[Tab, string]>).map(([value, label]) => (
          <AnimatedPressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={styles.tab}>
            <Text style={[styles.tabText, { color: tab === value ? colors.text : colors.textMuted, fontFamily: typography.medium }]}>{label}</Text>
            {tab === value ? <View style={[styles.tabLine, { backgroundColor: colors.accent }]} /> : null}
          </AnimatedPressable>
        ))}
        {tab === 'uploads' ? <AnimatedPressable accessibilityLabel={t('library.upload')} onPress={() => { void upload(); }} disabled={uploading} style={styles.refresh}>
          <Ionicons name="cloud-upload-outline" size={21} color={uploading ? colors.textSubtle : colors.accent} />
        </AnimatedPressable> : null}
        <AnimatedPressable accessibilityLabel={t('library.refresh')} onPress={() => { void load(); }} style={styles.refresh}>
          <Ionicons name="refresh-outline" size={21} color={colors.textMuted} />
        </AnimatedPressable>
      </View>
      {error ? <Text style={[styles.error, { color: colors.danger, fontFamily: typography.body }]}>{error}</Text> : null}
      {busy ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : (
        <FlatList
          data={data}
          keyExtractor={(item, index) => String(item.id || index)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const kind = String(item._kind);
            const title = String(item.title || item.name || item.topic || t('library.untitled'));
            const preview = kind === 'session'
              ? String(item.preview || item.topic || t('library.noMessages'))
              : kind === 'file'
                ? `${String(item.mimeType || t('library.upload'))} · ${formatBytes(Number(item.size || 0))}`
                : `${String(item.type || t('library.artifact'))} · ${String(item.language || '')}`;
            const icon = kind === 'session' ? 'chatbubble-outline' : kind === 'file' ? 'document-outline' : 'sparkles-outline';
            return (
              <AnimatedPressable
                onPress={() => { void openItem(item); }}
                onLongPress={kind === 'session' ? () => openSessionActions(item) : undefined}
                style={[styles.row, { borderBottomColor: colors.border }]}
              >
                <View style={[styles.icon, { backgroundColor: colors.surfaceRaised, borderRadius: radius.sm }]}>
                  <Ionicons name={icon} size={20} color={colors.textMuted} />
                </View>
                <View style={styles.copy}>
                  <Text numberOfLines={1} style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>{title}</Text>
                  <Text numberOfLines={1} style={[styles.preview, { color: colors.textMuted, fontFamily: typography.body }]}>{preview}</Text>
                </View>
                {kind === 'session' && item.pinned === true ? <Ionicons name="pin" size={15} color={colors.accent} /> : null}
                {kind === 'session' ? <AnimatedPressable accessibilityLabel={`${title}: ${t('common.more')}`} onPress={() => openSessionActions(item)} style={styles.more}><Ionicons name="ellipsis-horizontal" size={20} color={colors.textSubtle} /></AnimatedPressable> : null}
                <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
              </AnimatedPressable>
            );
          }}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <Ionicons name="library-outline" size={34} color={colors.textSubtle} />
              <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.semibold }]}>{t('library.emptyTitle')}</Text>
              <Text style={[styles.preview, { color: colors.textMuted, fontFamily: typography.body }]}>{t('library.emptyBody')}</Text>
            </View>
          )}
        />
      )}
      <Modal visible={Boolean(preview)} transparent animationType="slide" onRequestClose={() => setPreview(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.previewModal, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}>
            <View style={styles.previewHeader}>
              <View style={styles.previewTitleWrap}>
                <Text numberOfLines={1} style={[styles.previewTitle, { color: colors.text, fontFamily: typography.semibold }]}>{preview?.name || t('library.preview')}</Text>
                {preview?.mimeType ? <Text style={[styles.previewMime, { color: colors.textMuted }]}>{preview.mimeType}</Text> : null}
              </View>
              <AnimatedPressable accessibilityLabel={t('library.closePreview')} onPress={() => setPreview(null)} style={styles.close}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </AnimatedPressable>
            </View>
            <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewContent}>
              <Text selectable style={[styles.previewText, { color: colors.text }]}>{preview?.text || t('library.previewUnavailable')}</Text>
            </ScrollView>
            {preview?.truncated ? <Text style={[styles.truncated, { color: colors.textMuted }]}>{t('library.previewTruncated')}</Text> : null}
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(renameId)} transparent animationType="fade" onRequestClose={() => setRenameId(null)}>
        <View style={styles.renameBackdrop}>
          <View style={[styles.renameCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}
          >
            <Text style={[styles.renameTitle, { color: colors.text, fontFamily: typography.semibold }]}>{t('library.rename')}</Text>
            <TextInput
              autoFocus
              value={renameValue}
              onChangeText={setRenameValue}
              onSubmitEditing={() => { void saveRename(); }}
              placeholder={t('library.renamePlaceholder')}
              placeholderTextColor={colors.textSubtle}
              style={[styles.renameInput, { color: colors.text, borderColor: colors.borderStrong, backgroundColor: colors.background, borderRadius: radius.sm, fontFamily: typography.body }]}
              returnKeyType="done"
            />
            <View style={styles.renameActions}>
              <AnimatedPressable onPress={() => setRenameId(null)} style={styles.renameButton}><Text style={[styles.renameButtonText, { color: colors.textMuted, fontFamily: typography.medium }]}>{t('common.cancel')}</Text></AnimatedPressable>
              <AnimatedPressable disabled={renameBusy || !renameValue.trim()} onPress={() => { void saveRename(); }} style={[styles.renameButton, { backgroundColor: colors.accent, borderRadius: radius.sm }]}><Text style={[styles.renameButtonText, { color: colors.white, fontFamily: typography.medium }]}>{t('library.saveName')}</Text></AnimatedPressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  tabs: { minHeight: 50, marginHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'stretch' },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 13 },
  tabLine: { position: 'absolute', left: 10, right: 10, bottom: -1, height: 2, borderRadius: 1 },
  refresh: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 18, paddingBottom: 24, flexGrow: 1 },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  icon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 15 },
  preview: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  more: { width: 36, height: 42, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 110 },
  emptyTitle: { fontSize: 17, marginTop: 13 },
  loading: { marginTop: 56 },
  error: { fontSize: 12, lineHeight: 18, marginHorizontal: 18, marginTop: 12 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  previewModal: { maxHeight: '88%', minHeight: '42%', borderWidth: 1, padding: 18 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12 },
  previewTitleWrap: { flex: 1, minWidth: 0 },
  previewTitle: { fontSize: 18 },
  previewMime: { fontSize: 11, marginTop: 4 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  previewScroll: { flex: 1 },
  previewContent: { paddingVertical: 10 },
  previewText: { fontFamily: 'monospace', fontSize: 13, lineHeight: 20 },
  truncated: { fontSize: 11, lineHeight: 16, paddingTop: 12 },
  renameBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  renameCard: { width: '100%', maxWidth: 420, borderWidth: 1, padding: 18 },
  renameTitle: { fontSize: 18, marginBottom: 14 },
  renameInput: { minHeight: 46, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 14 },
  renameButton: { minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  renameButtonText: { fontSize: 13 },
});
