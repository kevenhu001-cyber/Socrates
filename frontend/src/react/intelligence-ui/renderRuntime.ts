import {
  displayIntelligenceUiValue,
  isSafeIntelligenceUiStateKey,
  resolveIntelligenceUiValue,
  type IntelligenceUiNode,
  type IntelligenceUiState,
} from '@socrates/core';
import type { MouseEvent } from 'react';

import type { ToolCallRecord } from '../tool-run/toolRunModel';

/** Shared state and callbacks consumed by every node renderer. */
export interface RenderContext {
  state: IntelligenceUiState;
  setState: (updater: (previous: IntelligenceUiState) => IntelligenceUiState) => void;
  children: Map<string, IntelligenceUiNode[]>;
  tools: ReadonlyArray<ToolCallRecord>;
  readOnly: boolean;
  streaming?: boolean;
}

export type UiAction = {
  type?: string;
  key?: string;
  value?: unknown;
  amount?: unknown;
  prompt?: unknown;
  url?: unknown;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function asNumber(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function asText(value: unknown): string {
  return displayIntelligenceUiValue(value);
}

export function childMap(nodes: ReadonlyArray<IntelligenceUiNode>): Map<string, IntelligenceUiNode[]> {
  const map = new Map<string, IntelligenceUiNode[]>();
  for (const node of nodes) {
    if (!node.parent) continue;
    const list = map.get(node.parent) || [];
    list.push(node);
    map.set(node.parent, list);
  }
  return map;
}

export function mergeDefaults(previous: IntelligenceUiState, defaults: IntelligenceUiState): IntelligenceUiState {
  let changed = false;
  const next = { ...previous };
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in previous)) {
      next[key] = value;
      changed = true;
    }
  }
  return changed ? next : previous;
}

export function resolve(value: unknown, context: RenderContext): unknown {
  return resolveIntelligenceUiValue(value, { state: context.state, tools: context.tools });
}

export function resolveVisible(node: IntelligenceUiNode, context: RenderContext): boolean {
  if (!('when' in node)) return true;
  return Boolean(resolve(node.when, context));
}

export function setBoundValue(context: RenderContext, key: string, value: unknown): void {
  if (!isSafeIntelligenceUiStateKey(key)) return;
  context.setState((previous) => previous[key] === value ? previous : { ...previous, [key]: value });
}

function dispatchPrompt(event: MouseEvent<HTMLButtonElement>, prompt: string): void {
  if (!prompt.trim()) return;
  event.currentTarget.dispatchEvent(new CustomEvent('tool-retry', {
    bubbles: true,
    detail: { tool: 'intelligent_ui', prompt: prompt.trim() },
  }));
}

function openSafeUrl(rawUrl: string): void {
  try {
    const url = new URL(rawUrl, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    window.open(url.href, '_blank', 'noopener,noreferrer');
  } catch {
    /* Invalid model-provided URLs are inert by design. */
  }
}

export function executeAction(action: UiAction, context: RenderContext, event: MouseEvent<HTMLButtonElement>): void {
  const type = typeof action.type === 'string' ? action.type : '';
  if (type === 'set' && typeof action.key === 'string') {
    setBoundValue(context, action.key, resolve(action.value, context));
    return;
  }
  if (type === 'increment' && typeof action.key === 'string' && isSafeIntelligenceUiStateKey(action.key)) {
    const current = asNumber(context.state[action.key], 0);
    const amount = asNumber(resolve(action.amount, context), 1);
    setBoundValue(context, action.key, current + amount);
    return;
  }
  if (type === 'prompt' && !context.readOnly) {
    const prompt = asText(resolve(action.prompt, context));
    if (prompt) dispatchPrompt(event, prompt);
    return;
  }
  if (type === 'open_url') {
    const url = asText(resolve(action.url, context));
    if (url) openSafeUrl(url);
  }
}
