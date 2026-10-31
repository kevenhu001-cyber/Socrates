/**
 * chat/turn/finishRender.ts — finish-time metadata and persistence.
 *
 * Ordinary chat keeps its progressive render and saves raw text. Canvas
 * output still builds the HTML required by its editor. Reasoning_content
 * is persisted as `reasoningContent`, the inline-tool textOffset split
 * points are stamped onto `toolCalls[]` from `inlineToolRows`, the canvas
 * template's `outputMode` and `canvasId` are copied onto the entry, and
 * `_streamSettled` + `_toolRunRev` publish completion without replacing prose.
 *
 * Extracted from chat/streamingTurn.ts during the 2026-10 addStreamingMessage
 * split. The tool-call offset writeback, the canvas-mode branch, and the
 * fallback path all keep their original sequencing; the wrap-up that calls
 * this module's result runs in chat/streamingTurn.ts so the post-render
 * wiring (memory / a11y / save / stats / stop-button restore) stays
 * adjacent to the rest of the finish path.
 */
import { settleTurnRuntime } from '@socrates/core';
import { stateStore } from '../../state/store.ts';
import { buildAssistantHtml } from '../../render/assistantHtml.ts';
import { stripChatArtifacts } from '../../util/stripChatArtifacts.ts';
import { readTurnMessage } from './runtimeState.ts';
import type { TurnRuntimeState, TurnToolCall } from './runtimeState.ts';
import { reportSwallow as reportEmptyCatch } from '../../util/reportSwallow.ts';

/** The composer template the send started from. */
interface ActiveTemplateWindow extends Window {
  _activeTemplate?: { outputMode?: string; icon?: string } | null;
}

export interface FinishRenderResult {
  visibleFinal: string;
}

export interface FinishRender {
  run(): FinishRenderResult;
}

function seedCanvasPendingId(win: ActiveTemplateWindow): void {
  if (!win._activeTemplate || win._activeTemplate.outputMode !== 'canvas') return;
  stateStore.dispatch({
    type: 'state/set', key: '_canvasPendingId',
    value: 'canvas-' + Math.random().toString(36).slice(2, 10),
  });
}

function stampToolOffsets(state: TurnRuntimeState): void {
  const message = readTurnMessage(state.msgIdx);
  if (!message || !Array.isArray(message.toolCalls)) return;
  const offsets = new Map<string, number>(state.inlineToolRows.map((row) => [row.id, row.offset]));
  state.patchOwnedMessage({
    toolCalls: message.toolCalls.map((call: TurnToolCall) => {
      const id = call.id;
      if (id === undefined || !offsets.has(id) || call.textOffset === offsets.get(id)) return call;
      const updated: TurnToolCall = { ...call, textOffset: offsets.get(id) };
      if (call._run) Object.defineProperty(updated, '_run', { value: call._run, enumerable: false });
      return updated;
    }),
  });
}

function finalizeThinkingStatus(state: TurnRuntimeState): void {
  if (!state.thinkCtl || typeof state.thinkCtl.finalize !== 'function') return;
  try { state.thinkCtl.finalize(); } catch (error) {
    reportEmptyCatch(error, 'empty catch: chat/turn/finishRender.ts:63');
    /* status already finalized */
  }
}

function finalizeOwnedMessage(
  state: TurnRuntimeState,
  win: ActiveTemplateWindow,
  finalHtml: string | null,
): void {
  if (!state.ownsMessageSlot()) return;
  const outputMode = (win._activeTemplate && win._activeTemplate.outputMode) || 'chat';
  const current = readTurnMessage(state.msgIdx);
  const previousToolRunRevision = (current && current._toolRunRev) || 0;
  const patch: Record<string, unknown> = {
    html: finalHtml,
    rawText: state.full,
    type: 'assistant',
    reasoningContent: state.fullReasoning || null,
    reasoningDurationSec: (state.fullReasoning && state.reasoningDurationSec) ? state.reasoningDurationSec : undefined,
    outputMode,
    _liveStatus: null,
    _streamSettled: true,
    turnRuntime: settleTurnRuntime(current?.turnRuntime),
    _toolRunRev: previousToolRunRevision + 1,
  };
  if (outputMode === 'canvas') {
    patch.canvasId = stateStore.read('_canvasPendingId') || ('canvas-' + Math.random().toString(36).slice(2, 10));
    patch._extensionIcon = (win._activeTemplate && win._activeTemplate.icon) || '';
  }
  state.patchOwnedMessage(patch);
  stateStore.dispatch({ type: 'state/set', key: '_canvasPendingId', value: null });
}

/**
 * Build the finish-time render bound to one turn's state.
 *
 * Reads `state.full`, `state.fullReasoning`, `state.inlineToolRows`,
 * `state.clientId`, `state.msgIdx`, and `state.list`.
 */
export function createFinishRender(state: TurnRuntimeState): FinishRender {
  function run(): FinishRenderResult {
    const win = window as ActiveTemplateWindow;
    /* P_canvas-mode — seed a stable canvasId on state BEFORE the
       buildAssistantHtml call so the canvas wrapper inside that
       function reuses the same id. */
    seedCanvasPendingId(win);
    /* P_declarative-tool-run — the finalized html carries prose only:
       react/tool-run splices the rows in from toolCalls[].textOffset,
       so a second copy baked into `html` would render each row twice.
       The split points captured at tool time are stamped onto the
       entries here — that is what makes the layout survive the
       save/reload round-trip. */
    try {
      stampToolOffsets(state);
    } catch (error) {
      reportEmptyCatch(error, 'empty catch: chat/turn/finishRender.ts:126');
      /* tool offset writeback failed; layout will fall back */
    }
    // Ordinary chat persists raw text. Its progressive DOM is already painted;
    // building final HTML here repeats all parsing and can register widgets twice.
    const visibleFinal = stripChatArtifacts(state.full)
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<think>[\s\S]*$/gi, '');
    const canvasMode = win._activeTemplate && win._activeTemplate.outputMode === 'canvas';
    const finalHtml = canvasMode ? buildAssistantHtml(visibleFinal) : null;
    /* Finalize the thinking status BEFORE saving it so the spinner
       stops once the response is complete. */
    finalizeThinkingStatus(state);
    finalizeOwnedMessage(state, win, finalHtml);
    /* Return the render result so the caller can run the post-render
       wiring (memory / a11y / save / stats / stop-button restore) with
       the same `visibleFinal` value used to build the html. */
    return { visibleFinal };
  }
  return { run };
}
