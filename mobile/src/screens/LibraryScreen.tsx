import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { artifactsApi, filesApi } from '../data/api/client';
import { useAppStore } from '../stores/appStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Library'>;

type Tab = 'files' | 'artifacts';

export function LibraryScreen({ navigation }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const t = useT();
  const state = useAppStore();
  const user = state.user;
  const [tab, setTab] = useState<Tab>('files');
  const [files, setFiles] = useState<Array<Record<string, unknown>>>([]);
  const [artifacts, setArtifacts] = useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [fileRes, artRes] = await Promise.all([filesApi.list(), artifactsApi.list()]);
      setFiles(fileRes.files || []);
      setArtifacts(artRes.artifacts || []);
      setLoaded(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('library.refreshFailed'));
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const tabs: { id: Tab; label: string }[] = useMemo(
    () => [
      { id: 'files', label: t('library.uploads') || 'Files' },
      { id: 'artifacts', label: t('library.artifact') ? `${t('library.artifact')}s` : 'Artifacts' },
    ],
    [t]
  );

  const data = tab === 'files' ? files : artifacts;
  const emptyTitle = t('library.emptyTitle') || 'Nothing here yet';
  const emptyBody =
    tab === 'files'
      ? t('library.emptyBody') || 'Files you upload in a chat will appear here.'
      : t('library.artifactsEmpty') || 'Artifacts you generate will appear here.';

  return (
    <Screen style={styles.screen}>
      <AppHeader
        title={t('sidebar.nav.library') || 'Library'}
        onNewChat={() => navigation.navigate('Home')}
      />
      <View style={styles.body}>
        <View
          style={[
            styles.tabs,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.lg,
              marginHorizontal: spacing.md,
              marginTop: spacing.sm,
            },
          ]}
        >
          {tabs.map((entry) => {
            const active = tab === entry.id;
            return (
              <AnimatedPressable
                key={entry.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={entry.label}
                onPress={() => setTab(entry.id)}
                style={[
                  styles.tab,
                  {
                    backgroundColor: active ? colors.surfaceHover : 'transparent',
                    borderRadius: radius.md,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      color: active ? colors.text : colors.textMuted,
                      fontFamily: active ? typography.semibold : typography.medium,
                    },
                  ]}
                >
                  {entry.label}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
        {error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : null}
        <FlatList
          data={data}
          keyExtractor={(item, index) => String(item.id || index)}
          contentContainerStyle={
            loaded && data.length === 0
              ? styles.emptyContent
              : { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xl }
          }
          refreshControl={
            <RefreshControl
              refreshing={busy}
              onRefresh={() => {
                void load();
              }}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={
            busy && !loaded ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons
                  name={tab === 'files' ? 'document-outline' : 'cube-outline'}
                  size={36}
                  color={colors.textSubtle}
                />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>{emptyTitle}</Text>
                <Text style={[styles.emptyBody, { color: colors.textMuted }]}>{emptyBody}</Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <AnimatedPressable
              accessibilityLabel={String(item.name || item.title || 'item')}
              onPress={() => {
                if (tab === 'files') {
                  const url = filesApi.rawUrl(String(item.id || ''));
                  void Linking.openURL(url).catch(() => undefined);
                }
              }}
              style={[
                styles.row,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: radius.md,
                  marginBottom: spacing.sm,
                },
              ]}
            >
              <Ionicons
                name={tab === 'files' ? 'document-text-outline' : 'sparkles-outline'}
                size={20}
                color={colors.accent}
              />
              <View style={styles.rowMain}>
                <Text
                  numberOfLines={1}
                  style={[styles.rowTitle, { color: colors.text, fontFamily: typography.semibold }]}
                >
                  {String(item.name || item.title || t('library.untitled'))}
                </Text>
                {item.mimeType || item.kind ? (
                  <Text style={[styles.rowMeta, { color: colors.textMuted }]}>
                    {String(item.mimeType || item.kind || '')}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
            </AnimatedPressable>
          )}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  body: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tab: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  tabText: { fontSize: 13 },
  error: { fontSize: 13, marginHorizontal: 18, marginTop: 10 },
  emptyContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyWrap: { alignItems: 'center', paddingVertical: 24 },
  emptyTitle: { fontSize: 18, marginTop: 12 },
  emptyBody: { fontSize: 13, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14 },
  rowMeta: { fontSize: 12, marginTop: 3 },
});
