import React from 'react';
import { Text, View } from 'react-native';
import type { ArtifactIslandProps } from './artifactBridge';

// Default/typecheck fallback. Platforms with a real adapter resolve their own
// file first (`.web.tsx` iframe, `.android`/`.native` WebView); this file only
// serves platforms without WebView support so imports always type-check and
// the bundle never breaks on an unknown target.
export function ArtifactIsland({ kind = 'html' }: ArtifactIslandProps) {
  return (
    <View style={{ padding: 12, borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12 }}>
      <Text style={{ color: '#6b6b6b' }}>{kind} preview is Web/Android-only in this build.</Text>
    </View>
  );
}
