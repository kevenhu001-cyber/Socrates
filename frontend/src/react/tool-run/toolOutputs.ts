/** Normalize current and legacy tool results into the shared output protocol. */
import {visualizationSpecOf} from '../../render/visualizationSpec.ts';
import type {
  ArtifactOutput,
  ToolCallRecord,
  ToolOutput,
  ToolTextStream,
  VisualizationOutput,
} from './toolRunModel.types.ts';

export {visualizationSpecOf};

/* ── tool output protocol ──────────────────────────────────────────────── */

function outputId(toolCallId: string, kind: ToolOutput['kind'], discriminator: string): string {
  return `${toolCallId}:${kind}:${discriminator}`;
}

/** Validate one persisted protocol entry into a ToolOutput, or drop it. */
function normalizeToolOutput(toolCallId: string, value: unknown): ToolOutput | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.kind === 'visualization') {
    const spec = record.spec;
    if (!spec || typeof spec !== 'object') return null;
    if ((spec as { version?: unknown }).version !== 1) return null;
    return {
      id: outputId(toolCallId, 'visualization', '0'),
      toolCallId,
      kind: 'visualization',
      spec: spec as Record<string, unknown>,
    };
  }
  if (record.kind === 'artifact') {
    const fileId = typeof record.fileId === 'string' ? record.fileId : '';
    if (!fileId) return null;
    return {
      id: outputId(toolCallId, 'artifact', fileId),
      toolCallId,
      kind: 'artifact',
      fileId,
      mimeType: typeof record.mimeType === 'string' ? record.mimeType : null,
      name: typeof record.name === 'string' ? record.name : null,
    };
  }
  if (record.kind === 'text') {
    const text = typeof record.text === 'string' ? record.text : '';
    if (!text) return null;
    const stream: ToolTextStream = record.stream === 'stdout' || record.stream === 'stderr'
      ? record.stream
      : 'result';
    return { id: outputId(toolCallId, 'text', stream), toolCallId, kind: 'text', stream, text };
  }
  return null;
}

function normalizePersistedOutputs(toolCallId: string, value: unknown): ToolOutput[] {
  if (!Array.isArray(value)) return [];
  const out: ToolOutput[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const output = normalizeToolOutput(toolCallId, item);
    if (!output || seen.has(output.id)) continue;
    seen.add(output.id);
    out.push(output);
  }
  return out;
}

/**
 * Synthesize the protocol from a call saved before it existed. Order is fixed
 * and testable: visualization, artifacts, result text, stderr text.
 */
function legacyToolOutputs(call: ToolCallRecord): ToolOutput[] {
  const toolCallId = String(call.id || '');
  const out: ToolOutput[] = [];
  const spec = visualizationSpecOf(call);
  if (spec) {
    out.push({
      id: outputId(toolCallId, 'visualization', '0'),
      toolCallId,
      kind: 'visualization',
      spec,
    });
  }
  const artifacts = Array.isArray(call.artifacts) ? call.artifacts : [];
  const seen = new Set<string>();
  for (const artifact of artifacts) {
    const fileId = artifact && typeof artifact.id === 'string' ? artifact.id : '';
    if (!fileId || seen.has(fileId)) continue;
    seen.add(fileId);
    out.push({
      id: outputId(toolCallId, 'artifact', fileId),
      toolCallId,
      kind: 'artifact',
      fileId,
      mimeType: typeof artifact.mimeType === 'string' ? artifact.mimeType : null,
      name: typeof artifact.name === 'string' ? artifact.name : null,
    });
  }
  if (typeof call.output === 'string' && call.output) {
    out.push({
      id: outputId(toolCallId, 'text', 'result'),
      toolCallId,
      kind: 'text',
      stream: 'result',
      text: call.output,
    });
  }
  if (typeof call.stderr === 'string' && call.stderr) {
    out.push({
      id: outputId(toolCallId, 'text', 'stderr'),
      toolCallId,
      kind: 'text',
      stream: 'stderr',
      text: call.stderr,
    });
  }
  return out;
}

/**
 * The outputs of one call, in the protocol. A call that already carries
 * `outputs[]` (the writer's normalized shape) uses it verbatim — malformed
 * entries and duplicate ids are dropped; every older call gets the same list
 * synthesized from `visualization` / `artifacts` / `output` / `stderr`.
 *
 * This is the read boundary: UI components must not branch on the legacy
 * fields themselves, or live and history can disagree about what a call
 * produced.
 */
export function toolOutputsOf(call: ToolCallRecord | null | undefined): ToolOutput[] {
  if (!call) return [];
  const toolCallId = String(call.id || '');
  const persisted = normalizePersistedOutputs(toolCallId, call.outputs);
  if (persisted.length) return persisted;
  return legacyToolOutputs(call);
}

/** The outputs an attachment host renders: charts and saved files.
 *  Image artifacts (PNG/JPEG/WebP/GIF/SVG) are intentionally excluded — the
 *  assistant must reference them explicitly in prose, e.g.
 *  `![description](/api/files/<fileId>/raw)`, so the user only sees images
 *  the model chooses to show. */
const IMAGE_MIME_RE = /^image\//i;
export function attachmentOutputsOf(
  call: ToolCallRecord | null | undefined,
): Array<VisualizationOutput | ArtifactOutput> {
  return toolOutputsOf(call).filter(
    (output): output is VisualizationOutput | ArtifactOutput => {
      if (output.kind === 'visualization') return true;
      if (output.kind === 'artifact') {
        return !output.mimeType || !IMAGE_MIME_RE.test(output.mimeType);
      }
      return false;
    },
  );
}

/** The approval prompt as the row needs it: copy plus the decision list. */
