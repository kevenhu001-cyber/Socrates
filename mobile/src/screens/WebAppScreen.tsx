import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { BrandMark } from '../components/BrandMark';
import { API_BASE_URL, WEB_BASE_URL } from '../data/api/config';
import { isExternalScheme, parseMobileBootstrap, parseNativeWebMessage, type WebThemeMode } from './webAppPolicy';
import { getThemePalette } from '@socrates/theme';
import { colors as themeColors } from '../theme/theme';

const INITIAL_LOAD_TIMEOUT_MS = 20_000;
const BOOTSTRAP_TIMEOUT_MS = 10_000;

const NATIVE_BRIDGE_SCRIPT = `
(function () {
  function sendTheme() {
    try {
      var mode = document.documentElement.getAttribute('data-mode') === 'light' ? 'light' : 'dark';
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'theme', mode: mode }));
    } catch (_) {}
  }
  function connect() {
    try {
      document.documentElement.setAttribute('data-native-platform', 'android');
      document.documentElement.classList.add('is-native-app');
      sendTheme();
      new MutationObserver(sendTheme).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-mode']
      });
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', connect, { once: true });
  else connect();
  true;
})();
`;

type LoadState = 'loading' | 'ready' | 'error';

export function WebAppScreen() {
  const webViewRef = useRef<WebView>(null);
  const loadFailedRef = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [canGoBack, setCanGoBack] = useState(false);
  const [themeMode, setThemeMode] = useState<WebThemeMode>('dark');
  const [runtimeWebBaseUrl, setRuntimeWebBaseUrl] = useState<string | null>(null);
  const clientVersion = Constants.expoConfig?.version || '2.0.1';
  const clientIdentifier = useMemo(() => `SocratesAndroid/${clientVersion}`, [clientVersion]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BOOTSTRAP_TIMEOUT_MS);
    loadFailedRef.current = false;

    void (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/mobile/bootstrap`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Socrates-Client': clientIdentifier,
          },
          signal: controller.signal,
        });

        // A newly-built APK can still open against the immediately previous
        // server release while deploy.sh is being run. Once deployed, the
        // health gate requires this contract endpoint and validates it.
        if (response.status === 404) {
          if (!cancelled) setRuntimeWebBaseUrl(WEB_BASE_URL);
          return;
        }
        if (!response.ok) throw new Error(`Mobile bootstrap failed (${response.status})`);
        const bootstrap = parseMobileBootstrap(await response.json(), API_BASE_URL);
        if (!bootstrap) throw new Error('Mobile bootstrap does not match this app build');
        if (!cancelled) setRuntimeWebBaseUrl(bootstrap.webBaseUrl);
      } catch {
        if (!cancelled) {
          loadFailedRef.current = true;
          setLoadState('error');
        }
      } finally {
        clearTimeout(timeout);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [clientIdentifier, reloadKey]);

  useEffect(() => {
    if (loadState !== 'loading') return undefined;
    const timeout = setTimeout(() => setLoadState('error'), INITIAL_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [loadState, reloadKey]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack) return false;
      webViewRef.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  const retry = useCallback(() => {
    setLoadState('loading');
    setCanGoBack(false);
    setRuntimeWebBaseUrl(null);
    setReloadKey((value) => value + 1);
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const message = parseNativeWebMessage(event.nativeEvent.data);
    if (message?.type === 'theme') setThemeMode(message.mode);
  }, []);

  const handleNavigation = useCallback((state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
  }, []);

  const shouldStartLoad = useCallback((request: { url: string }) => {
    if (!isExternalScheme(request.url)) return true;
    void Linking.openURL(request.url).catch((err) => {
      console.warn('[WebApp] Failed to open external URL:', request.url, err);
    });
    return false;
  }, []);

  const palette = getThemePalette(themeMode);
  const surface = palette.bg.page;
  const text = palette.text.primary;
  const muted = palette.text.muted;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: surface }]} edges={['top', 'bottom']}>
      <StatusBar style={themeMode === 'light' ? 'dark' : 'light'} />
      {runtimeWebBaseUrl ? (
        <WebView
          key={reloadKey}
          ref={webViewRef}
          testID="socrates-web-app"
          source={{
            uri: runtimeWebBaseUrl,
            headers: { 'X-Socrates-Client': clientIdentifier },
          }}
          applicationNameForUserAgent={clientIdentifier}
          style={[styles.webView, { backgroundColor: surface }]}
          containerStyle={{ backgroundColor: surface }}
          originWhitelist={['https://*', 'http://*']}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          cacheEnabled
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          injectedJavaScript={NATIVE_BRIDGE_SCRIPT}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigation}
          onShouldStartLoadWithRequest={shouldStartLoad}
          onLoadStart={() => {
            loadFailedRef.current = false;
          }}
          onLoadEnd={() => {
            if (!loadFailedRef.current) setLoadState('ready');
          }}
          onError={() => {
            loadFailedRef.current = true;
            setLoadState('error');
          }}
          onHttpError={(event) => {
            if (event.nativeEvent.statusCode >= 400) {
              loadFailedRef.current = true;
              setLoadState('error');
            }
          }}
        />
      ) : null}

      {loadState !== 'ready' ? (
        <View style={[styles.overlay, { backgroundColor: surface }]} accessibilityLiveRegion="polite">
          <BrandMark size={72} />
          {loadState === 'loading' ? (
            <>
              <ActivityIndicator style={styles.spinner} color={themeColors.accent} />
              <Text style={[styles.loadingText, { color: muted }]}>正在加载 Socrates…</Text>
            </>
          ) : (
            <>
              <Text style={[styles.errorTitle, { color: text }]}>暂时无法打开 Socrates</Text>
              <Text style={[styles.errorBody, { color: muted }]}>请检查网络连接，然后重试。应用不会再停留在开屏页。</Text>
              <Pressable
                accessibilityRole="button"
                onPress={retry}
                style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
              >
                <Text style={[styles.retryText, { color: text }]}>重新加载</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  webView: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  spinner: { marginTop: 22 },
  loadingText: { marginTop: 14, fontSize: 14 },
  errorTitle: { marginTop: 24, fontSize: 20, fontWeight: '600', textAlign: 'center' },
  errorBody: { marginTop: 10, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  retryButton: {
    marginTop: 24,
    minHeight: 46,
    minWidth: 132,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    backgroundColor: themeColors.accent,
    paddingHorizontal: 24,
  },
  retryButtonPressed: { opacity: 0.82 },
  retryText: { fontSize: 15, fontWeight: '600' },
});
