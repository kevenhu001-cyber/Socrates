/* ─── save_memory tool definition (sent to upstream on every chat turn) ───
 *
 * Closes the write side of the memory loop: the model can persist durable
 * user facts instead of relying on the user to type them into Settings.
 * Reads still flow through the client-injected context block; this tool
 * only writes. Server-side rules (dedupe, length cap, project ownership)
 * live in the executor — the schema stays minimal on purpose.
 */
export const SAVE_MEMORY_TOOL = {
  type: 'function',
  function: {
    name: 'save_memory',
    description:
      '## What this tool does\n' +
      'Saves a durable fact about the user to long-term memory so it survives across sessions (for example: preferred language, learning goals, skill level, stated preferences, or project decisions they asked you to remember).\n\n' +
      '## When to call\n' +
      '- The user explicitly asks you to remember something ("remember that…", "don\'t forget…").\n' +
      '- The user states a stable preference or fact likely to matter in future sessions.\n\n' +
      '## When NOT to call\n' +
      '- Transient conversation content, task progress, or anything only relevant to this session.\n' +
      '- Secrets, credentials, or sensitive personal data — never persist those.\n' +
      '- A fact already visible in the injected memory/context block — it is already saved.\n\n' +
      '## Notes\n' +
      'Write one concise self-contained sentence (max 500 chars). Use scope "project" only for facts specific to the currently active project; everything else is "global". Duplicate saves are deduplicated server-side.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'One concise, self-contained sentence describing the durable fact (max 500 characters).',
          minLength: 1,
          maxLength: 500,
        },
        scope: {
          type: 'string',
          enum: ['global', 'project'],
          description: '"global" applies across all sessions; "project" applies only to the currently active project (requires one to be open).',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
};
