import React from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { fontStyle, getThemePaletteHex, type ThemeMode } from '@socrates/theme';
import { Icon } from '@socrates/ui';
import { appStrings, type AppLanguage } from './strings';

export type ShareDialogVisibility = 'public' | 'private';

export function ShareDialog({
  open, visibility, url, busy, status, error, mode, language = 'en',
  onSelectVisibility, onCopy, onCreate, onRevoke, onClose,
}: {
  open: boolean;
  visibility: ShareDialogVisibility;
  url: string;
  busy: boolean;
  status: string;
  error: string;
  mode: ThemeMode;
  language?: AppLanguage;
  onSelectVisibility(value: ShareDialogVisibility): void;
  onCopy(): void;
  onCreate(): void;
  onRevoke(): void;
  onClose(): void;
}) {
  const p = getThemePaletteHex(mode);
  const s = appStrings(language);
  if (!open) return null;
  const option = (value: ShareDialogVisibility, title: string, description: string) => {
    const selected = value === visibility;
    return <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => onSelectVisibility(value)} style={[styles.option, { backgroundColor: p.bg.raised, borderColor: selected ? p.accent.strong : p.border.subtle }]}>
      <View style={[styles.radio, { borderColor: selected ? p.accent.strong : p.text.muted }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: p.accent.strong }]} /> : null}
      </View>
      <View style={styles.optionBody}>
        <Text style={[styles.optionTitle, { color: p.text.primary, ...fontStyle('medium', language, Platform.OS === 'web') }]}>{title}</Text>
        <Text style={[styles.optionDescription, { color: p.text.muted }]}>{description}</Text>
      </View>
    </Pressable>;
  };
  return <View style={styles.overlay} accessibilityViewIsModal>
    <Pressable accessibilityRole="button" accessibilityLabel={s.shareClose} onPress={onClose} style={StyleSheet.absoluteFill} />
    <View style={[styles.dialog, { backgroundColor: p.bg.page, borderColor: p.border.subtle }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: p.text.primary, ...fontStyle('semibold', language, Platform.OS === 'web') }]}>{s.shareTitle}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={s.shareClose} onPress={onClose} style={styles.close}>
          <Icon name="close" size={16} color={p.text.muted} />
        </Pressable>
      </View>
      {option('public', s.sharePublicTitle, s.sharePublicDescription)}
      {option('private', s.sharePrivateTitle, s.sharePrivateDescription)}
      {url ? <View style={styles.linkRow}>
        <TextInput accessibilityLabel={s.shareLinkLabel} value={url} editable={false} selectTextOnFocus style={[styles.linkInput, { color: p.text.primary, backgroundColor: p.bg.hover, borderColor: p.border.subtle }]} />
        <Pressable accessibilityRole="button" accessibilityLabel={s.shareCopy} disabled={busy} onPress={onCopy} style={[styles.copyButton, { backgroundColor: p.accent.strong, opacity: busy ? 0.6 : 1 }]}>
        <Text style={[styles.copyText, { color: p.onAccent, ...fontStyle('medium', language, Platform.OS === 'web') }]}>{s.shareCopy}</Text>
        </Pressable>
      </View> : null}
      {error ? <Text accessibilityRole="alert" style={[styles.message, { color: p.danger }]}>{error}</Text> : null}
      {status ? <Text accessibilityLiveRegion="polite" style={[styles.message, { color: p.text.muted }]}>{status}</Text> : null}
      {url ? <Pressable accessibilityRole="button" disabled={busy} onPress={onRevoke} style={styles.revoke}>
        <Text style={[styles.revokeText, { color: p.danger }]}>{`× ${s.shareRevoke}`}</Text>
      </Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={s.shareCreate} disabled={busy} onPress={onCreate} style={[styles.createButton, { backgroundColor: p.accent.strong, opacity: busy ? 0.6 : 1 }]}>
        <Text style={[styles.createText, { color: p.onAccent, ...fontStyle('semibold', language, Platform.OS === 'web') }]}>{s.shareCreate}</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100, elevation: 100 },
  dialog: { width: '90%', maxWidth: 400, paddingTop: 24, paddingHorizontal: 20, paddingBottom: 20, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 16, lineHeight: 22 },
  close: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, marginBottom: 8 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, marginTop: 1, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  optionBody: { flex: 1, minWidth: 0 },
  optionTitle: { fontSize: 14, lineHeight: 19, marginBottom: 2 },
  optionDescription: { fontSize: 12, lineHeight: 17 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  linkInput: { flex: 1, minWidth: 0, paddingVertical: 8, paddingHorizontal: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, fontSize: 12, fontFamily: 'monospace' },
  copyButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, minHeight: 34, justifyContent: 'center' },
  copyText: { fontSize: 12 },
  message: { fontSize: 12, lineHeight: 17, marginTop: 8, textAlign: 'center' },
  revoke: { alignSelf: 'center', marginTop: 8, paddingVertical: 4 },
  revokeText: { fontSize: 12 },
  createButton: { alignSelf: 'center', marginTop: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, minHeight: 36 },
  createText: { fontSize: 13 },
});
