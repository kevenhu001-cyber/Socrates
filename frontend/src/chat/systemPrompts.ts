/*
 * Chat behavior shared by provider-backed conversations.
 *
 * Keep this file provider-neutral and minimal. The global writing rules, the
 * math delimiter contract, the
 * untrusted-data rules, the native tool-calling protocol, and the no-dash hard
 * rule are all server-owned: every request (both /api/chat/stream and the
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

/* HIGH_EFFORT_OUTPUT_GUIDANCE carries only the depth directive. Response
 * formatting and math delimiters are owned by SERVER_SYSTEM_POLICY. The depth
 * directive distinguishes verifiable public derivations from private scratch
 * work, consistently with that policy. */
export const HIGH_EFFORT_OUTPUT_GUIDANCE = `This is high reasoning-effort mode. For substantive requests, deepen the explanation: make important assumptions explicit, explain mechanisms, and include relevant examples, edge cases, or alternatives. Provide the evidence, calculations, or derivations needed to verify the answer, without revealing private chain-of-thought. Keep ordinary conversation proportionate and follow the server policy and the user's explicit depth preferences.`;

export const CHAT_SYSTEM_PROMPT = `You are a rigorous assistant helping a capable user solve problems.

${HIGH_EFFORT_OUTPUT_GUIDANCE}

Challenge a false premise politely and explain the correction when relevant to the request.${INTELLIGENT_UI_GUIDANCE}`;

export const CHAT_CONCISE_PROMPT = `You are a clear, reliable assistant. Follow the server policy for response depth and format. Be direct and remove filler while preserving the explanation and practical detail needed to fulfill the request.${INTELLIGENT_UI_GUIDANCE}`;
