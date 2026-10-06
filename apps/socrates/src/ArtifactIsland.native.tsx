import React from 'react';
import { WebView } from 'react-native-webview';
export function ArtifactIsland({ html }: { html: string }) { return <WebView originWhitelist={['about:blank']} source={{ html }} />; }
