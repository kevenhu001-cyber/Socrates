/**
 * ui/agentMode.js — the composer's Agent switch.
 *
 * Chat normally lets the model decide whether a request needs the Codex
 * workspace agent. That is the right default, but a user who already knows
 * the task is repository work should not have to phrase their way into it.
 * This switch sets one bit on the next request (`agentMode: true`), which the
 * server turns into a first-hop `tool_choice` for `workspace_agent`; every
 * later hop is unconstrained, so the model still writes the answer itself.
 *
 * The button hides itself when the server reports the agent runtime as
 * disabled, so the UI never offers a capability the backend cannot honour.
 */

import { apiFetch } from '../util/api.js';

const STORAGE_KEY = 'socrates.agentMode';
const BUTTON_ID = 'agentModeBtn';

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch (_) {
    return false;
  }
}

function persist(value) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch (_) { /* private mode — the in-memory flag still applies */ }
}

function button() {
  return typeof document !== 'undefined' ? document.getElementById(BUTTON_ID) : null;
}

/** Reflect the current flag on the button (pressed state + tooltip). */
export function syncAgentModeUI() {
  const el = button();
  if (!el) return;
  const state = (typeof window !== 'undefined' && window.state) || {};
  const on = state.agentMode === true;
  el.setAttribute('aria-pressed', on ? 'true' : 'false');
  el.dataset.active = on ? '1' : '0';
  const label = on
    ? translate('agent.modeOn', '已开启 Agent：本轮交给工作区代理')
    : translate('agent.modeOff', '开启 Agent：让工作区代理执行任务');
  el.setAttribute('title', label);
  el.setAttribute('aria-label', label);
}

function translate(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      const value = window.t(key);
      if (value && value !== key) return value;
    }
  } catch (_) { /* fall through */ }
  return fallback;
}

/** Toggle the switch. Returns the new value. */
export function toggleAgentMode() {
  if (typeof window === 'undefined') return false;
  if (!window.state) window.state = {};
  const next = window.state.agentMode !== true;
  window.state.agentMode = next;
  persist(next);
  syncAgentModeUI();
  return next;
}

/**
 * Restore the persisted flag and hide the button when the server has no
 * agent runtime. Capability failures leave the button hidden rather than
 * advertising a mode that would silently do nothing.
 */
export async function initAgentMode() {
  if (typeof window === 'undefined') return;
  if (!window.state) window.state = {};
  window.state.agentMode = readStored();
  const el = button();
  if (el) el.hidden = true;
  syncAgentModeUI();
  try {
    const capabilities = await apiFetch('/api/agent-runs/capabilities');
    const enabled = !!(capabilities && capabilities.enabled);
    if (el) el.hidden = !enabled;
    if (!enabled && window.state.agentMode) {
      window.state.agentMode = false;
      persist(false);
      syncAgentModeUI();
    }
  } catch (_) {
    /* Unauthenticated or offline: keep the control hidden. */
  }
}
