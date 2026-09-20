import type { ReasoningEffort, ResponseSpeed } from '../../config/chatPreferences';

export interface ChatProviderOption {
  id: string;
  label?: string;
  model?: string;
  url?: string;
  isBuiltIn?: boolean;
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
  revision: number;
}

export interface ChatConfigurationBridge {
  getSnapshot: () => ChatConfigurationSnapshot;
  publish: (snapshot: Omit<ChatConfigurationSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}
