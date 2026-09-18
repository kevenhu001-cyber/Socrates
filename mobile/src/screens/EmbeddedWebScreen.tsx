import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { EmbeddedTarget } from '@socrates/contracts';
import { isEmbeddedTarget, nativeOverlayForEmbeddedTarget, nativeRouteForEmbeddedTarget, parseBridgeMessage } from './embeddedBridge';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useTheme } from '../theme/ThemeProvider';
import { embeddedApi, WEB_BASE_URL } from '../data/api/client';
import { native } from '../native/native';
import { appStore } from '../stores/appStore';
import { profileOverlay } from '../components/AppDrawer';
import { usageOverlay, storageOverlay } from '../cmdK/overlayStores';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Embedded'>;

function openNativeOverlay(target: EmbeddedTarget): boolean {
  const overlay = nativeOverlayForEmbeddedTarget(target);
  if (!overlay) return false;
  if (overlay === 'profile') profileOverlay.open();
  if (overlay === 'usage') usageOverlay.open();
  if (overlay === 'storage') storageOverlay.open();
  return true;
}

export function EmbeddedWebScreen({ route, navigation }: Props) {
  const { colors, typography } = useTheme();
  const webRef = useRef<WebView>(null);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const allowedOrigin = new URL(WEB_BASE_URL).origin;

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const session = await embeddedApi.createSession(route.params.target);
      setUrl(session.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to open this workspace');
      setLoading(false);
    }
  };

  useEffect(() => {
    const nativeRoute = nativeRouteForEmbeddedTarget(route.params.target);
    if (nativeRoute) {
      navigation.replace(nativeRoute);
      return;
    }
    if (openNativeOverlay(route.params.target)) {
      navigation.goBack();
      return;
    }
    void load();
  }, [navigation, route.params.target]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) { webRef.current?.goBack(); return true; }
      navigation.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack, navigation]);

  const allowNavigation = (request: WebViewNavigation) => {
    if (request.url === 'about:blank') return true;
    try {
      if (new URL(request.url).origin === allowedOrigin) return true;
    } catch {
      return false;
    }
    void native.openBrowser(request.url);
    return false;
  };

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      if (new URL(event.nativeEvent.url || '').origin !== allowedOrigin) return;
    } catch {
      return;
    }
    const message = parseBridgeMessage(event.nativeEvent.data);
    if (!message) return;
    if (message.type === 'close') navigation.goBack();
    if (message.type === 'authExpired') {
      void appStore.bootstrap();
      navigation.goBack();
    }
    if (message.type === 'openExternal' || message.type === 'download') {
      try {
        if (new URL(message.url).protocol === 'https:') void native.openBrowser(message.url);
      } catch { /* reject malformed or non-HTTPS URLs */ }
    }
    if (message.type === 'navigate' && isEmbeddedTarget(message.target)) {
      const nativeRoute = nativeRouteForEmbeddedTarget(message.target);
      if (nativeRoute) navigation.replace(nativeRoute);
      else if (openNativeOverlay(message.target)) navigation.goBack();
      else navigation.replace('Embedded', { target: message.target, title: message.target });
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={38} color={colors.textSubtle} />
          <Text style={[styles.error, { color: colors.textMuted, fontFamily: typography.body }]}>{error}</Text>
          <AnimatedPressable onPress={() => { void load(); }} style={[styles.retry, { backgroundColor: colors.accent }]}>
            <Text style={{ color: colors.textInverse, fontFamily: typography.semibold }}>Retry</Text>
          </AnimatedPressable>
        </View>
      ) : url ? (
        <View style={styles.webWrap}>
          <WebView
            ref={webRef}
            source={{ uri: url }}
            style={{ backgroundColor: colors.background }}
            containerStyle={{ backgroundColor: colors.background }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled={false}
            javaScriptEnabled
            domStorageEnabled
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={allowNavigation}
            onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
            onLoadEnd={() => setLoading(false)}
            onError={(event) => { setError(event.nativeEvent.description || 'Unable to load the workspace'); setLoading(false); }}
            onHttpError={(event) => { if (event.nativeEvent.statusCode >= 400) setError(`Unable to load the workspace (${event.nativeEvent.statusCode})`); }}
            onMessage={onMessage}
            onFileDownload={(event) => { void native.openBrowser(event.nativeEvent.downloadUrl); }}
          />
          {loading ? <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View> : null}
        </View>
      ) : <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  webWrap: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  error: { textAlign: 'center', fontSize: 14, lineHeight: 21, marginTop: 16 },
  retry: { minWidth: 110, minHeight: 44, borderRadius: 12, marginTop: 18, alignItems: 'center', justifyContent: 'center' },
  loading: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
});
