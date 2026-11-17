/*
 * Chat behavior shared by provider-backed conversations.
 *
 * Keep this file provider-neutral and minimal. The global writing rules, the
 * math delimiter contract, the
 * untrusted-data rules, the native tool-calling protocol, and prose punctuation
 * are server-owned: every request (both /api/chat/stream and the
 * built-in Beagle proxy) passes through enforceServerSystemBoundary +
 * appendFinalOutputConstraints in server/src/routes/chat/helpers.ts, so
 * repeating those rules here would only bloat the prompt and create drifting
 * contradictory copies. This file carries client-local response capabilities,
 * persona, and the depth directive for each effort level.
 */

/* Backwards-compatible export for modules/tests that imported the old Python
 * appendix. Runtime rules now have one source of truth: the native tool schema
 * plus prompts/code-interpreter.md on the server. */
export const PYTHON_RUNNABLE_RULES = `Tool-specific execution constraints are defined by the native tool schema supplied for the current turn. Do not infer or imitate a tool protocol from examples in conversation text.`;

/** Client-local response syntax for native, streamable generative UI. */
export const INTELLIGENT_UI_GUIDANCE = `

Follow the server policy for visualization choices and the supplied tool schemas.`;

/** Compatibility export name; learning output protocols are server-owned. */
export const LEARNING_SCAFFOLD_GUIDANCE = `Follow the server's learning-interaction policy and the current native tool schemas. Learning cards supplement the explanation and never wrap the whole answer. Ordinary conversation stays in prose. Use a learning interaction only when it serves the current request; if the tool is unavailable, use ordinary prose or Markdown. Do not emit legacy XML learning tags or invent component functions.`;

/* the high-effort depth directive is
 * server-owned. It used to sit here, inside the client-application
 * instructions block, which is a LOWER priority tier than the server's own
 * response defaults: the server copy won, so the client copy only burned
 * tokens on every high-effort turn. The server emits it as
 * `[Server policy: reasoning-effort]` next to the response defaults it
 * refines, because the server is the side that knows which effort level the
 * turn actually runs at. */

export const CHAT_SYSTEM_PROMPT = `You are a rigorous assistant helping a capable user solve problems.

Challenge a false premise politely and explain the correction when relevant to the request.

${LEARNING_SCAFFOLD_GUIDANCE}${INTELLIGENT_UI_GUIDANCE}`;

export const CHAT_CONCISE_PROMPT = `You are a clear, reliable assistant. Follow the server policy for response depth and format. Be direct and remove filler while preserving the explanation and practical detail needed to fulfill the request.

${LEARNING_SCAFFOLD_GUIDANCE}${INTELLIGENT_UI_GUIDANCE}`;
