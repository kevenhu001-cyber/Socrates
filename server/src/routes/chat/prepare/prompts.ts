/**
 * Prompt assembly blocks for a chat request.
 *
 * Owns the server-owned mode prompts, assistant instructions, the native
 * tool contract, and routing hints. Context retrieval (RAG/memory) lives in
 * context.ts; the request orchestrator lives in request.ts.
 */
import { appendServerPolicy, escapePromptControlText, FINAL_OUTPUT_CONSTRAINTS_MARKER } from '../../../lib/chatPolicy.js';
import { getCodeInterpreterPrompt, getTeacherModePrompt } from '../../../lib/prompts.js';
import { MAX_VISUALIZATION_POINTS } from '../../../services/visualization.js';
import { getDb } from '../../../db/index.js';
import { artifacts, sessions } from '../../../db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { NotFound } from '../../../lib/errors.js';
import type { ProviderMessage } from '../../../lib/providerMessageSchema.js';

export const TEACHER_MODE_MARKER = '[Server policy: teacher-mode]';

/* every context step below is split into a `resolve…`
   half (the I/O: DB reads, embedding call, prompt file) and the
   appendServerPolicy half that folds its text into the system message.
   prepareChatRequest runs the resolve halves concurrently and applies them in
   the documented order, so the assembled prompt is byte-identical to the old
   one-after-another chain while the first token waits for the slowest step
   instead of the sum of all of them. The append… wrappers keep the original
   call shape for other callers and tests. */
export interface PolicyBlock {
  marker: string;
  prompt: string | null;
}

export function applyPolicyBlock(
  messages: ProviderMessage[],
  block: PolicyBlock | null,
): ProviderMessage[] {
  return block ? appendServerPolicy(messages, block.marker, block.prompt) : messages;
}

export async function appendAssistantInstructions(
  messages: ProviderMessage[],
  assistantId: string | undefined,
  sessionId: string | undefined,
  userId: string | undefined,
): Promise<ProviderMessage[]> {
  return applyPolicyBlock(
    messages,
    await resolveAssistantInstructions(assistantId, sessionId, userId),
  );
}

export async function resolveAssistantInstructions(
  assistantId: string | undefined,
  sessionId: string | undefined,
  userId: string | undefined,
): Promise<PolicyBlock | null> {
  if (!userId) return null;
  let selectedId = assistantId;
  if (!selectedId && sessionId) {
    const [session] = await getDb()
      .select({ assistantId: sessions.assistantId })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .limit(1);
    selectedId = session?.assistantId || undefined;
  }
  if (!selectedId) return null;
  const [assistant] = await getDb()
    .select({ source: artifacts.source })
    .from(artifacts)
    .where(
      and(
        eq(artifacts.id, selectedId),
        eq(artifacts.userId, userId),
        eq(artifacts.type, 'assistant'),
      ),
    )
    .limit(1);
  if (!assistant) throw new NotFound('Assistant not found');
  try {
    const config = JSON.parse(assistant.source) as { instructions?: string };
    return {
      marker: '[User-selected assistant]',
      prompt: escapePromptControlText(String(config.instructions || '').slice(0, 12000)),
    };
  } catch {
    return null;
  }
}

/* Server-owned mode prompts are appended to the canonical first system
   message. Keeping one authoritative system message prevents client-supplied
   system blocks from interleaving with or outranking server tool policy. */
export async function prependTeacherModePrompt(
  messages: ProviderMessage[],
): Promise<ProviderMessage[]> {
  const prompt = await getTeacherModePrompt();
  return appendServerPolicy(messages, TEACHER_MODE_MARKER, prompt);
}

/* Some OpenAI-compatible providers truncate function descriptions. Keep a
 * compact server-owned routing/runtime appendix, but inject it only on a
 * request that actually contains code_interpreter in its native tool list. */
const CODE_INTERPRETER_PROMPT_MARKER = '[Server policy: code-interpreter]';
export async function prependCodeInterpreterPrompt<T extends { role: string; content?: unknown }>(
  messages: T[],
): Promise<T[]> {
  const prompt = await getCodeInterpreterPrompt();
  if (!prompt) return messages;
  return appendAppendix(
    messages,
    CODE_INTERPRETER_PROMPT_MARKER,
    `${CODE_INTERPRETER_PROMPT_MARKER}\n${prompt}`,
  );
}

