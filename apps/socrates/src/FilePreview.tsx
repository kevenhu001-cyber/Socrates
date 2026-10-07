import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StoredFilePreview } from '@socrates/contracts';
import { getThemePaletteHex, type ThemeMode } from '@socrates/theme';
import { fileKindLabel, formatFileSize } from '@socrates/ui';
import { appStrings, type AppLanguage } from './strings';
import { downloadStoredFile, resolveStoredImage, type FileAccessTarget, type FileImageSource, type StoredFileRef } from './fileAccess';

/* Overlay preview for a stored file: image via the authenticated raw source,
 * everything else via the server's capped text preview. Download/open is the
 * platform helper (web blob download, native cache + open). */
export function FilePreview({ file, mode, language = 'en', target, loadPreview, onClose }: {
  file: StoredFileRef;
  mode: ThemeMode;
  language?: AppLanguage;
  target: FileAccessTarget;
  loadPreview(id: string): Promise<StoredFilePreview>;
  onClose(): void;
}) {
  const p = getThemePaletteHex(mode);
  const s = appStrings(language);
  const [image, setImage] = useState<FileImageSource | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(true);
  const isImage = String(file.mimeType || '').startsWith('image/');

  useEffect(() => {
    let cancelled = false;
    let resolved: FileImageSource | null = null;
    setImage(null); setText(null); setError(null); setNotice(''); setBusy(true);
    void (async () => {
      try {
        if (isImage) {
          resolved = await resolveStoredImage(file.id, target);
          if (cancelled) { resolved?.revoke?.(); return; }
          if (!resolved) throw new Error(s.filePreviewFailed);
          setImage(resolved);
        } else {
          const preview = await loadPreview(file.id);
          if (cancelled) return;
          if (!preview.ok) throw new Error(s.filePreviewFailed);
          setText(preview.text);
        }
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : s.filePreviewFailed);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; resolved?.revoke?.(); };
  }, [file.id, isImage]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = () => {
    void downloadStoredFile(file, target)
      .then(() => setNotice(''))
      .catch((failure) => setNotice(failure instanceof Error ? failure.message : s.downloadFailed));
  };

  return <View style={styles.overlay} accessibilityViewIsModal>
    <View style={[styles.sheet, { backgroundColor: p.bg.page, borderColor: p.border.default }]}>
      <View style={[styles.header, { borderBottomColor: p.border.default }]}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: p.text.primary, fontWeight: '600' }}>{file.name || s.filePreviewTitle}</Text>
          <Text style={{ color: p.text.muted, fontSize: 12 }}>{fileKindLabel(file.name, file.mimeType)}{file.size ? ` · ${formatFileSize(file.size)}` : ''}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={s.downloadFile} onPress={download} style={[styles.action, { borderColor: p.border.strong }]}>
          <Text style={{ color: p.accent.strong, fontWeight: '600' }}>{s.downloadFile}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={s.closeArtifact} onPress={onClose} style={styles.close}>
          <Text style={{ color: p.text.primary, fontSize: 20 }}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.body}>
        {busy ? <ActivityIndicator color={p.text.muted} /> : null}
        {!busy && image ? <Image accessibilityLabel={file.name} source={image} style={styles.image} resizeMode="contain" /> : null}
        {!busy && text !== null ? <ScrollView style={styles.textScroll}><Text selectable style={[styles.text, { color: p.text.primary }]}>{text}</Text></ScrollView> : null}
        {!busy && error ? <Text accessibilityRole="alert" style={{ color: p.text.muted }}>{error}</Text> : null}
        {notice ? <Text style={{ color: p.danger }}>{notice}</Text> : null}
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 60 },
  sheet: { width: '100%', maxWidth: 840, maxHeight: '92%', borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  action: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  body: { padding: 16, gap: 10, minHeight: 200, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: 420, borderRadius: 8 },
  textScroll: { alignSelf: 'stretch', maxHeight: 460 },
  text: { fontSize: 13, lineHeight: 19 },
});
