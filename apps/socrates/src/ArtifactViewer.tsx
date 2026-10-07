import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { getThemePaletteHex, type ThemeMode } from '@socrates/theme';
import type { ArtifactBridgeMessage } from '@socrates/contracts';
import { type ArtifactDescriptor } from '@socrates/ui';
import { ArtifactIsland } from './ArtifactIsland';
import { copyText } from './clipboard';
import { shareText } from './share';
import { appStrings, type AppLanguage } from './strings';

const MIN_HEIGHT = 200;
const MAX_HEIGHT = 720;
const DEFAULT_HEIGHT = 360;

/* Artifact preview sheet: hosts the isolated island and implements the
 * ArtifactBridgeMessage loop (ready/resize/openLink/copy/share/error). The
 * card in the transcript only asks to open; the heavy document never enters
 * the shared core or the message list. */
export function ArtifactViewer({ artifact, mode, language = 'en', onClose }: {
  artifact: ArtifactDescriptor | null;
  mode: ThemeMode;
  language?: AppLanguage;
  onClose(): void;
}) {
  const p = getThemePaletteHex(mode);
  const s = appStrings(language);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [notice, setNotice] = useState('');
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    setHeight(DEFAULT_HEIGHT);
    setNotice('');
    if (!artifact) { setHtml(null); return; }
    let cancelled = false;
    setHtml(null);
    void (async () => {
      try {
        const document = artifact.loadDocument ? await artifact.loadDocument() : artifact.document();
        if (!cancelled) setHtml(document);
      } catch {
        if (!cancelled) { setHtml(null); setNotice(s.artifactError); }
      }
    })();
    return () => { cancelled = true; };
  }, [artifact]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMessage = useCallback((message: ArtifactBridgeMessage) => {
    switch (message.type) {
      case 'resize':
        setHeight((current) => {
          const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(message.height)));
          return Math.abs(next - current) > 4 ? next : current;
        });
        return;
      case 'copy':
        void copyText(message.text).then(() => setNotice(s.artifactCopied)).catch(() => setNotice(s.artifactCopyFailed));
        return;
      case 'openLink':
        void Linking.openURL(message.url).catch(() => undefined);
        return;
      case 'share':
        void shareText(message.title, message.content)
          .then((result) => setNotice(result === 'copied' ? s.artifactCopied : ''))
          .catch(() => setNotice(s.artifactShareFailed));
        return;
      case 'error':
        setNotice(message.message || s.artifactError);
    }
  }, [s]);

  if (!artifact || html === null) return null;
  return <View style={styles.overlay} accessibilityViewIsModal>
    <View style={[styles.sheet, { backgroundColor: p.bg.page, borderColor: p.border.default }]}>
      <View style={[styles.header, { borderBottomColor: p.border.default }]}>
        <Text numberOfLines={1} style={[styles.title, { color: p.text.primary }]}>{artifact.title || s.previewArtifact}</Text>
        <Text style={{ color: p.text.muted, fontSize: 12, textTransform: 'uppercase' }}>{artifact.kind}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={s.closeArtifact} onPress={onClose} style={styles.close}>
          <Text style={{ color: p.text.primary, fontSize: 20 }}>✕</Text>
        </Pressable>
      </View>
      <View style={{ height, width: '100%' }}>
        <ArtifactIsland html={html} kind={artifact.kind} artifactId={artifact.id} onMessage={handleMessage} />
      </View>
      {notice ? <Text accessibilityRole="alert" style={{ color: p.text.muted, paddingHorizontal: 12, paddingVertical: 8 }}>{notice}</Text> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 },
  sheet: { width: '100%', maxWidth: 840, maxHeight: '92%', borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, fontSize: 15, fontWeight: '600' },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
});
