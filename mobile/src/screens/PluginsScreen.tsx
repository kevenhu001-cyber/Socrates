import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ProjectConnector } from '@socrates/contracts';
import { projectConnectorsApi } from '../data/api/client';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Overlay } from '../components/Overlay';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { appStore } from '../stores/appStore';
import { native } from '../native/native';
import { Icon } from '../components/Icon';
import { useResponsive } from '../theme/responsive';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Plugins'>;
type CredentialDraft = Record<string, string>;

export function PluginsScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const { isCompact } = useResponsive();
  const t = useT();
  const [connectors, setConnectors] = useState<ProjectConnector[]>([]);
  const [configured, setConfigured] = useState(false);
  const [selected, setSelected] = useState<ProjectConnector | null>(null);
  const [credentials, setCredentials] = useState<CredentialDraft>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'public' | 'personal'>('public');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await projectConnectorsApi.list();
      setConnectors(result.connectors);
      setConfigured(result.configured);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('plugins.emptyBody')); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const connect = async (connector: ProjectConnector) => {
    setBusy(true);
    setError('');
    try {
      const fields = connector.credentialInput?.fields || [];
      const body = connector.authType === 'api_key' ? { apiKey: credentials[fields[0]?.key || 'apiKey'] || '' } : { values: Object.fromEntries(fields.map((field) => [field.key, credentials[field.key] || ''])) };
      if (connector.authType === 'api_key' && !body.apiKey) throw new Error(t('plugins.connectFailed'));
      if (connector.authType === 'custom_credential' && fields.some((field) => field.required && !credentials[field.key])) throw new Error(t('plugins.connectFailed'));
      const result = await projectConnectorsApi.connect(connector.id, connector.authType === 'oauth' ? undefined : body);
      if (result.authorizationUrl) {
        await native.openBrowser(result.authorizationUrl);
      }
      setSelected(null);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('plugins.connectFailed')); }
    finally { setBusy(false); }
  };

  const refresh = async (connector: ProjectConnector) => {
    try {
      const result = await projectConnectorsApi.status(connector.id);
      setConnectors((current) => current.map((item) => item.id === connector.id ? { ...item, connection: result.connection } : item));
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('plugins.connectFailed')); }
  };

  const installed = useMemo(
    () => connectors.filter((connector) => connector.connection?.status === 'connected' || connector.connection?.status === 'initiated'),
    [connectors],
  );
  const visibleConnectors = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return connectors.filter((connector) => {
      const isInstalled = connector.connection?.status === 'connected' || connector.connection?.status === 'initiated';
      if (scope === 'personal' && !isInstalled) return false;
      if (!needle) return true;
      return [connector.name, connector.description, ...(connector.capabilities || [])].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
  }, [connectors, query, scope]);

  const text = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };

  const renderAction = (connector: ProjectConnector) => {
    const connection = connector.connection;
    if (connection?.status === 'connected') {
      return <AnimatedPressable accessibilityLabel={`${text('plugins.manage', 'Manage')} ${connector.name}`} onPress={() => { setSelected(connector); setCredentials({}); }} style={[styles.iconAction, { backgroundColor: colors.surfaceHover, borderRadius: radius.pill }]}><Icon name="more" size={18} color={colors.textMuted} /></AnimatedPressable>;
    }
    if (connection?.status === 'initiated') {
      return <AnimatedPressable accessibilityLabel={`${text('plugins.refreshStatus', 'Refresh')} ${connector.name}`} onPress={() => { void refresh(connector); }} style={[styles.iconAction, { backgroundColor: colors.surfaceHover, borderRadius: radius.pill }]}><Icon name="refresh" size={17} color={colors.textMuted} /></AnimatedPressable>;
    }
    const isOpenConnector = connector.id.startsWith('oc_');
    const available = (connector as ProjectConnector & { available?: boolean }).available;
    const connectable = available !== false && (isOpenConnector || configured);
    if (!connectable) return <Ionicons name="lock-closed-outline" size={16} color={colors.textSubtle} />;
    return <AnimatedPressable accessibilityLabel={`${text('plugins.connect', 'Connect')} ${connector.name}`} onPress={() => { setSelected(connector); setCredentials({}); }} style={[styles.iconAction, { backgroundColor: colors.surfaceHover, borderRadius: radius.pill }]}><Icon name="plus" size={20} color={colors.textMuted} /></AnimatedPressable>;
  };

  return (
    <Screen style={styles.screen}>
      <AppHeader showNavigation={isCompact} showIncognito={false} onNewChat={() => { appStore.startNewSession('chat'); navigation.navigate('Home'); }} />
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      {loading ? <Text style={[styles.state, { color: colors.textMuted }]}>{t('app.loading')}</Text> : (
        <FlatList
          data={visibleConnectors}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={(
            <>
              <View style={styles.head}>
                <View style={styles.headCopy}>
                  <Text style={[styles.heading, { color: colors.text, fontFamily: typography.semibold }]}>{t('plugins.heading')}</Text>
                  <Text style={[styles.description, { color: colors.textMuted, fontFamily: typography.body }]}>{text('plugins.directoryDesc', 'Connect apps so Socrates can use them in chat.')}</Text>
                </View>
                <View style={styles.tools}>
                  <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill }]}>
                    <Icon name="search" size={18} color={colors.textMuted} />
                    <TextInput
                      accessibilityLabel={text('plugins.search', 'Search plugins')}
                      value={query}
                      onChangeText={setQuery}
                      placeholder={text('plugins.search', 'Search plugins')}
                      placeholderTextColor={colors.textSubtle}
                      style={[styles.searchInput, { color: colors.text, fontFamily: typography.body }]}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {query ? <AnimatedPressable onPress={() => setQuery('')} style={styles.clearSearch}><Icon name="close" size={16} color={colors.textSubtle} /></AnimatedPressable> : null}
                  </View>
                  <AnimatedPressable accessibilityLabel={text('plugins.add', 'Add plugin')} onPress={() => { void load(); }} style={[styles.add, { borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.pill }]}><Icon name="plus" size={22} color={colors.text} /></AnimatedPressable>
                </View>
              </View>
              {installed.length ? (
                <AnimatedPressable accessibilityRole="button" accessibilityLabel={text('plugins.installed', 'Installed')} onPress={() => setScope('personal')} style={styles.installedStrip}>
                  <View style={styles.installedLabel}><Text style={[styles.installedTitle, { color: colors.textMuted, fontFamily: typography.medium }]}>{text('plugins.installed', 'Installed')}</Text><Ionicons name="chevron-forward" size={15} color={colors.textSubtle} /></View>
                  <View style={styles.installedIcons}>{installed.map((connector) => <View key={connector.id} style={[styles.installedIcon, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.md }]}><Text style={[styles.markText, { color: colors.accent, fontFamily: typography.semibold }]}>{connector.name.slice(0, 2).toUpperCase()}</Text></View>)}</View>
                </AnimatedPressable>
              ) : null}
              <View style={styles.scopeTabs}>
                {([
                  ['public', text('plugins.public', 'Public')],
                  ['personal', text('plugins.personal', 'Personal')],
                ] as const).map(([value, label]) => {
                  const active = scope === value;
                  return <AnimatedPressable key={value} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setScope(value)} style={[styles.scopeTab, active && { backgroundColor: colors.surfaceHover, borderRadius: radius.pill }]}><Text style={[styles.scopeText, { color: active ? colors.text : colors.textMuted, fontFamily: active ? typography.semibold : typography.medium }]}>{label}</Text></AnimatedPressable>;
                })}
              </View>
            </>
          )}
          renderItem={({ item }) => {
            const connection = item.connection;
            const connected = connection?.status === 'connected';
            const pending = connection?.status === 'initiated';
            return <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <View style={[styles.mark, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.md }]}><Text style={[styles.markText, { color: colors.accent, fontFamily: typography.semibold }]}>{item.name.slice(0, 2).toUpperCase()}</Text></View>
              <View style={styles.copy}><Text style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>{item.name}</Text><Text numberOfLines={2} style={[styles.description, { color: colors.textMuted, fontFamily: typography.body }]}>{connected ? `${t('plugins.connected')}${connection?.displayName ? ` · ${connection.displayName}` : ''}` : pending ? t('plugins.refresh') : item.description || ''}</Text></View>
              <View style={styles.rowAction}>{renderAction(item)}</View>
            </View>;
          }}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name={query ? 'search-outline' : 'extension-puzzle-outline'} size={34} color={colors.textSubtle} /><Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.semibold }]}>{query ? text('plugins.noMatch', 'No matching plugins') : t('plugins.emptyTitle')}</Text><Text style={[styles.emptyBody, { color: colors.textMuted }]}>{query ? text('plugins.tryDifferent', 'Try a different search.') : t('plugins.emptyBody')}</Text></View>}
          ListFooterComponent={configured && connectors.length ? <Text style={[styles.note, { color: colors.textSubtle }]}>{t('plugins.oauthNote')}</Text> : null}
        />
      )}
      <Overlay visible={selected !== null} presentation="bottom" onClose={() => setSelected(null)} maxWidth={560} testID="plugin-credentials" style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.modalTitle, { color: colors.text, fontFamily: typography.display }]}>{selected ? t('plugins.formTitle', { name: selected.name }) : ''}</Text>
            {selected?.credentialInput?.fields.map((field) => <View key={field.key} style={styles.field}><Text style={[styles.label, { color: colors.textMuted }]}>{field.label}</Text><TextInput value={credentials[field.key] || ''} onChangeText={(value) => setCredentials({ ...credentials, [field.key]: value })} secureTextEntry={field.type === 'password'} keyboardType={field.type === 'email' ? 'email-address' : 'default'} placeholderTextColor={colors.textSubtle} placeholder={field.help || field.label} style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, borderRadius: radius.md }]} />{field.help ? <Text style={[styles.help, { color: colors.textSubtle }]}>{field.help}</Text> : null}</View>)}
            <View style={styles.modalActions}><AnimatedPressable onPress={() => setSelected(null)} style={styles.secondary}><Text style={{ color: colors.textMuted }}>{t('common.cancel')}</Text></AnimatedPressable><AnimatedPressable disabled={busy} onPress={() => { if (selected) void connect(selected); }} style={[styles.primary, { backgroundColor: colors.accent, borderRadius: radius.md }]}><Text style={{ color: colors.background, fontWeight: '700' }}>{busy ? t('app.loading') : t('plugins.connect')}</Text></AnimatedPressable></View>
          </ScrollView>
      </Overlay>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  head: { paddingTop: 26, paddingBottom: 20, gap: 16 },
  headCopy: { maxWidth: 620 },
  heading: { fontSize: 30, lineHeight: 36, letterSpacing: -0.5 },
  description: { fontSize: 17, lineHeight: 26, marginTop: 4 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: { flex: 1, minHeight: 42, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  searchInput: { flex: 1, minHeight: 42, fontSize: 14, paddingVertical: 0 },
  clearSearch: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  add: { width: 40, height: 42, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  installedStrip: { marginBottom: 18 },
  installedLabel: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 10 },
  installedTitle: { fontSize: 13 },
  installedIcons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  installedIcon: { width: 42, height: 42, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  scopeTabs: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48, marginBottom: 10 },
  scopeTab: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 18 },
  scopeText: { fontSize: 14 },
  row: { minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 14 },
  mark: { width: 42, height: 42, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  markText: { fontSize: 12, letterSpacing: 0.3 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 14 },
  rowAction: { minWidth: 36, alignItems: 'center', justifyContent: 'center' },
  iconAction: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 12, lineHeight: 18, marginTop: 18 },
  error: { marginHorizontal: 18, marginTop: 8, fontSize: 12 },
  state: { textAlign: 'center', marginTop: 48 },
  empty: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 56 },
  emptyTitle: { fontSize: 16, marginTop: 12 },
  emptyBody: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  modal: { maxHeight: '88%', borderWidth: 1, padding: 20 },
  modalTitle: { fontSize: 24, marginBottom: 12 },
  field: { marginTop: 12 },
  label: { fontSize: 11, fontWeight: '700', marginBottom: 7 },
  input: { minHeight: 46, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  help: { fontSize: 11, lineHeight: 16, marginTop: 5 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
  secondary: { minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  primary: { minHeight: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
});
