import React from 'react';
import { WebView } from 'react-native-webview';
import { parseArtifactBridgeMessage } from '@socrates/ui';
import type { ArtifactIslandProps } from './artifactBridge';

export function ArtifactIsland({ html, artifactId = '', onMessage, style }: ArtifactIslandProps) {
  return <WebView
    originWhitelist={['about:blank']}
    source={{ html }}
    style={style}
    javaScriptEnabled
    setSupportMultipleWindows={false}
    allowFileAccess={false}
    onMessage={(event) => {
      const message = parseArtifactBridgeMessage(event.nativeEvent.data);
      if (message) onMessage?.(message);
    }}
    onError={() => onMessage?.({ type: 'error', message: 'Artifact failed to load' })}
  />;
}
