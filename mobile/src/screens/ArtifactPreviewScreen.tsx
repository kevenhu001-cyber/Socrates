import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArtifactWebView } from '../components/ArtifactWebView';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import type { ArtifactMessage } from '@socrates/contracts';
import { native } from '../native/native';
import { setClipboardText } from '../native/clipboard';

export function ArtifactPreviewScreen() {
  const { colors, radius } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'ArtifactPreview'>>();
  const onArtifactMessage = useCallback((message: ArtifactMessage) => {
    if (message.type === 'openLink') void native.openBrowser(message.url);
    if (message.type === 'copy') void setClipboardText(message.text);
    // Native sharing accepts file URLs. Copy share content so it remains useful
    // without treating generated HTML as a privileged browser URL.
    if (message.type === 'share') void setClipboardText(`${message.title}\n${message.content}`);
  }, []);
  return (
    // The screen hides the stack header, so it has to draw its own back control
    // and respect the status bar instead of a hardcoded 64pt pad.
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => navigation.goBack()}
          style={[styles.back, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill }]}
        >
          <Text style={{ color: colors.textMuted, fontSize: 17 }}>‹</Text>
        </AnimatedPressable>
        <Text style={[styles.title, { color: colors.text }]}>{t('artifact.title')}</Text>
      </View>
      <ArtifactWebView artifactId={route.params.artifactId} html={route.params.html} onMessage={onArtifactMessage} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 16 },
  back: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
});
