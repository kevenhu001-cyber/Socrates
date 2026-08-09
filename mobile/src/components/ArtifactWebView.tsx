import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ArtifactMessage } from '@socrates/contracts';
import { useTheme } from '../theme/ThemeProvider';

// react-native-webview's generic ref type is narrower than the RN 0.86
// JSX definitions when strict mode is enabled. The component remains the
// same native WebView; this alias only keeps the artifact boundary typed.
const NativeWebView = WebView as unknown as React.ComponentType<any>;

export function ArtifactWebView({ artifactId, html, onMessage }: { artifactId: string; html: string; onMessage?: (message: ArtifactMessage) => void }) {
  const { colors } = useTheme();
  const ref = useRef<any>(null);
  const source = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>html,body{margin:0;background:${colors.background};color:${colors.text};font-family:system-ui,sans-serif}img,svg,canvas{max-width:100%}</style></head><body>${html}<script>(function(){var bridge=window.ReactNativeWebView;if(!bridge)return;var send=function(v){bridge.postMessage(JSON.stringify(v));};send({type:'ready',artifactId:${JSON.stringify(artifactId)}});var resize=function(){send({type:'resize',height:Math.ceil(document.documentElement.scrollHeight||document.body.scrollHeight||0)});};if(window.ResizeObserver)new ResizeObserver(resize).observe(document.body);window.addEventListener('load',resize);document.addEventListener('click',function(event){var node=event.target&&event.target.closest?event.target.closest('a'):null;if(node&&node.href){event.preventDefault();send({type:'openLink',url:node.href});}});})();</script></body></html>`;
  const handleMessage = (event: WebViewMessageEvent) => {
    try { onMessage?.(JSON.parse(event.nativeEvent.data) as ArtifactMessage); } catch { /* malformed artifact messages are ignored */ }
  };
  return <View style={[styles.container, { backgroundColor: colors.background }]}><NativeWebView ref={ref} originWhitelist={['*']} source={{ html: source }} onMessage={handleMessage} javaScriptEnabled domStorageEnabled scrollEnabled bounces={false} /></View>;
}

const styles = StyleSheet.create({ container: { minHeight: 220, flex: 1, overflow: 'hidden' }, });
