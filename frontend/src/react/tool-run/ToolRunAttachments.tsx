/**
 * react/tool-run/ToolRunAttachments.tsx — a call's output host.
 *
 * The wrapper (class + `data-tool-anchor`) is the contract the rest of the
 * system hangs off: CSS styles it, the history-recovery pass reuses it by
 * anchor, and the mount dedup keys on it. The actual rendering is delegated to
 * react/tool-output, which dispatches on the ToolOutput protocol and owns
 * per-output lifecycle and error isolation.
 *
 * The wrapper is the shared anchor for history recovery. Artifact outputs are
 * rendered as React children immediately; only imperative visualization
 * adapters wait for its DOM node.
 */
import { normalizeIntelligentUiArgs, validateIntelligentUi } from '@socrates/core';
import { LazyIntelligentUiBlock } from '../intelligent-ui/LazyIntelligentUiBlock';
import { NormalizedVisualizationsContext } from '../intelligent-ui/openui/normalizedVisualizations';
import { IntelligentUiFailureCard } from '../intelligent-ui/IntelligentUiFailureCard';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { ToolOutputRenderer } from '../tool-output/ToolOutputRenderer';
import {
  attachmentOutputsOf,
  toolOutputsOf,
  toolRunStateOf,
  type ToolCallRecord,
} from './toolRunModel';

export interface ToolRunAttachmentsProps {
  call: ToolCallRecord;
  tools?: ReadonlyArray<ToolCallRecord>;
  readOnly?: boolean;
}

interface IntelligentUiDocument {
  version: 1;
  nodes: unknown[];
}

function parseIntelligentUiDocument(value: unknown): IntelligentUiDocument | null {
  let candidate = value;
  if (typeof candidate === 'string') {
    const text = candidate.trim();
    if (!text) return null;
    try {
      candidate = JSON.parse(text);
    } catch {
      /* A streamed argument string is expected to be invalid until its final
         chunk arrives. Treat that as "not ready yet", not as a render error. */
      return null;
    }
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const normalized = normalizeIntelligentUiArgs(candidate) as Record<string, unknown>;
  if (!normalized || normalized.version !== 1 || !Array.isArray(normalized.nodes)) return null;
  const validation = validateIntelligentUi(normalized);
  if (
    !validation.ok &&
    !['learning', 'control', 'visualization', 'demonstration'].includes(validation.kind || '')
  ) {
    return null;
  }
  /* A persisted call can carry an argument skeleton whose visualization node
     has only an id/type (no template): the real spec lives in `outputs[]`.
     Treat that skeleton as "no program" so the output host mounts the spec
     instead of the OpenUI path drawing an empty chart over it. */
  const nodes = normalized.nodes as Array<Record<string, unknown>>;
  const hasVisualization = nodes.some((node) => node && node.type === 'visualization');
  const hasRenderableVisualization = nodes.some(
    (node) =>
      node && node.type === 'visualization' && typeof node.template === 'string' && node.template,
  );
  if (hasVisualization && !hasRenderableVisualization) return null;
  return { version: 1, nodes: normalized.nodes };
}

/**
 * Native tool arguments can reach the client in three equivalent shapes:
 * parsed `tool_use.input`, a pre-use `input.__raw` snapshot, or the cumulative
 * `tool_call_delta.argumentsText`. Reading all three removes event-order races
 * without changing the persisted tool protocol.
 */
function intelligentUiDocumentOf(call: ToolCallRecord): IntelligentUiDocument | null {
  const direct = parseIntelligentUiDocument(call.input);
  if (direct) return direct;

  if (call.input && typeof call.input === 'object' && !Array.isArray(call.input)) {
    const raw = (call.input as Record<string, unknown>).__raw;
    const recovered = parseIntelligentUiDocument(raw);
    if (recovered) return recovered;
  }

  return parseIntelligentUiDocument(call.argumentsText);
}

function resolveIntelligentUiSource(
  call: ToolCallRecord,
  surface: ToolCallRecord['uiSurface'],
): { source: string | null; hasVisualization: boolean } {
  const document =
    surface && surface.phase !== 'aborted'
      ? { version: 1, nodes: surface.nodes }
      : intelligentUiDocumentOf(call);

  if (!document) {
    const hasVisualization = toolOutputsOf(call).some((output) => output.kind === 'visualization');
    return { source: null, hasVisualization };
  }
  const source = document.nodes.map((node) => JSON.stringify(node)).join('\n') || null;
  return { source, hasVisualization: false };
}

function renderIntelligentUiAttachment(
  call: ToolCallRecord,
  tools: ReadonlyArray<ToolCallRecord>,
  readOnly?: boolean,
): ReactElement | null | false {
  const state = toolRunStateOf(call);
  const surface = call.uiSurface;
  if (surface?.phase === 'aborted' && state !== 'done') return false;
  if (state === 'error') return renderIntelligentUiFailure(call, tools, readOnly);
  if (state === 'stopped') return null;

  const { source, hasVisualization } = resolveIntelligentUiSource(call, surface);
  if (!source) {
    if (hasVisualization) return null;
    if (state === 'done') return renderIntelligentUiFailure(call, tools, readOnly);
    return null;
  }
  const serverSpecs = Array.isArray(call.visualizations)
    ? call.visualizations.filter(
        (spec): spec is Record<string, unknown> =>
          !!spec && typeof spec === 'object' && !Array.isArray(spec),
      )
    : [];
  return (
    <div className="tool-inline-attachments" data-tool-anchor={call.id}>
      <NormalizedVisualizationsContext.Provider value={serverSpecs}>
        <LazyIntelligentUiBlock
          source={source}
          showActivityCue={false}
          tools={tools}
          open={
            surface && surface.phase !== 'aborted'
              ? surface.phase === 'streaming'
              : state === 'running' || state === 'awaiting'
          }
          readOnly={readOnly}
        />
      </NormalizedVisualizationsContext.Provider>
    </div>
  );
}

function supersededByLaterAttempt(
  call: ToolCallRecord,
  tools: ReadonlyArray<ToolCallRecord>,
): boolean {
  const index = tools.findIndex((entry) => entry.id === call.id);
  if (index < 0) return false;
  return tools.slice(index + 1).some((entry) => entry.name === call.name);
}

function renderIntelligentUiFailure(
  call: ToolCallRecord,
  tools: ReadonlyArray<ToolCallRecord>,
  readOnly?: boolean,
): ReactElement | null {
  if (supersededByLaterAttempt(call, tools)) return null;
  return (
    <div className="tool-inline-attachments" data-tool-anchor={call.id} data-tool-failed="true">
      <IntelligentUiFailureCard call={call} readOnly={readOnly} />
    </div>
  );
}

export function ToolRunAttachments({ call, tools = [call], readOnly }: ToolRunAttachmentsProps) {
  const outputs = attachmentOutputsOf(call);
  const hostRef = useRef<HTMLDivElement | null>(null);
  /* Charts mount only once the host element exists. React artifact markup is
     present from the first commit so history recovery can recognize it. */
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(hostRef.current);
  }, [call.id]);

  if (call.name === 'render_intelligent_ui') {
    const intelligentUiAttachment = renderIntelligentUiAttachment(call, tools, readOnly);
    if (intelligentUiAttachment === false) return null;
    if (intelligentUiAttachment) return intelligentUiAttachment;
  }
  if (!outputs.length) return null;

  return (
    <div className="tool-inline-attachments" data-tool-anchor={call.id} ref={hostRef}>
      {outputs.map((output) => (
        <ToolOutputRenderer key={output.id} output={output} host={host ?? undefined} />
      ))}
    </div>
  );
}

export default ToolRunAttachments;
