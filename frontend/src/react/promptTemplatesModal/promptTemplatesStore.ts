import type { PromptTemplatesBridge, PromptTemplatesSnapshot } from './types';

type Listener = () => void;

const INITIAL: PromptTemplatesSnapshot = { open: false, bodyHTML: '', revision: 0 };

let snapshot: PromptTemplatesSnapshot = INITIAL;
const listeners = new Set<Listener>();

function commit(next: Omit<PromptTemplatesSnapshot, 'revision'>): void {
  snapshot = { ...next, revision: snapshot.revision + 1 };
  listeners.forEach((l) => l());
}

function getSnapshot(): PromptTemplatesSnapshot { return snapshot; }
function publish(next: Omit<PromptTemplatesSnapshot, 'revision'>): void { commit(next); }
function subscribe(listener: Listener): () => void { listeners.add(listener); return () => listeners.delete(listener); }

const bridge: PromptTemplatesBridge = { getSnapshot, publish, subscribe };

export function installPromptTemplatesBridge(): PromptTemplatesBridge {
  const existing = window.__socratesPromptTemplatesBridge;
  if (existing) return existing;
  window.__socratesPromptTemplatesBridge = bridge;
  return bridge;
}

export function getPromptTemplatesSnapshot(): PromptTemplatesSnapshot { return installPromptTemplatesBridge().getSnapshot(); }
export function subscribeToPromptTemplates(listener: Listener): () => void { return installPromptTemplatesBridge().subscribe(listener); }
