export { intelligentUiControlIssues, normalizeIntelligentUiControl } from './intelligentUiControls.js';
export { normalizeIntelligentUiNode, normalizeIntelligentUiArgs, normalizeIntelligentUiPatchArgs } from './intelligentUiNormalize.js';
export * from './intelligenceUi';
export * from './turnRuntime.js';
export { validateIntelligentUi } from './intelligentUiValidation.js';
export * from './visualizationMath.js';
export { dispatchChatSseFrame, consumeSseBuffer } from './sse.js';
import type { Attachment, JsonValue, Message, Session } from '@socrates/contracts';

export type { ChatSseHandlers, ChatStreamError, Message, Session } from '@socrates/contracts';

export {
  createToolRunApi,
  pureToolRunApi,
  TOOL_RUN_PHASES,
} from './toolRun.ts';
export type {
  ToolRun,
  ToolRunApi,
  ToolRunSummary,
  ToolRunWasmBinding,
} from './toolRun.ts';

export {
  createPlaybackClock,
  computeCps,
  DEFAULT_PLAYBACK_CONFIG,
} from './streamPlayer.ts';
export type {
  PlaybackClock,
  PlaybackConfig,
  PlaybackState,
  TickResult,
} from './streamPlayer.ts';

export function messageText(message: Pick<Message, 'rawText' | 'content'>) {
  return message.rawText || message.content || '';
}

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: string } };

export type ChatHistoryMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string | ChatContentPart[];
  reasoning_content?: string;
};

export const CHAT_HISTORY_MAX_TURNS = 30;
export const CHAT_HISTORY_MAX_CHARS = 2000;

/** Remove every \`<tag>\u2026</tag>\` run in one left-to-right sweep.
 *  \`/<tag>[\\s\\S]*?<\\/tag>/g\` restarts its lazy scan at each opener, so a
 *  message that repeats \`<tag>\` costs O(n\u00b2); indexOf is linear. */
function stripTaggedBlocks(value: string, tag: string): string {
  const lower = value.toLowerCase();
  if (lower.length !== value.length) return value;
  const openTag = '<' + tag + '>';
  const closeTag = '</' + tag + '>';
  let out = '';
  let cursor = 0;
  for (;;) {
    const open = lower.indexOf(openTag, cursor);
    if (open === -1) break;
    const close = lower.indexOf(closeTag, open + openTag.length);
    if (close === -1) break;
    out += value.slice(cursor, open);
    cursor = close + closeTag.length;
  }
  return out + value.slice(cursor);
}

function stripThinking(value: string) {
  return stripTaggedBlocks(value, 'think')
    .replace(/^Thinking\.\.\.\s*/i, '')
    .replace(/^Thinking\s*/i, '')
    .replace(/<\/?think>/gi, '')
    .trim();
}

function clipped(value: string, maxChars: number) {
  return value.length > maxChars ? `${value.slice(0, maxChars)}…` : value;
}

function attachmentParts(attachments: Attachment[], maxChars?: number): ChatContentPart[] {
  const parts: ChatContentPart[] = [];
  for (const attachment of attachments) {
    if (!attachment) continue;
    if (attachment.kind === 'image' && attachment.dataUrl) {
      parts.push({ type: 'image_url', image_url: { url: attachment.dataUrl, detail: 'auto' } });
      continue;
    }
    if (!attachment.text) continue;
    const text = maxChars === undefined ? attachment.text : clipped(attachment.text, maxChars);
    const label = attachment.kind === 'pdf'
      ? `[Parsed PDF: ${attachment.name}]`
      : attachment.kind === 'text'
        ? `[Parsed file: ${attachment.name}]`
        : attachment.docKind
          ? `[Parsed ${attachment.docKind.toUpperCase()}: ${attachment.name}]`
          : `[Parsed document: ${attachment.name}]`;
    parts.push({ type: 'text', text: `${label}\n${text}` });
  }
  return parts;
}

/**
 * Reconstruct the model-facing content for a user message. The persisted
 * message remains plain text plus attachment metadata, while the request
 * uses OpenAI-compatible content parts whenever the attachment has usable
 * image data or extracted text.
 */
