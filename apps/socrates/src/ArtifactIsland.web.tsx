import React from 'react';
import { parseArtifactBridgeMessage } from '@socrates/ui';
import type { ArtifactIslandProps } from './artifactBridge';

// Web island: a real isolated <iframe srcdoc>. react-native-webview is a
// no-op on web ("does not support this platform"), so the Web build renders
// the document in an opaque-origin sandbox (`allow-scripts`, no
// allow-same-origin) and reads the same validated bridge protocol the native
// WebView posts. The document cannot reach the app page, storage or network.
const Frame = 'iframe' as unknown as React.ComponentType<{
  ref?: React.Ref<HTMLIFrameElement>;
  srcDoc?: string;
  sandbox?: string;
  title?: string;
  style?: React.CSSProperties;
}>;

export function ArtifactIsland({ html, artifactId = '', onMessage, style }: ArtifactIslandProps) {
  const frame = React.useRef<HTMLIFrameElement | null>(null);
  React.useEffect(() => {
    if (!onMessage) return;
    const listener = (event: MessageEvent) => {
      const node = frame.current;
      if (!node || event.source !== node.contentWindow) return;
      const message = parseArtifactBridgeMessage(event.data);
      if (message) onMessage(message);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [onMessage]);
  return <Frame
    ref={frame}
    title={`Artifact ${artifactId}`}
    srcDoc={html}
    sandbox="allow-scripts"
    style={{ width: '100%', height: '100%', minHeight: 240, border: '0', background: 'transparent', ...(style as unknown as React.CSSProperties | undefined) }}
  />;
}
