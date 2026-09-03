import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ArtifactWebView } from '../components/ArtifactWebView';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import type { ArtifactMessage } from '@socrates/contracts';
import { native } from '../native/native';
import { setClipboardText } from '../native/clipboard';

type ViewMode = 'preview' | 'source';

export function ArtifactPreviewScreen() {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'ArtifactPreview'>>();
  const [mode, setMode] = useState<ViewMode>('preview');
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);

  const onArtifactMessage = useCallback((message: ArtifactMessage) => {
    if (message.type === 'openLink') void native.openBrowser(message.url);
    if (message.type === 'copy') void setClipboardText(message.text);
    if (message.type === 'share') void setClipboardText(`${message.title}\n${message.content}`);
  }, []);

  const copySource = useCallback(() => {
    void setClipboardText(route.params.html).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [route.params.html]);

  const title = route.params.artifactId || t('artifact.title') || 'Artifact';
  const meta = 'text/html · Sandboxed HTML preview';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* 1:1 Parity with frontend `.artifact-preview-header` (styles.css:7636-7650) */}
      <View style={[styles.header, { borderBottomColor: withAlpha(colors.border, 0.42), backgroundColor: colors.surface }]}>
        <View style={[styles.headerIcon, { backgroundColor: withAlpha(colors.accent, 0.12) }]}>
          <Ionicons name="code-slash" size={15} color={colors.accent} />
        </View>
        <View style={styles.heading}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text, fontFamily: typography.medium }]}>
            {title}
          </Text>
          <Text numberOfLines={1} style={[styles.meta, { color: colors.textSubtle, fontFamily: typography.body }]}>
            {meta}
          </Text>
        </View>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close') || 'Close'}
          onPress={() => navigation.goBack()}
          style={[styles.closeBtn, { borderColor: withAlpha(colors.border, 0.5) }]}
        >
          <Text style={[styles.closeText, { color: colors.textMuted }]}>
            {t('common.close') || 'Close'}
          </Text>
        </AnimatedPressable>
      </View>

      {/* Control bar: Source / Preview toggle + reload + copy */}
      <View style={[styles.controlBar, { borderBottomColor: withAlpha(colors.border, 0.2), backgroundColor: colors.surface }]}>
        <View style={[styles.toggleSegment, { backgroundColor: colors.surfaceRaised, borderColor: withAlpha(colors.border, 0.25) }]}>
          <AnimatedPressable
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === 'preview' }}
            onPress={() => setMode('preview')}
            style={[
              styles.segmentBtn,
              mode === 'preview' && [styles.segmentBtnActive, { backgroundColor: colors.surface }],
            ]}
          >
            <Ionicons name="eye-outline" size={14} color={mode === 'preview' ? colors.accent : colors.textMuted} />
            <Text style={[styles.segmentText, { color: mode === 'preview' ? colors.text : colors.textMuted, fontFamily: typography.medium }]}>
              {t('artifact.preview') || 'Preview'}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === 'source' }}
            onPress={() => setMode('source')}
            style={[
              styles.segmentBtn,
              mode === 'source' && [styles.segmentBtnActive, { backgroundColor: colors.surface }],
            ]}
          >
            <Ionicons name="code-outline" size={14} color={mode === 'source' ? colors.accent : colors.textMuted} />
            <Text style={[styles.segmentText, { color: mode === 'source' ? colors.text : colors.textMuted, fontFamily: typography.medium }]}>
              {t('artifact.source') || 'Source'}
            </Text>
          </AnimatedPressable>
        </View>

        <View style={styles.actions}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={t('artifact.reload')}
            onPress={() => setReloadKey((k) => k + 1)}
            style={[styles.actionBtn, { borderColor: withAlpha(colors.border, 0.4), borderRadius: radius.sm }]}
          >
            <Ionicons name="reload-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.actionText, { color: colors.textMuted, fontFamily: typography.medium }]}>
              {t('artifact.reload')}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={t('artifact.copySource')}
            onPress={copySource}
            style={[styles.actionBtn, { borderColor: withAlpha(colors.border, 0.4), borderRadius: radius.sm }]}
          >
            <Ionicons
              name={copied ? 'checkmark-outline' : 'copy-outline'}
              size={14}
              color={copied ? colors.success : colors.textMuted}
            />
            <Text
              style={[
                styles.actionText,
                { color: copied ? colors.success : colors.textMuted, fontFamily: typography.medium },
              ]}
            >
              {copied ? (t('common.copied') || 'Copied') : t('artifact.copySource')}
            </Text>
          </AnimatedPressable>
        </View>
      </View>

      {/* Main content: Preview WebView or Monospace Source View */}
      {mode === 'preview' ? (
        <ArtifactWebView
          key={reloadKey}
          artifactId={route.params.artifactId}
          html={route.params.html}
          onMessage={onArtifactMessage}
        />
      ) : (
        <ScrollView style={styles.sourceScroll} contentContainerStyle={styles.sourceContent}>
          <View style={[styles.sourceBox, { backgroundColor: colors.surfaceRaised, borderColor: withAlpha(colors.border, 0.3) }]}>
            <Text selectable style={[styles.sourceText, { color: colors.text, fontFamily: typography.mono }]}>
              {route.params.html}
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heading: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
  },
  meta: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 12,
  },
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  toggleSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  segmentBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: {
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  actionText: {
    fontSize: 12,
  },
  sourceScroll: {
    flex: 1,
  },
  sourceContent: {
    padding: 14,
  },
  sourceBox: {
    borderWidth: 0.5,
    borderRadius: 10,
    padding: 14,
  },
  sourceText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