export function buildUserContentParts(rawText: string, attachments?: Attachment[], maxChars?: number): string | ChatContentPart[] {
  const text = maxChars === undefined ? rawText.trim() : clipped(rawText.trim(), maxChars);
  const parts: ChatContentPart[] = text ? [{ type: 'text', text }] : [];
  parts.push(...attachmentParts(attachments || [], maxChars));
  return parts.length > 0 && (parts.length > 1 || (attachments || []).some((attachment) =>
    attachment?.kind === 'image' && Boolean(attachment.dataUrl) || Boolean(attachment?.text)
  )) ? parts : text;
}

/**
 * Build the bounded conversation payload shared by the RN and desktop
 * clients. Older turns are clipped, inline reasoning tags are removed, and
 * stored attachments are reconstructed so retry/regenerate does not degrade
 * a multimodal turn into a text-only prompt.
 */
export function buildChatHistory(messages: Message[], options: { maxTurns?: number; maxChars?: number } = {}): ChatHistoryMessage[] {
  const maxTurns = options.maxTurns ?? CHAT_HISTORY_MAX_TURNS;
  const maxChars = options.maxChars ?? CHAT_HISTORY_MAX_CHARS;
  const source = messages.length > maxTurns * 2 ? messages.slice(-maxTurns * 2) : messages;
  const history: ChatHistoryMessage[] = [];
  for (const message of source) {
    const role: ChatHistoryMessage['role'] = message.role === 'user'
      ? 'user'
      : message.role === 'system'
        ? 'system'
        : 'assistant';
    const raw = stripThinking(messageText(message));
    const content = role === 'user' && message.attachments?.length
      ? buildUserContentParts(raw, message.attachments, maxChars)
      : clipped(raw, maxChars);
    if (!content && !(role === 'user' && message.attachments?.length)) continue;
    const entry: ChatHistoryMessage = { role, content };
    if (message.reasoningContent) entry.reasoning_content = message.reasoningContent;
    history.push(entry);
  }
  return history;
}

/* Keep the export typed as JsonValue-compatible for callers that pass the
 * result directly into ChatRequest without weakening the shared contract. */
export function asChatJsonContent(content: string | ChatContentPart[]): string | JsonValue {
  return content as string | JsonValue;
}

export function createDraftSession(id: string, mode: Session['mode'] = 'chat'): Session {
  return {
    id,
    title: null,
    topic: '',
    mode,
    phase: 'topic',
    kind: mode === 'tutor' ? 'tutor' : 'chat',
    messages: [],
    updatedAt: new Date().toISOString(),
  };
}

export * from './turnEvidence.js';
export * from './intelligentUiPatch.js';
export * from './turnRuntimeText.js';
export { openUiProgramIssues, openUiStateIssue, openUiRuntimeIssues } from './openUiProgram.js';
export { calculatorStep, initialCalculatorState, type CalculatorState } from './calculator';
export { PHYSICS_MODELS, physicsModelDefinition, physicsParameters, physicsParametersError, createPhysicsRuntime, oscillatorState, electricField, pendulumTrajectory, type PhysicsModelDefinition, type PhysicsRuntime, type PhysicsPoint } from './physicsModels.js';
export { validateDemonstration, demonstrationDomain, createDemonstrationRuntime, parseDemonstrationExpression, evaluateDemonstrationExpression, normalizeDemonstrationProgram, normalizeDemonstrationExpression, isDemonstrationBudgetError, type DemonstrationWarning, type DemonstrationIssue, type DemonstrationProgram, type DemonstrationValue, type DemonstrationRuntime, type DemonstrationView, type DemonstrationField, type DemonstrationPlot, type DemonstrationParameter, type DemonstrationTrajectory, type DemonstrationScene, type DemonstrationObject, type DemonstrationPoint } from './demonstration.js';

export { physicsDemonstrationProgram } from './physicsPrograms.js';

export { LEARNING_KINDS, LEARNING_UI_GUIDANCE, LEARNING_UI_MISUSE_COMPONENTS, openUiLearningMisuse, normalizeLearningUiNode, learningUiIssues, type LearningUiNode, type LearningUiKind } from './learningUi.js';
