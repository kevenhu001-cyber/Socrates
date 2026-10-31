import { useEffect, useState } from 'react';

import { getStoredReasoningEffort, type ReasoningEffort } from '../../config/chatPreferences';
import { useProviderConfigStore } from '../../config/providerConfig.store';

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return value === 'high' || value === 'medium' || value === 'low' || value === 'instant';
}

/** Active model copy is rendered from the provider store by React surfaces. */
export function useActiveModelLabel(): string {
  return useProviderConfigStore((snapshot) => {
    const active = snapshot.providers.find((provider) => provider.id === snapshot.activeId);
    if (!active) return '';
    return active.label && active.label !== 'Default'
      ? active.label
      : active.model || active.label || '';
  });
}

/** The legacy preference event remains the domain notification for saves. */
export function useStoredReasoningEffort(): ReasoningEffort {
  const [effort, setEffort] = useState<ReasoningEffort>(() => getStoredReasoningEffort());

  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<{ effort?: unknown }>).detail;
      setEffort(isReasoningEffort(detail?.effort) ? detail.effort : getStoredReasoningEffort());
    };
    window.addEventListener('socrates:chat-preferences', sync);
    return () => window.removeEventListener('socrates:chat-preferences', sync);
  }, []);

  return effort;
}
