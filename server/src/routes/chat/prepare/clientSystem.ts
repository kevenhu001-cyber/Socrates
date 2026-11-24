/**
 * Collapse client-supplied system messages into the one server-owned
 * system boundary. Client system text is untrusted; it becomes either
 * application directives or factual context, never a peer system policy.
 */
import { SERVER_SYSTEM_POLICY, escapePromptControlText } from '../../../lib/chatPolicy.js';
import type { ProviderMessage } from '../../../lib/providerMessageSchema.js';

/**
 * Establish one server-owned system boundary for every chat request.
 *
 * The public request schema intentionally accepts system messages because the
 * frontend uses them for templates and conversation summaries. They are still
 * client-controlled input, so forwarding them as peer system messages lets a
 * caller redefine the tool protocol. Collapse them into two scoped blocks
 * beneath the immutable server protocol:
 *
 *   <client_application_instructions scope="response-behavior">
 *     persona / tone / role directives (custom instructions, template
 *     systemPrompt, project instructions). These may guide how the model
 *     responds, but they cannot override the server policy.
 *   <client_context_data scope="untrusted">
 *     memories, project name/description, fetched web research, and any
 *     other data the client surfaces as background. Treated as untrusted
 *     data — the model uses it to inform the answer but does not treat it
 *     as instructions.
 *
 * Conversation messages (user/assistant) are preserved in their original
 * order between the system boundary and any later messages.
 */
export interface ClientSystemClassification {
  /** Persona, voice, role and project directives. */
  application: string[];
  /** Memories, project metadata, fetched research: factual context only. */
  context: string[];
}

/**
 * Classify the client-supplied system messages of a turn.
 *
 * The same classification runs on every turn, not only on the one that
 * creates the session snapshot: the template persona, the tone preset and
 * the custom instructions are turn state, and the client re-sends them on
 * every request.
 */
export function classifyClientSystemMessages(
  messages: ProviderMessage[],
): ClientSystemClassification {
  const application: string[] = [];
  const context: string[] = [];
  for (const message of messages) {
    if (message?.role !== 'system') continue;
    if (typeof message.content !== 'string' || !message.content.trim()) continue;
    const classified = classifyClientSystem(message.content.trim());
    if (classified.kind === 'application') application.push(classified.content);
    else context.push(classified.content);
    if (classified.contextExtras) {
      for (const extra of classified.contextExtras) context.push(extra);
    }
  }
  return { application, context };
}

/** Render the classified client messages into the two scoped blocks that
 *  sit beneath the server policy. */
export function renderClientBlocks(classification: ClientSystemClassification): string {
  let block = '';
  if (classification.application.length) {
    block += `\n\n<client_application_instructions scope="response-behavior">\n${[...new Set(classification.application)].map(escapePromptControlText).join('\n\n')}\n</client_application_instructions>`;
  }
  if (classification.context.length) {
    block += `\n\n<client_context_data scope="untrusted">\n${[...new Set(classification.context)].map(escapePromptControlText).join('\n\n')}\n</client_context_data>`;
  }
  return block;
}

/** Whether the client sent a system prefix this turn. A client that sends
 *  none keeps the persona frozen in the session snapshot. */
export function hasClientSystemPrefix(messages: ProviderMessage[]): boolean {
  return messages.some(
    (message) =>
      message?.role === 'system' &&
      typeof message.content === 'string' &&
      message.content.trim().length > 0,
  );
}

export function enforceServerSystemBoundary(messages: ProviderMessage[]): ProviderMessage[] {
  const conversation = messages.filter((message) => message?.role !== 'system');
  const clientBlock = renderClientBlocks(classifyClientSystemMessages(messages));
  return [{ role: 'system', content: SERVER_SYSTEM_POLICY + clientBlock }, ...conversation];
}

