import React from 'react';
import { WebView } from 'react-native-webview';

// Android WebView island for non-portable surfaces.
// TipTap / tldraw / HTML-viz / Mermaid / Three.js render here and never in
// shared core — see EmbeddedIslands.tsx for the kind registry.
export function ArtifactIsland({ html }: { html: string }) {
  return <WebView originWhitelist={['about:blank']} source={{ html }} />;
}
