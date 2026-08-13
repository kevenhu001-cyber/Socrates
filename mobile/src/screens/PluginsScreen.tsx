import React, { useEffect, useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ProjectConnector } from '@socrates/contracts';
import { projectConnectorsApi } from '../data/api/client';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { appStore } from '../stores/appStore';
import { native } from '../native/native';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Plugins'>;
type CredentialDraft = Record<string, string>;

export function PluginsScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const [connectors, setConnectors] = useState<ProjectConnector[]>([]);
  const [configured, setConfigured] = useState(false);
  const [selected, setSelected] = useState<ProjectConnector | null>(null);
  const [credentials, setCredentials] = useState<CredentialDraft>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <Screen style={styles.screen}>
      <AppHeader title={t('plugins.heading')} onNewChat={() => { appStore.startNewSession('chat'); navigation.navigate('Home'); }} />
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      {loading ? <Text style={[styles.state, { color: colors.textMuted }]}>{t('app.loading')}</Text> : (
        <FlatList
          data={connectors}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const connection = item.connection;
            const connected = connection?.status === 'connected';
            const pending = connection?.status === 'initiated';
            return <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <View style={[styles.mark, { backgroundColor: colors.surfaceRaised, borderRadius: radius.sm }]}><Text style={{ color: colors.accent, fontWeight: '800' }}>{item.name.slice(0, 2).toUpperCase()}</Text></View>
              <View style={styles.copy}><Text style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>{item.name}</Text><Text numberOfLines={2} style={[styles.description, { color: colors.textMuted, fontFamily: typography.body }]}>{connected ? `${t('plugins.connected')}${connection?.displayName ? ` · ${connection.displayName}` : ''}` : pending ? t('plugins.refresh') : item.description || ''}</Text></View>
              {connected ? <Text style={{ color: colors.success, fontSize: 12 }}>{t('plugins.connected')}</Text> : pending ? <AnimatedPressable onPress={() => { void refresh(item); }} style={styles.action}><Text style={{ color: colors.accent, fontSize: 12 }}>{t('plugins.refresh')}</Text></AnimatedPressable> : !configured ? <Text style={{ color: colors.textSubtle, fontSize: 11 }}>{t('plugins.serverSetup')}</Text> : <AnimatedPressable onPress={() => { setSelected(item); setCredentials({}); }} style={[styles.connect, { borderColor: colors.border, borderRadius: radius.md }]}><Text style={{ color: colors.textMuted, fontSize: 12 }}>{t('plugins.connect')}</Text></AnimatedPressable>}
            </View>;
          }}
          ListEmptyComponent={<View style={styles.empty}><Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.display }]}>{t('plugins.emptyTitle')}</Text><Text style={[styles.emptyBody, { color: colors.textMuted }]}>{t('plugins.emptyBody')}</Text></View>}
          ListFooterComponent={configured && connectors.length ? <Text style={[styles.note, { color: colors.textSubtle }]}>{t('plugins.oauthNote')}</Text> : null}
        />
      )}
      <Modal visible={selected !== null} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.modalTitle, { color: colors.text, fontFamily: typography.display }]}>{selected ? t('plugins.formTitle', { name: selected.name }) : ''}</Text>
            {selected?.credentialInput?.fields.map((field) => <View key={field.key} style={styles.field}><Text style={[styles.label, { color: colors.textMuted }]}>{field.label}</Text><TextInput value={credentials[field.key] || ''} onChangeText={(value) => setCredentials({ ...credentials, [field.key]: value })} secureTextEntry={field.type === 'password'} keyboardType={field.type === 'email' ? 'email-address' : 'default'} placeholderTextColor={colors.textSubtle} placeholder={field.help || field.label} style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, borderRadius: radius.md }]} />{field.help ? <Text style={[styles.help, { color: colors.textSubtle }]}>{field.help}</Text> : null}</View>)}
            <View style={styles.modalActions}><AnimatedPressable onPress={() => setSelected(null)} style={styles.secondary}><Text style={{ color: colors.textMuted }}>{t('common.cancel')}</Text></AnimatedPressable><AnimatedPressable disabled={busy} onPress={() => { if (selected) void connect(selected); }} style={[styles.primary, { backgroundColor: colors.accent, borderRadius: radius.md }]}><Text style={{ color: colors.background, fontWeight: '700' }}>{busy ? t('app.loading') : t('plugins.connect')}</Text></AnimatedPressable></View>
          </ScrollView>
        </View></View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({ screen: { paddingTop: 0 }, list: { paddingHorizontal: 18, paddingBottom: 28 }, row: { minHeight: 86, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 11 }, mark: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, minWidth: 0 }, title: { fontSize: 15 }, description: { fontSize: 12, lineHeight: 18, marginTop: 5 }, action: { minHeight: 44, justifyContent: 'center' }, connect: { minHeight: 36, paddingHorizontal: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, note: { fontSize: 12, lineHeight: 18, marginTop: 18 }, error: { marginHorizontal: 18, marginTop: 8, fontSize: 12 }, state: { textAlign: 'center', marginTop: 48 }, empty: { alignItems: 'center', paddingTop: 120 }, emptyTitle: { fontSize: 24 }, emptyBody: { fontSize: 14, marginTop: 10 }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', justifyContent: 'flex-end' }, modal: { maxHeight: '88%', borderWidth: 1, padding: 20 }, modalTitle: { fontSize: 24, marginBottom: 12 }, field: { marginTop: 12 }, label: { fontSize: 11, fontWeight: '700', marginBottom: 7 }, input: { minHeight: 46, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 }, help: { fontSize: 11, lineHeight: 16, marginTop: 5 }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 20 }, secondary: { minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }, primary: { minHeight: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' }, });