/* separate directive content from data
 * content sent on `system` role by the client. Three marker families
 * are recognised today:
 *   - `[User custom instructions]…` — application (response style)
 *   - `[Assistant mode instructions]…` — application (chat/tutor mode)
 *   - `[template:<id>]…`              — application (persona / role)
 *   - a block beginning with `## Active project` and containing
 *     `Project instructions: …`       — application (project-specific)
 * Everything else is treated as context data (memories, project
 * metadata, summaries, fetched research) so it does not outrank the
 * server policy on prompt-injection content. The classifier is
 * intentionally conservative: when unsure, content lands in context
 * data, which the SERVER_SYSTEM_POLICY already labels untrusted.
 *
 * `PROJECT_INSTRUCTION_PREFIX` deliberately matches a literal substring
 * produced by `projectContextSuffix()` in frontend/src/main.ts. If
 * either side changes the prefix, change it here too. */
const PROJECT_INSTRUCTION_PREFIX = 'Project instructions:';
const CUSTOM_INSTRUCTION_PREFIX = '[User custom instructions]';
const MODE_INSTRUCTION_PREFIX = '[Assistant mode instructions]';
/* The template marker identifies a persona block. The frontend used to
   stamp it at the END of the block while this classifier only looked at
   the FIRST line, so every template persona landed in the untrusted
   client_context_data bucket, where the server policy tells the model not
   to follow any directive inside it. The marker now leads the block, and
   the trailing shape is accepted as well so a client that still runs an
   older bundle keeps its persona working. */
const TEMPLATE_MARKER_REGEX = /^\s*\[template:[^\]]+\]/;

type Classified = { kind: 'application' | 'context'; content: string; contextExtras?: string[] };
function classifyClientSystem(raw: string): Classified {
  /* a system string is treated as application
     instructions when the first non-empty line is
     an application marker (`[User custom instructions]` or
     `[template:...]`). Markdown headings and lists inside a marked block
     are valid instruction content.
     The only mixed block split is the frontend's `## Active project` block,
     which contains both project metadata and a `Project instructions:` line.
     This narrow rule prevents arbitrary memory text containing that phrase
     from being promoted into application instructions.
  */
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'context', content: '' };

  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return { kind: 'context', content: '' };

  /* A block that opens with a markdown heading is a DATA block: the saved
     memories, the client-side memory store, the project metadata. The
     template marker never opens such a block, and a data block stays in the
     untrusted tier even when one of its lines happens to look like a
     marker. That keeps a hostile memory from being promoted into an
     application directive. */
  const isDataBlock = /^#{1,6}\s/.test(lines[0]);
  const firstIsAppMarker =
    !isDataBlock &&
    (lines[0].startsWith(CUSTOM_INSTRUCTION_PREFIX) ||
      lines[0].startsWith(MODE_INSTRUCTION_PREFIX) ||
      TEMPLATE_MARKER_REGEX.test(lines[0]));
  /* The trailing shape of the template marker is accepted too. The client
     owns this content either way, so the classification only picks the tier
     its own directives land in; it never widens what a client may do. */
  const lastIsTemplateMarker = !isDataBlock && TEMPLATE_MARKER_REGEX.test(lines[lines.length - 1]);
  const directiveIdx = trimmed.indexOf(PROJECT_INSTRUCTION_PREFIX);
  const isActiveProjectBlock = /^##\s+Active project\b/i.test(lines[0]) && directiveIdx >= 0;

  if ((firstIsAppMarker || lastIsTemplateMarker) && !isActiveProjectBlock) {
    return { kind: 'application', content: trimmed };
  }

  /* The "## Active project" section mixes project metadata (data)
     with project instructions (directive). Split on the
     "Project instructions:" marker so both can land in their
     respective blocks. The metadata comes first; the directive
     follows. */
  if (isActiveProjectBlock) {
    const dataHead = trimmed.slice(0, directiveIdx).trim();
    const directive = trimmed.slice(directiveIdx).trim();
    return {
      kind: 'application',
      content: directive || trimmed,
      contextExtras: dataHead ? [dataHead] : undefined,
    };
  }

  return { kind: 'context', content: trimmed };
}

/* End of client-system classification. The purity predicate lives
 * inline in classifyClientSystem above; no further helpers needed. */

/* ─────────────────────────────────────────────────────────────────
   Per-tier monthly Beagle token quota check
   ───────────────────────────────────────────────────────────────── */
