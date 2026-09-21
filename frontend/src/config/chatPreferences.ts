export type ReasoningEffort = 'high' | 'medium' | 'low';
export type ResponseSpeed = 'standard' | 'fast';

const EFFORT_KEY = 'socrates-reasoning-effort';
const SPEED_KEY = 'socrates-response-speed';
const EFFORTS = new Set<ReasoningEffort>(['high', 'medium', 'low']);
const SPEEDS = new Set<ResponseSpeed>(['standard', 'fast']);

export function getStoredReasoningEffort(): ReasoningEffort {
  try {
    const value = localStorage.getItem(EFFORT_KEY) as ReasoningEffort | null;
    return value && EFFORTS.has(value) ? value : 'medium';
  } catch {
    return 'medium';
  }
}

export function getStoredResponseSpeed(): ResponseSpeed {
  try {
    const value = localStorage.getItem(SPEED_KEY) as ResponseSpeed | null;
    return value && SPEEDS.has(value) ? value : 'standard';
  } catch {
    return 'standard';
  }
}

export function saveChatPreferences(effort: ReasoningEffort, speed: ResponseSpeed): void {
  const safeEffort = EFFORTS.has(effort) ? effort : 'medium';
  const safeSpeed = SPEEDS.has(speed) ? speed : 'standard';
  try {
    localStorage.setItem(EFFORT_KEY, safeEffort);
    localStorage.setItem(SPEED_KEY, safeSpeed);
  } catch { /* the storage shim may be unavailable in an isolated harness */ }
  window.dispatchEvent(new window.CustomEvent('socrates:chat-preferences', {
    detail: { effort: safeEffort, speed: safeSpeed },
  }));
}
