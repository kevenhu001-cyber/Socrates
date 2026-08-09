import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { useAppStore, appStore } from '../stores/appStore';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { artifactsApi, filesApi } from '../data/api/client';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Library'>;
type Tab = 'chats' | 'uploads' | 'created';

export function RecentsScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const state = useAppStore();
  const [tab, setTab] = useState<Tab>('chats');
  const [files, setFiles] = useState<Array<Record<string, unknown>>>([]);
  const [artifacts, setArtifacts] = useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = useState(false);
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
    Alert.alert(String(item.name || t('library.upload')), `${String(item.mimeType || '')}\n${formatBytes(Number(item.size || 0))}`);
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
              <AnimatedPressable onPress={() => { void openItem(item); }} style={[styles.row, { borderBottomColor: colors.border }]}> 
                <View style={[styles.icon, { backgroundColor: colors.surfaceRaised, borderRadius: radius.sm }]}>
                  <Ionicons name={icon} size={20} color={colors.textMuted} />
                </View>
                <View style={styles.copy}>
                  <Text numberOfLines={1} style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>{title}</Text>
                  <Text numberOfLines={1} style={[styles.preview, { color: colors.textMuted, fontFamily: typography.body }]}>{preview}</Text>
                </View>
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 110 },
  emptyTitle: { fontSize: 17, marginTop: 13 },
  loading: { marginTop: 56 },
  error: { fontSize: 12, lineHeight: 18, marginHorizontal: 18, marginTop: 12 },
});
