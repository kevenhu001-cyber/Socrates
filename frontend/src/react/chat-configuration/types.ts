import type { ReasoningEffort, ResponseSpeed } from '../../config/chatPreferences';
import type { ProviderCapabilities } from '@socrates/contracts';

export interface ChatProviderOption {
  id: string;
  label?: string;
  model?: string;
  url?: string;
  isBuiltIn?: boolean;
  /* What the server says this model supports. Absent = nothing known. */
  capabilities?: ProviderCapabilities;
}

export interface ChatConfigurationAnchor {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface ChatConfigurationSnapshot {
  open: boolean;
  providers: ChatProviderOption[];
  activeId: string;
  effort: ReasoningEffort;
  speed: ResponseSpeed;
  anchorRect: ChatConfigurationAnchor | null;
  triggerId: string | null;
  revision: number;
}

export interface ChatConfigurationBridge {
  getSnapshot: () => ChatConfigurationSnapshot;
  publish: (snapshot: Omit<ChatConfigurationSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}
