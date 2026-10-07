import type { StyleProp, ViewStyle } from 'react-native';
import type { ArtifactBridgeMessage } from '@socrates/contracts';

/* Props every platform `ArtifactIsland` adapter accepts. The host passes a
 * self-contained HTML document built by @socrates/ui and receives validated
 * bridge messages (ready/resize/openLink/copy/share/error). */

export interface ArtifactIslandProps {
  html: string;
  kind?: string;
  artifactId?: string;
  onMessage?(message: ArtifactBridgeMessage): void;
  style?: StyleProp<ViewStyle>;
}
