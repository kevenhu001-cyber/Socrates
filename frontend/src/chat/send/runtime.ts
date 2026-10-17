import { reportSwallow } from '../../util/reportSwallow.ts';
import { addMessage } from '../messages.js';
import { scheduleTurnToTopForMessage } from '../turnAnchor.ts';
import type { ActiveChatController } from '../turnState.ts';

/** Chat bridges published by the legacy shell. */
interface SendRuntimeWindow extends Window {
  appMode?: string;
  webSearchOn?: boolean;
  tutorSocratic?: unknown;
  deepResearchOn?: boolean;
  askChatTurn?: (text: string, pending: unknown, precreated?: unknown) => unknown;
  addStreamingMessage?: (options: { onRetry?: () => void }) => ActiveChatController | null;
  __loadStreamingTurn?: () => void;
}

export function translate(key: string, fallback?: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      const value = window.t(key);
      if (value && value !== key) return value;
    }
  } catch (error) { reportSwallow(error, 'sendPipeline.translate'); }
  return fallback != null ? fallback : key;
}

export function getAppMode(): string {
  try {
    const win = window as SendRuntimeWindow;
    if (typeof window !== 'undefined' && win.appMode) return win.appMode;
  } catch (error) { reportSwallow(error, 'sendPipeline.getAppMode'); }
  return 'chat';
}

export function isWebSearchOn(): boolean {
  try {
    const win = window as SendRuntimeWindow;
    if (typeof window !== 'undefined' && typeof win.webSearchOn !== 'undefined') return !!win.webSearchOn;
  } catch (error) { reportSwallow(error, 'sendPipeline.isWebSearchOn'); }
  return true;
}

export function getTutorSocratic(): unknown {
  try {
    const win = window as SendRuntimeWindow;
    if (typeof window !== 'undefined' && win.tutorSocratic) return win.tutorSocratic;
  } catch (error) { reportSwallow(error, 'sendPipeline.getTutorSocratic'); }
  return null;
}

export function askChatTurn(text: string, pending: unknown, precreatedController?: unknown): unknown {
  const win = window as SendRuntimeWindow;
  if (typeof window !== 'undefined' && typeof win.askChatTurn === 'function') {
    return win.askChatTurn(text, pending, precreatedController || null);
  }
  return null;
}

export function addStreamingMessage(options: { onRetry?: () => void }): ActiveChatController | null {
  const win = window as SendRuntimeWindow;
  if (typeof window !== 'undefined' && typeof win.addStreamingMessage === 'function') {
    return win.addStreamingMessage(options);
  }
  throw new Error('addStreamingMessage bridge missing');
}

export function isDeepResearchOn(): boolean {
  try { return !!(window as SendRuntimeWindow).deepResearchOn; }
  catch { return false; }
}

export function addAnchoredAssistant(text: string, type: string | null, actions: unknown): string {
  const clientId = addMessage('assistant', text, type, actions) as string;
  const list = typeof document !== 'undefined' ? document.getElementById('msgList') : null;
  scheduleTurnToTopForMessage(list, clientId);
  return clientId;
}

export function prefetchStreamingTurn(): void {
  try {
    const win = window as SendRuntimeWindow;
    if (typeof win.__loadStreamingTurn === 'function') win.__loadStreamingTurn();
  } catch (error) {
    reportSwallow(error, 'sendPipeline.prefetchStreamingTurn');
  }
}

export function reportTurnFailure(error: unknown, context: string): void {
  if (typeof window !== 'undefined' && typeof window.console?.error === 'function') {
    try { window.console.error('[chat] turn failed:', error); }
    catch (caught) { reportSwallow(caught, context); }
  }
}