/* the provider's `tools` array is the executable
 * contract.  This small server-owned appendix is generated from the exact
 * definitions attached to the request, so prompt guidance cannot drift when
 * a tool is enabled or removed.  It is inserted before the final hard rule,
 * preserving the documented prompt assembly order.
 *
 * The appendix is regenerated on every provider hop from the untouched
 * conversation, so it also carries per-hop state: the live iteration and
 * retry budget from toolTurnPolicy, one canonical example per callable tool
 * (same source as the correction text a rejected call receives), and the
 * tools that have stepped aside after repeated failures. Callers must keep
 * passing the original messages array — appendAppendix returns a clone, so
 * the running conversation is never mutated and the appendix can change
 * from hop to hop. */
const NATIVE_TOOL_CONTRACT_MARKER = '[Server policy: native-tool-contract]';

export interface NativeToolContractOptions {
  /** Live budget for this turn, from `toolTurnPolicy.snapshot()`. */
  limits?: {
    maxIterations?: number;
    iterationsUsed?: number;
    maxCallsPerIteration?: number;
    maxTotalCalls?: number;
    callsUsed?: number;
    perToolFailureLimit?: number;
  } | null;
  /** Tools withdrawn for the rest of the turn, with the reason. */
  disabledTools?: ReadonlyArray<{ name: string; reason: string }> | null;
  /** `name → one-line JSON example`, rendered under the tool list. */
  examples?: Readonly<Record<string, string>> | null;
  /** Calls dropped by the per-iteration cap on the previous hop. */
  droppedCalls?: number;
}

export function appendNativeToolContract<T extends { role: string; content?: unknown }>(
  messages: T[],
  toolNames: string[],
  options: NativeToolContractOptions = {},
): T[] {
  const names = [
    ...new Set(
      toolNames.filter((name): name is string => typeof name === 'string' && name.length > 0),
    ),
  ];
  const availability = names.length > 0 ? names.map((name) => `\`${name}\``).join(', ') : 'none';
  const sections = [
    NATIVE_TOOL_CONTRACT_MARKER,
    `The native tools available for this turn are exactly: ${availability}.`,
    'Invoke a tool only through the provider\'s native function-calling channel. Each call argument must be one JSON object matching that function\'s supplied `parameters` schema exactly and any per-kind shape rules in the tool-routing hints above. Never emit a legacy text marker, Markdown tool block, `{"tool":...}` object, or an extra `input`/`arguments` wrapper. If no native tool is supplied, do not invent or imitate one.',
    'Treat tool errors as internal feedback. Correct retryable arguments and retry within the turn budget when needed; do not narrate errors or ask the user to retry. Never repeat an uncertain side-effecting action automatically. If recovery is exhausted, answer with verified results and briefly state only a material limitation.',
  ];

  const examples = options.examples || null;
  if (names.length > 0 && examples) {
    const lines = names
      .map((name) => (examples[name] ? `- ${name}: ${examples[name]}` : ''))
      .filter(Boolean);
    if (lines.length > 0) {
      sections.push(
        ['A minimal correct argument object for each callable tool:', ...lines].join('\n'),
      );
    }
  }

  const limits = options.limits || null;
  if (limits) {
    const budget: string[] = [];
    if (limits.maxIterations) {
      budget.push(
        `This turn allows up to ${limits.maxIterations} tool rounds.`,
      );
    }
    if (limits.maxCallsPerIteration)
      budget.push(`Emit at most ${limits.maxCallsPerIteration} tool calls per round.`);
    if (limits.perToolFailureLimit) {
      budget.push(
        `A tool that fails ${limits.perToolFailureLimit} times in a row becomes unavailable for the rest of this turn, so make each corrected call materially different.`,
      );
    }
    if (budget.length > 0) sections.push(budget.join(' '));
  }

  const disabled = (options.disabledTools || []).filter((entry) => entry && entry.name);
  if (disabled.length > 0) {
    sections.push(
      [
        'Withdrawn for the rest of this turn after repeated failures; do not call these again:',
        ...disabled.map((entry) => `- ${entry.name} (${entry.reason})`),
      ].join('\n'),
    );
  }

  if (options.droppedCalls && options.droppedCalls > 0) {
    sections.push(
      `Your previous round emitted ${options.droppedCalls} tool call(s) over the per-round limit; ` +
        'those calls were discarded and never ran. Re-issue only the calls that still matter, within the per-round limit.',
    );
  }

  return appendAppendix(messages, NATIVE_TOOL_CONTRACT_MARKER, sections.join('\n'));
}

/* append concise per-tool routing guidance only
 * when the matching tool is actually present in this turn's tool set.
 * The previous client-side implementation prepended visual and planning
 * routing prompts unconditionally, even on turns that had no matching
 * visualization or document tool — wasting tokens
 * and inviting weaker models to fabricate unsupported calls. The server
 * now gates these appendices on the live tool list, so a turn without
 * visualization capability gets zero visualization prompt and vice
 * versa. Each block is gated by its own marker so calling this twice
 * with overlapping tool sets is idempotent. */
