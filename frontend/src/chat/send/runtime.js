import { reportSwallow } from '../../util/reportSwallow.ts';
import { addMessage } from '../messages.js';
import { scheduleTurnToTopForMessage } from '../turnAnchor.ts';

export function translate(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      const value = window.t(key);
      if (value && value !== key) return value;
    }
  } catch (error) { reportSwallow(error, 'sendPipeline.translate'); }
  return fallback != null ? fallback : key;
}

export function getAppMode() {
  try {
    if (typeof window !== 'undefined' && window.appMode) return window.appMode;
  } catch (error) { reportSwallow(error, 'sendPipeline.getAppMode'); }
  return 'chat';
}

export function isWebSearchOn() {
  try {
    if (typeof window !== 'undefined' && typeof window.webSearchOn !== 'undefined') return !!window.webSearchOn;
  } catch (error) { reportSwallow(error, 'sendPipeline.isWebSearchOn'); }
  return true;
}

export function getTutorSocratic() {
  try {
    if (typeof window !== 'undefined' && window.tutorSocratic) return window.tutorSocratic;
  } catch (error) { reportSwallow(error, 'sendPipeline.getTutorSocratic'); }
  return null;
}

export function askChatTurn(text, pending, precreatedController) {
  if (typeof window !== 'undefined' && typeof window.askChatTurn === 'function') {
    return window.askChatTurn(text, pending, precreatedController || null);
  }
  return null;
}

export function addStreamingMessage(options) {
  if (typeof window !== 'undefined' && typeof window.addStreamingMessage === 'function') {
    return window.addStreamingMessage(options);
  }
  throw new Error('addStreamingMessage bridge missing');
}

export function isDeepResearchOn() {
  try { return !!window.deepResearchOn; }
  catch { return false; }
}

export function addAnchoredAssistant(text, type, actions) {
  const clientId = addMessage('assistant', text, type, actions);
  const list = typeof document !== 'undefined' ? document.getElementById('msgList') : null;
  scheduleTurnToTopForMessage(list, clientId);
  return clientId;
}

export function prefetchStreamingTurn() {
  try {
    if (typeof window.__loadStreamingTurn === 'function') window.__loadStreamingTurn();
  } catch (error) {
    reportSwallow(error, 'sendPipeline.prefetchStreamingTurn');
  }
}

export function reportTurnFailure(error, context) {
  if (typeof window !== 'undefined' && typeof window.console?.error === 'function') {
    try { window.console.error('[chat] turn failed:', error); }
    catch (caught) { reportSwallow(caught, context); }
  }
}
