import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ArtifactMessage } from '@socrates/contracts';
import { useTheme } from '../theme/ThemeProvider';
import { parseArtifactMessage, safeArtifactHtml } from './artifactBridge';

// react-native-webview's generic ref type is narrower than the RN 0.86 JSX
// definitions when strict mode is enabled. The component remains the same
// native WebView; this alias only keeps the artifact boundary typed.
const NativeWebView = WebView as unknown as React.ComponentType<any>;

function artifactDocument(artifactId: string, html: string, background: string, foreground: string, nonce: string): string {
  const id = JSON.stringify(artifactId);
  // There is no iframe sandbox primitive in native WebView. This CSP blocks
  // network APIs, forms, external scripts, file URLs and popup navigation. A
  // nonce permits only this app-owned bridge script; raw artifact scripts are
  // never executable in the mobile preview.
  const csp = `default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none'; font-src data:; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; navigate-to 'none'`;
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/><meta http-equiv="Content-Security-Policy" content="${csp}"/><style>html,body{margin:0;background:${background};color:${foreground};font-family:system-ui,sans-serif}img,svg,canvas,video{max-width:100%;height:auto}*{box-sizing:border-box}</style></head><body>${safeArtifactHtml(html)}<script nonce="${nonce}">(function(){var bridge=window.ReactNativeWebView;if(!bridge)return;var artifactId=${id};var send=function(v){try{bridge.postMessage(JSON.stringify(v));}catch(_){}};send({type:'ready',artifactId:artifactId});var resize=function(){var height=Math.ceil(document.documentElement.scrollHeight||document.body.scrollHeight||0);send({type:'resize',height:height});};if(window.ResizeObserver)new ResizeObserver(resize).observe(document.body);window.addEventListener('load',resize);document.addEventListener('click',function(event){var node=event.target&&event.target.closest?event.target.closest('a'):null;if(node&&node.href){event.preventDefault();send({type:'openLink',url:node.href});}},true);})();</script></body></html>`;
}

export function ArtifactWebView({ artifactId, html, onMessage }: { artifactId: string; html: string; onMessage?: (message: ArtifactMessage) => void }) {
  const { colors } = useTheme();
  const nonce = useMemo(() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`, [artifactId, html]);
  const source = useMemo(
    () => artifactDocument(artifactId, html, colors.background, colors.text, nonce),
    [artifactId, colors.background, colors.text, html, nonce],
  );
  const handleMessage = (event: WebViewMessageEvent) => {
    const message = parseArtifactMessage(event.nativeEvent.data, artifactId);
    if (message) onMessage?.(message);
  };
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <NativeWebView
        originWhitelist={['https://localhost/']}
        source={{ html: source, baseUrl: 'https://localhost/' }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows={false}
        scrollEnabled
        bounces={false}
        onShouldStartLoadWithRequest={(request: { url: string }) => {
          // The rendered document is local-only. Reject every navigation;
          // consumers can act on a validated openLink bridge message instead.
          return request.url === 'about:blank' || request.url.startsWith('https://localhost/');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ container: { minHeight: 220, flex: 1, overflow: 'hidden' }, });
