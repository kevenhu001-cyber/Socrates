/**
 * chat/turn/finishRender.js — finish-time single formatMsg pass.
 *
 * At natural finish, this module does the one and only markdown pass that
 * ever becomes the `html` field of the saved message. Reasoning_content
 * is persisted as `reasoningContent`, the inline-tool textOffset split
 * points are stamped onto `toolCalls[]` from `inlineToolRows`, the canvas
 * template's `outputMode` and `canvasId` are copied onto the entry, and
 * `_streamSettled` + `_toolRunRev` flip so React swaps the live bubble
 * for the finalized row in one commit.
 *
 * Extracted from chat/streamingTurn.js during the 2026-10 addStreamingMessage
 * split. The tool-call offset writeback, the canvas-mode branch, and the
 * fallback path all keep their original sequencing; the wrap-up that calls
 * this module's result runs in chat/streamingTurn.js so the post-render
 * wiring (memory / a11y / save / stats / stop-button restore) stays
 * adjacent to the rest of the finish path.
 */
import { stateStore } from '../../state/store.js';
import { esc } from '../../render/helpers.js';
import { buildAssistantHtml } from '../../render/assistantHtml.ts';
import { stripChatArtifacts } from '../../util/stripChatArtifacts.js';

/**
 * Build the finish-time render bound to one turn's state.
 *
 * @param {object} state  shared turn state (see chat/streamingTurn.js).
 *   Reads `state.full`, `state.fullReasoning`, `state.inlineToolRows`,
 *   `state.clientId`, `state.msgIdx`, `state.div`, `state.list`.
 * @returns {{run: () => void}}
 */
export function createFinishRender(state) {
  function run() {
    /* P_canvas-mode — seed a stable canvasId on state BEFORE the
       buildAssistantHtml call so the canvas wrapper inside that
       function reuses the same id. */
    if (window._activeTemplate && window._activeTemplate.outputMode === 'canvas') {
      stateStore.dispatch({
        type: "state/set", key: "_canvasPendingId",
        value: 'canvas-' + Math.random().toString(36).slice(2, 10)
      });
    }
    /* P_declarative-tool-run — the finalized html carries prose only:
       react/tool-run splices the rows in from toolCalls[].textOffset,
       so a second copy baked into `html` would render each row twice.
       The split points captured at tool time are stamped onto the
       entries here — that is what makes the layout survive the
       save/reload round-trip. */
    try {
      var _m = state.msgIdx >= 0 ? stateStore.read("messages")[state.msgIdx] : null;
      if (_m && Array.isArray(_m.toolCalls)) {
        var offsets = new Map(state.inlineToolRows.map(row => [row.id, row.offset]));
        state.patchOwnedMessage({toolCalls: _m.toolCalls.map(call => {
          if (!offsets.has(call.id) || call.textOffset === offsets.get(call.id)) return call;
          var updated = {...call, textOffset: offsets.get(call.id)};
          if (call._run) Object.defineProperty(updated, '_run', {value: call._run, enumerable: false});
          return updated;
        })});
      }
    } catch (_) { /* tool offset writeback failed; layout will fall back */ }
    var finalHtml;
    var visibleFinal;
    try {
      visibleFinal = stripChatArtifacts(state.full)
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<think>[\s\S]*$/gi, "");
      finalHtml = buildAssistantHtml(visibleFinal);
    } catch {
      console.log("[finish] render error");
      finalHtml = "<p>" + esc(stripChatArtifacts(state.full)
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<think>[\s\S]*$/gi, "")) + "</p>";
    }
    /* Finalize the thinking status BEFORE saving it so the spinner
       stops once the response is complete. */
    if (state.thinkCtl && typeof state.thinkCtl.finalize === "function") {
      try { state.thinkCtl.finalize(); } catch (_) { /* status already finalized */ }
    }
    if (state.ownsMessageSlot()) {
      /* P_canvas-mode — copy the active template's outputMode + canvasId
         onto the message so React's <CanvasBlock> can branch instead of
         falling through to dangerouslySetInnerHTML. */
      var _om = (window._activeTemplate && window._activeTemplate.outputMode) || 'chat';
      var _preRev = (stateStore.read("messages")[state.msgIdx] && stateStore.read("messages")[state.msgIdx]._toolRunRev) || 0;
      var _finalPatch = {
        html: finalHtml, rawText: state.full,
        type: "assistant",
        reasoningContent: state.fullReasoning || null, outputMode: _om,
        _streamSettled: true,
        _toolRunRev: _preRev + 1,
      };
      if (_om === 'canvas') {
        _finalPatch.canvasId = stateStore.read("_canvasPendingId") || ('canvas-' + Math.random().toString(36).slice(2, 10));
        _finalPatch._extensionIcon = (window._activeTemplate && window._activeTemplate.icon) || '';
      }
      state.patchOwnedMessage(_finalPatch);
      stateStore.dispatch({ type: "state/set", key: "_canvasPendingId", value: null });
    }
    try {
      if (state.div && state.div.isConnected) state.div.dataset.streamSettled = "true";
      if (state.list && state.list.querySelector) {
        var _settledRow = state.list.querySelector('.msg[data-client-id="' + state.clientId + '"]');
        if (_settledRow) _settledRow.dataset.streamSettled = "true";
      }
    } catch (_) { /* settled marker failed; React will reconcile */ }
    /* Return the render result so the caller can run the post-render
       wiring (memory / a11y / save / stats / stop-button restore) with
       the same `visibleFinal` value used to build the html. */
    return { visibleFinal: visibleFinal };
  }
  return { run };
}