const TOOL_ROUTING_HINTS_MARKER = '[Server policy: tool-routing-hints]';

const INTELLIGENT_UI_VISUALIZATION_HINT = `## Unified visual tool
Use \`render_intelligent_ui\` for every explicitly requested static or interactive chart, function graph, diagram, timeline, comparison, simulation, illustration, or learning card. If supplied, use \`code_interpreter\` first only when data must be calculated, read from files, transformed, or exported. Call with {"nodes":[{"type":"visualization","template":"bar","payload":{"categories":["A"],"series":[{"data":[1]}]}}]}. The server deterministically adds version=1 and stable IDs; both may be omitted. Advanced contracts are retrieved only when the get_ui_contract tool is available.

Use a native visualization node with template "function" for ordinary Cartesian graphs. Put every related curve in the same payload.functions array. For "function" templates, expression must be pure ASCII math using lowercase x (e.g. "sin(x)", "x^2 - 2*x + 1"), NEVER an equation ("y = ...") and NEVER LaTeX commands ("\\frac", "\\sin"); put display labels in LaTeX instead (label: "$\\sin(x)$"). For category charts ("line", "bar", "area"), ensure each series.data length exactly matches the categories count. Use a demonstration node when changing parameters or time should recompute the curves, and "math_construction" when the reader needs editable GeoGebra objects. Intelligence UI can present read-only content or act like a regular UI with tabs, sliders, choices and other controls. A display-only panel or chart needs zero buttons.

Prefer native nodes (including native controls and demonstration nodes) over OpenUI source strings. Use OpenUI only when native nodes cannot express the needed interaction; consult its exact contract first when available. Do not mix native node JSON with OpenUI function syntax. Keep essential results visible and bound to state.

Common payload rules live in the render_intelligent_ui schema. Use LaTeX for reader-facing mathematical expressions ($...$ inline, $...$ display), including chart and diagram labels when appropriate. Keep executable expressions, construction commands and numeric data in their required machine syntax. Each series stays at or below ${MAX_VISUALIZATION_POINTS} points; downsample longer data first. Static rows of facts belong in Markdown tables; use interactive tables for local sorting or data bound to declared local state. If validation fails, keep the requested content, fix the indicated fields in one compact native JSON call, and retry if permitted. If truncated, reduce the payload before retrying. Do not emit the invalid UI as Markdown or raw code; fall back to accurate prose if the tool budget is exhausted.`;

const GET_UI_CONTRACT_ROUTING_HINT =
  'Use get_ui_contract only for uncommon template payloads or advanced OpenUI, physics, learning and demonstration contracts. For simulations use get_ui_contract({kind:"demonstration",section:"index"}) or a known section (expressions, ode, electrical, pde, chemistry, algebra, analysis, plots, geometry3d); fetch only required sections. For OpenUI signatures and examples, start with get_ui_contract({kind:"openui",page:1}) and read further pages as needed.';

const READ_ATTACHMENT_ROUTING_HINT = `## Reading file attachments
When a user message contains \`[Attached file: "name" (mime, size), fileId: <uuid>]\` pointers, those files are stored on the server. Call \`read_attachment\` with the pointer's fileId to read a file on demand: documents return extracted text page by page (page forward with \`offset\` until hasMore is false), image attachments return a visual description (optionally focused by \`question\`), and media/binary files return metadata. Always read an attachment before answering questions about its contents; never guess from the filename. If the message also contains native image content, prefer it; use \`read_attachment\` for a second look or for files with no inline preview.`;

const WORKSPACE_AGENT_ROUTING_HINT = `## Workspace agent (Pi)
Choose \`workspace_agent\` automatically whenever the user's intent requires touching the project workspace: creating, editing, or reviewing files; implementing, fixing, or refactoring code; inspecting a repository; running commands or tests; performing an experiment; using project workspace context; or doing work that should be resumed later. This includes a request that changes only one file. Call \`initialize_workspace\` first when the user wants an explicit or clean workspace. Do not wait for the user to enable Agent, start a worker, or provide a special mode. Include the concrete desired outcome and constraints in \`task\`, then let the workspace agent perform the work instead of returning an imagined patch or merely describing commands. Ordinary explanations, short calculations, and a single quick lookup belong in the native response path. The server owns the workspace, model, sandbox, and resource limits. Never ask for or invent an absolute workspace path. While the agent works, the interface streams each step it takes (commands run, files edited, files read) directly into the conversation, so do not narrate those steps yourself or paste raw command output. After the tool returns, summarize what changed, tests run, and created artifacts. In Tutor mode, explain relevant decisions if useful; offer exercises only when the active learning activity or user requests them.`;

