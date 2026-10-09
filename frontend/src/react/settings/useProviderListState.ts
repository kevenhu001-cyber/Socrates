import { useRef } from 'react';

import {
  addProvider as addProviderConfig,
  removeProvider as removeProviderConfig,
  saveProviderConfig,
  setActiveProvider,
  updateProviderField,
} from '../../config/providerConfig.service';
import type { SettingsProviderField } from './types';

interface ProviderListState {
  onFieldChange: (id: string, field: SettingsProviderField, value: string | boolean) => void;
  onKeyRef: (id: string, element: HTMLInputElement | null) => void;
  onLabelRef: (id: string, element: HTMLInputElement | null) => void;
  onSetActive: (id: string) => void;
  onRemove: (id: string) => void;
  addProvider: () => Promise<void>;
  saveProviders: () => Promise<void>;
}

export function useProviderListState(): ProviderListState {
  const labelRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const keyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const onFieldChange: ProviderListState['onFieldChange'] = updateProviderField;
  const onLabelRef = (id: string, element: HTMLInputElement | null) => {
    labelRefs.current[id] = element;
  };
  const onKeyRef = (id: string, element: HTMLInputElement | null) => {
    keyRefs.current[id] = element;
  };
  const onSetActive = (id: string) => { void setActiveProvider(id); };
  const onRemove = async (id: string) => {
    await removeProviderConfig(id);
  };
  const addProvider = async () => {
    const id = addProviderConfig();
    if (id) requestAnimationFrame(() => labelRefs.current[id]?.focus());
  };
  const saveProviders = async () => {
    const result = await saveProviderConfig();
    result.savedIds.forEach((id) => {
      if (keyRefs.current[id]) keyRefs.current[id]!.value = '';
    });
  };

  return { onFieldChange, onLabelRef, onKeyRef, onSetActive, onRemove, addProvider, saveProviders };
}
