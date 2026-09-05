/* session/beacon.js — pagehide/visibilitychange last-chance save payload.
 *
 * Extracted from main.js P_save-on-unload (Wave F3). The lifecycle wiring
 * (beforeunload/pagehide listeners, keepalive fetch) stays in main.js
 * because it touches unload-time globals; only the pure snapshot/payload
 * builder lives here so it can be unit-tested without DOM globals.
 *
 * Rules mirrored from main.js:
 * - skip streaming placeholders, keep rawText/role only (html regenerates)
 * - preserve reasoningContent from either camelCase or snake_case key
 * - cap attachments/toolCalls at 20 per message
 * - topic falls back to sessionTitle and vice versa
 */

export function buildBeaconMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(function (m) { return m && m.type !== 'streaming'; })
    .map(function (m) {
      return {
        clientId: m.clientId || null,
        role: m.role,
        rawText: m.rawText || null,
        reasoningContent: m.reasoningContent || m.reasoning_content || null,
        attachments: Array.isArray(m.attachments) ? m.attachments.slice(0, 20) : [],
        toolCalls: Array.isArray(m.toolCalls) ? m.toolCalls.slice(0, 20) : [],
      };
    });
}

export function buildBeaconPayload({ sessionId, topic, sessionTitle, appMode, messages }) {
  var snapshot = buildBeaconMessages(messages);
  if (!sessionId || !snapshot.length) return null;
  return {
    id: sessionId,
    topic: topic || sessionTitle || '',
    title: sessionTitle || topic || '',
    mode: appMode,
    messages: snapshot,
  };
}

export function readBeaconCsrf(cookieString) {
  var m = String(cookieString || '').match(/\bcsrf=([^;]+)/);
  return m ? m[1] : null;
}
