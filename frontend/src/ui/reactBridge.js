/* ui/reactBridge.js — the cross-tree notification channel between the
   legacy JS pipeline (main.js) and the React tree (which mounts the
   chat / message-list surfaces). C5 island 1: the smallest meaningful
   unit in main.js that has zero closure dependencies on the rest of
   the file.

   The notification has two consumers:
     1. window.__socratesReactChatBridge.publish(event) — the React
        app pulls state via this bridge and refreshes the tree when
        the event fires.
     2. window.dispatchEvent(new CustomEvent(
          "socrates:chat-runtime-changed", { detail: event })) —
        listeners (devtools, third-party integrations) that prefer
        the standard DOM event surface.

   Both legs are best-effort. A missing bridge is not an error — a
   page that has not mounted the React app yet has no bridge and the
   dispatchEvent fallback still fires. A thrown handler in either leg
   is caught so a misbehaving consumer cannot break the producer. */
export function publishReactChatRuntime(event) {
  try {
    var bridge = (typeof window !== 'undefined') ? window.__socratesReactChatBridge : null;
    if (bridge && typeof bridge.publish === 'function') bridge.publish(event);
  } catch (_) { /* ignore — a misbehaving React subscriber must not break the legacy pipeline */ }
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('socrates:chat-runtime-changed', { detail: event || {} }));
    }
  } catch (_) { /* same — no-op when CustomEvent is unavailable */ }
}
