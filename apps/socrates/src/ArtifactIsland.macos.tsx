import React from 'react';
import { Text, View } from 'react-native';

// Windows/macOS placeholder: react-native-webview is not wired for RN
// Windows yet, so render a bounded fallback instead of crashing. Heavy
// editors (TipTap/tldraw/viz/Mermaid/Three.js) remain Web-only until a
// native WebView2 adapter lands — the Universal App never blocks the
// Chat/Sidebar/Composer path on them.
export function ArtifactIsland({ html, kind = 'html' }: { html: string; kind?: string }) {
  void html;
  return (
    <View style={{ padding: 12, borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12 }}>
      <Text style={{ color: '#6b6b6b' }}>
        {kind} preview is Web-only in this build.
      </Text>
    </View>
  );
}
