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
import { validateIntelligentUi } from '@socrates/core';
import { LazyIntelligenceUiBlock } from '../intelligence-ui/LazyIntelligenceUiBlock';
import { NormalizedVisualizationsContext } from '../intelligence-ui/openui/normalizedVisualizations';
import { IntelligenceUiFailureCard } from '../intelligence-ui/IntelligenceUiFailureCard';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { ToolOutputRenderer } from '../tool-output/ToolOutputRenderer';
import { attachmentOutputsOf, toolRunStateOf, type ToolCallRecord } from './toolRunModel';

export interface ToolRunAttachmentsProps {
  call: ToolCallRecord;
  tools?: ReadonlyArray<ToolCallRecord>;
  readOnly?: boolean;
}

interface IntelligenceUiDocument {
  version: 1;
  nodes: unknown[];
}

function parseIntelligenceUiDocument(value: unknown): IntelligenceUiDocument | null {
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
  const record = candidate as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.nodes) || !validateIntelligentUi(record).ok) return null;
  return { version: 1, nodes: record.nodes };
}

/**
 * Native tool arguments can reach the client in three equivalent shapes:
 * parsed `tool_use.input`, a pre-use `input.__raw` snapshot, or the cumulative
 * `tool_call_delta.argumentsText`. Reading all three removes event-order races
 * without changing the persisted tool protocol.
 */
function intelligenceUiDocumentOf(call: ToolCallRecord): IntelligenceUiDocument | null {
  const direct = parseIntelligenceUiDocument(call.input);
  if (direct) return direct;

  if (call.input && typeof call.input === 'object' && !Array.isArray(call.input)) {
    const raw = (call.input as Record<string, unknown>).__raw;
    const recovered = parseIntelligenceUiDocument(raw);
    if (recovered) return recovered;
  }

  return parseIntelligenceUiDocument(call.argumentsText);
}

function renderIntelligenceUiAttachment(
  call: ToolCallRecord,
  tools: ReadonlyArray<ToolCallRecord>,
  readOnly?: boolean,
): ReactElement | null | false {
  const state = toolRunStateOf(call);
  const surface = call.uiSurface;
  if (surface?.phase === 'aborted' && state !== 'done') return false;
  const document = surface && surface.phase !== 'aborted'
    ? { version: 1, nodes: surface.nodes }
    : intelligenceUiDocumentOf(call);
  /* A rejected call keeps a visible card (title, reason, table, repair)
     instead of vanishing, unless a later attempt in the same turn replaced
     it: that retry renders its own card. */
  if (state === 'error') return renderIntelligenceUiFailure(call, tools, readOnly);
  if (!document || state === 'stopped') return null;
  const source = document.nodes.map((node) => JSON.stringify(node)).join('\n');
  if (!source) return null;
  const serverSpecs = Array.isArray(call.visualizations)
    ? call.visualizations.filter((spec): spec is Record<string, unknown> => !!spec && typeof spec === 'object' && !Array.isArray(spec))
    : [];
  return (
    <div className="tool-inline-attachments" data-tool-anchor={call.id}>
      <NormalizedVisualizationsContext.Provider value={serverSpecs}>
        <LazyIntelligenceUiBlock
          source={source}
          showActivityCue={false}
          tools={tools}
          open={surface && surface.phase !== 'aborted' ? surface.phase === 'streaming' : state === 'running' || state === 'awaiting'}
          readOnly={readOnly}
        />
      </NormalizedVisualizationsContext.Provider>
    </div>
  );
}

function supersededByLaterAttempt(call: ToolCallRecord, tools: ReadonlyArray<ToolCallRecord>): boolean {
  const index = tools.findIndex((entry) => entry.id === call.id);
  if (index < 0) return false;
  return tools.slice(index + 1).some((entry) => entry.name === call.name);
}

function renderIntelligenceUiFailure(
  call: ToolCallRecord,
  tools: ReadonlyArray<ToolCallRecord>,
  readOnly?: boolean,
): ReactElement | null {
  if (supersededByLaterAttempt(call, tools)) return null;
  return (
    <div className="tool-inline-attachments" data-tool-anchor={call.id} data-tool-failed="true">
      <IntelligenceUiFailureCard call={call} readOnly={readOnly} />
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
    const intelligentUiAttachment = renderIntelligenceUiAttachment(call, tools, readOnly);
    if (intelligentUiAttachment === false) return null;
    if (intelligentUiAttachment) return intelligentUiAttachment;
  }
  if (!outputs.length) return null;

  return (
    <div
      className="tool-inline-attachments"
      data-tool-anchor={call.id}
      ref={hostRef}
    >
      {outputs.map((output) => (
        <ToolOutputRenderer key={output.id} output={output} host={host ?? undefined} />
      ))}
    </div>
  );
}

export default ToolRunAttachments;
