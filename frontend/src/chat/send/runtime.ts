import { reportSwallow } from '../../util/reportSwallow.ts';
import { appMode, webSearchOn } from '../../config/providers.ts';
import { isDeepResearchEnabled } from '../../config/deepResearchMode.ts';
import { addMessage } from '../messages.ts';
import { scheduleTurnToTopForMessage } from '../turn/anchor/schedule.ts';
import { t } from '../../i18n/index.ts';

/** Chat bridges published by the legacy shell. */
interface SendRuntimeWindow extends Window {
  tutorSocratic?: unknown;
}

export function translate(key: string, fallback?: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      const value = window.t(key);
      if (value && value !== key) return value;
    }
    const value = t(key);
    if (value && value !== key) return value;
  } catch (error) {
    reportSwallow(error, 'sendPipeline.translate');
  }
  return fallback != null ? fallback : key;
}

export function getAppMode(): string {
  return appMode;
}

export function isWebSearchOn(): boolean {
  return webSearchOn;
}

export function getTutorSocratic(): unknown {
  try {
    const win = window as SendRuntimeWindow;
    if (typeof window !== 'undefined' && win.tutorSocratic) return win.tutorSocratic;
  } catch (error) {
    reportSwallow(error, 'sendPipeline.getTutorSocratic');
  }
  return null;
}

export function isDeepResearchOn(): boolean {
  return isDeepResearchEnabled();
}

export function addAnchoredAssistant(
  text: string,
  type?: string | null,
  actions?: unknown,
): string {
  const clientId = addMessage('assistant', text, type, actions) as string;
  const list = typeof document !== 'undefined' ? document.getElementById('msgList') : null;
  scheduleTurnToTopForMessage(list, clientId);
  return clientId;
}

export function reportTurnFailure(error: unknown, context: string): void {
  if (typeof window !== 'undefined' && typeof window.console?.error === 'function') {
    try {
      window.console.error('[chat] turn failed:', error);
    } catch (caught) {
      reportSwallow(caught, context);
    }
  }
}
