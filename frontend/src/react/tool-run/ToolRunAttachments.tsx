/**
 * react/tool-run/ToolRunAttachments.tsx — a call's output host.
 *
 * The wrapper (class + `data-tool-anchor`) is the contract the rest of the
 * system hangs off: CSS styles it, the history-recovery pass reuses it by
 * anchor, and the mount dedup keys on it. The actual rendering is delegated to
 * react/tool-output, which dispatches on the ToolOutput protocol and owns
 * per-output lifecycle and error isolation.
 *
 * Structural note: every output mounts into THIS wrapper (the shared host),
 * not into a per-output child. `restorePersistedMessageExtras` mounts into the
 * same wrapper on history restore; keeping one host is what makes the
 * `[data-visualization-id]` dedup hold across the two paths.
 */
import { validateIntelligentUi } from '@socrates/core';
import { LazyIntelligenceUiBlock } from '../intelligence-ui/LazyIntelligenceUiBlock';
import { useEffect, useRef, useState } from 'react';

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

export function ToolRunAttachments({ call, tools = [call], readOnly }: ToolRunAttachmentsProps) {
  const outputs = attachmentOutputsOf(call);
  const hostRef = useRef<HTMLDivElement | null>(null);
  /* Children mount only once the host element exists, so each renderer's
     effect can hand the real node to the legacy mounter. */
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(hostRef.current);
  }, [call.id]);

  if (call.name === 'render_intelligent_ui') {
    const state = toolRunStateOf(call);
    const surface = call.uiSurface;
    if (surface?.phase === 'aborted' && state !== 'done') return null;
    const document = surface && surface.phase !== 'aborted' ? { version: 1, nodes: surface.nodes } : intelligenceUiDocumentOf(call);
    /* A validated-looking document may be painted as soon as its arguments
       are complete; the tool row remains the authority for final success.
       Failed/stopped calls never expose rejected UI data. */
    if (document && state !== 'error' && state !== 'stopped') {
      const source = document.nodes.map((node) => JSON.stringify(node)).join('\n');
      if (source) {
        return <div className="tool-inline-attachments" data-tool-anchor={call.id}>
          <LazyIntelligenceUiBlock
            source={source}
            showActivityCue={false}
            tools={tools}
            open={surface && surface.phase !== 'aborted' ? surface.phase === 'streaming' : state === 'running' || state === 'awaiting'}
            readOnly={readOnly}
          />
        </div>;
      }
    }
  }
  if (!outputs.length) return null;

  return (
    <div
      className="tool-inline-attachments"
      data-tool-anchor={call.id}
      ref={hostRef}
    >
      {host
        ? outputs.map((output) => (
          <ToolOutputRenderer key={output.id} output={output} host={host} />
        ))
        : null}
    </div>
  );
}

export default ToolRunAttachments;