const WEB_SEARCH_ROUTING_HINT = `## Web search
When \`web_search\` is supplied, call it for real-time information, current facts, or looking up URLs. The required parameter is \`query\` (a concise search string, 1-6 words). Do not use \`q\` or \`keyword\`. An optional \`count\` (1-12, default 6) may be provided.`;

const IMAGE_SEARCH_ROUTING_HINT = `## Image search
When \`image_search\` is supplied, call it whenever the user asks for pictures, photos, or visual references, or when real-world imagery materially improves the requested answer. Avoid decorative images. The required parameter is \`query\` (a concise descriptive query, 1-6 words). Present the returned image URLs directly on the page using \`render_intelligent_ui\` (with \`image\` or \`image-gallery\` nodes) or Markdown image syntax.`;

const WEB_FETCH_ROUTING_HINT = `## Web fetch
When \`web_fetch\` is supplied, call it to read the content of specific URLs discovered via search or provided by the user. Pass \`url\` (a single http/https URL string) or \`urls\` (an array of up to 4 URLs). Start with small pages; continue with the returned next_offset when needed.`;

const CONNECTOR_DISCOVERY_ROUTING_HINT = `## Connected app connectors
When a request needs connected apps or a native capability not currently listed (computation, visuals, images, files/workspace, documents, sites, papers), call \`search_connectors\` with a short English query. Then call \`get_connector_spec\` with the exact tool name to read its arguments; that tool becomes callable on the next step. Never guess a connector tool name or call a deferred tool before reading its spec. If no match appears, use the connected services list in the result to refine the query.`;

export function appendToolRoutingHints<T extends { role: string; content?: unknown }>(
  messages: T[],
  toolNames: string[],
): T[] {
  const nameSet = new Set(toolNames.filter((name): name is string => typeof name === 'string'));
  const blocks: string[] = [];
  if (nameSet.has('web_search')) blocks.push(WEB_SEARCH_ROUTING_HINT);
  if (nameSet.has('image_search')) blocks.push(IMAGE_SEARCH_ROUTING_HINT);
  if (nameSet.has('web_fetch')) blocks.push(WEB_FETCH_ROUTING_HINT);
  if (nameSet.has('search_connectors') && nameSet.has('get_connector_spec')) {
    blocks.push(CONNECTOR_DISCOVERY_ROUTING_HINT);
  }
  if (nameSet.has('render_intelligent_ui')) {
    blocks.push(INTELLIGENT_UI_VISUALIZATION_HINT);
    if (nameSet.has('get_ui_contract')) blocks.push(GET_UI_CONTRACT_ROUTING_HINT);
  }
  if (nameSet.has('create_document')) {
    blocks.push(
      '## Structured documents\nUse create_document with {kind: \"plan\"|\"spec\", content: {...}}. For plan content send title, optional goal, and 1-30 ordered steps ({title, detail?, status?: todo|in_progress|done}). For spec content send title, optional summary, 1-40 requirements and optional acceptanceCriteria, constraints, outOfScope. Use the user’s language. Do not add input/arguments wrappers or repeat the resulting card in prose.',
    );
  }
  if (nameSet.has('read_attachment')) blocks.push(READ_ATTACHMENT_ROUTING_HINT);
  if (nameSet.has('workspace_agent')) blocks.push(WORKSPACE_AGENT_ROUTING_HINT);
  if (blocks.length === 0) return messages;
  const hint = `${TOOL_ROUTING_HINTS_MARKER}\n${blocks.join('\n\n')}`;
  return appendAppendix(messages, TOOL_ROUTING_HINTS_MARKER, hint);
}

/* Internal helper shared by appendNativeToolContract and
 * appendToolRoutingHints: insert `appendix` into the first system
 * message just before the FINAL_OUTPUT_CONSTRAINTS marker (so the
 * final hard rule always remains the last block). Idempotent via
 * the supplied `marker` so repeat calls do not stack duplicates. */
function appendAppendix<T extends { role: string; content?: unknown }>(
  messages: T[],
  marker: string,
  appendix: string,
): T[] {
  const first = messages[0];
  if (!first || first.role !== 'system' || typeof first.content !== 'string') return messages;
  if (first.content.includes(marker)) return messages;
  const cloned = messages.slice();
  const finalRuleIndex = first.content.indexOf(FINAL_OUTPUT_CONSTRAINTS_MARKER);
  const insertion = `${appendix}\n\n`;
  cloned[0] = {
    ...first,
    content:
      finalRuleIndex >= 0
        ? `${first.content.slice(0, finalRuleIndex)}${insertion}${first.content.slice(finalRuleIndex)}`
        : `${first.content}\n\n${appendix}`,
  } as T;
  return cloned;
}
