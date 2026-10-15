/**
 * chat/turn/finishViewport.js — finish-time viewport re-assertion.
 *
 * Capture the visible answer before completion updates its status and tools.
 * Preserve that row or paragraph while the layout settles; proximity to the
 * bottom is never a reason to move the reader to a different paragraph.
 */
import { stateStore } from '../../state/store.js';
import { updateMessageSnapshot } from '../../ui/messageSnapshot.js';
import { writeScrollTop } from '../../ui/scrollCoordinator.ts';

/**
 * Build the finish-viewport capture/settle pair bound to one turn's DOM.
 *
 * @param {object} state
 * @param {HTMLElement} state.list   the #msgList scroll container
 * @param {HTMLElement|null} state.div  the streaming shell (legacy, may be
 *   detached by finish-time in the React path)
 * @param {string}      state.clientId  this turn's assistant bubble id
 * @param {number}      state.msgIdx    numeric index into stateStore.read("messages")
 * @param {boolean}     state.reactLive  whether the React surface owns the
 *   list — the capture/settle only runs in the React path
 * @returns {{capture: () => void, settle: () => void}}
 */
export function createFinishViewport(state) {
  var _finishViewport = null;
  function capture() {
    if (!state.reactLive || !state.list) return;
    try {
      var list = state.list;
      var _fvRect = list.getBoundingClientRect();
      var _fvRows = list.querySelectorAll('.msg[data-client-id]');
      var _fvAnchor = null;
      var _fvStreamRowOffset = null;
      var _fvStreamRowNearTop = false;
      /* If the answer that is finishing is actually visible, it is the
         unambiguous anchor. Scanning from the top can accidentally pick
         the previous assistant row when its margin/border overlaps the
         viewport by a pixel, which shifts the current answer during the
         legacy-to-React swap. Keep an explicit row-level snapshot too:
         inner nodes may be transplanted and stay connected, masking the
         fact that the outer answer row itself moved. */
      var liveRow = state.div && state.div.isConnected ? state.div
        : list.querySelector('.msg[data-client-id="' + state.clientId + '"]');
      if (liveRow) {
        var _fvLiveRect = liveRow.getBoundingClientRect();
        if (_fvLiveRect.bottom > _fvRect.top + 1 && _fvLiveRect.top < _fvRect.bottom - 1) {
          _fvAnchor = liveRow;
          _fvStreamRowOffset = _fvLiveRect.top - _fvRect.top;
          _fvStreamRowNearTop = Math.abs(_fvStreamRowOffset) <= 96;
        }
      }
      /* Otherwise prefer an assistant (non-user) message as the anchor
         so the viewport stays on the answer the reader is looking at. A
         user message partially visible at the top of the viewport would
         otherwise drag the scroll position back to the question after
         the React handoff changes layout. */
      for (let _fvi = 0; !_fvAnchor && _fvi < _fvRows.length; _fvi++) {
        const _fvr = _fvRows[_fvi].getBoundingClientRect();
        if (_fvr.bottom > _fvRect.top + 1) {
          if (!_fvRows[_fvi].classList.contains('user')) { _fvAnchor = _fvRows[_fvi]; break; }
        }
      }
      if (!_fvAnchor) {
        for (let _fvi = 0; _fvi < _fvRows.length; _fvi++) {
          const _fvr = _fvRows[_fvi].getBoundingClientRect();
          if (_fvr.bottom > _fvRect.top + 1) { _fvAnchor = _fvRows[_fvi]; break; }
        }
      }
      /* Prefer an exact visible node inside the message body. The old
         row-level anchor could preserve the bubble's top while still
         moving the paragraph the user was reading by hundreds of
         pixels after async content and tool rows were transplanted. */
      var _fvInnerAnchor = null;
      if (_fvAnchor) {
        var _fvCandidates = _fvAnchor.querySelectorAll(
          '.stream-settled-content > *,.stream-live-content > *,' +
          '.think-prefix > *,.think-suffix > *,.tool-inline,' +
          '.visualization-card,.exec-artifact,.tool-run-prose > *,.msg-body > *'
        );
        for (var _fvni = 0; _fvni < _fvCandidates.length; _fvni++) {
          var _fvnr = _fvCandidates[_fvni].getBoundingClientRect();
          if (_fvnr.bottom > _fvRect.top + 1) { _fvInnerAnchor = _fvCandidates[_fvni]; break; }
        }
      }
      /* When the answer row itself begins at the viewport top, anchor
         the row rather than its first paragraph. Streaming-only chrome
         above that paragraph disappears during the React handoff; an
         inner anchor would preserve the paragraph but visibly pull the
         whole answer upward by exactly that chrome height. Once the row
         starts well above the viewport, the reader is genuinely in the
         middle of a long answer and the inner paragraph is the better
         anchor. */
      var _fvRowOffset = _fvAnchor
        ? _fvAnchor.getBoundingClientRect().top - _fvRect.top
        : 0;
      var _fvMeasuredAnchor = (_fvAnchor && Math.abs(_fvRowOffset) <= 96)
        ? _fvAnchor
        : (_fvInnerAnchor || _fvAnchor);
      _finishViewport = {
        scroller: list,
        /* Freeze the reader-intent flag NOW: layout churn during the
           handoff fires scroll events that can flip the live flag
           without any user input. */
        scrolledAway: !!stateStore.read("_userScrolledAway"),
        scrollTop: list.scrollTop,
        streamRowId: _fvStreamRowNearTop ? state.clientId : null,
        streamRowOffset: _fvStreamRowNearTop ? _fvStreamRowOffset : null,
        anchorNode: _fvMeasuredAnchor,
        anchorId: _fvAnchor ? _fvAnchor.getAttribute('data-client-id') : null,
        anchorOffset: _fvMeasuredAnchor ? _fvMeasuredAnchor.getBoundingClientRect().top - _fvRect.top : 0
      };
    } catch (_) { /* viewport capture failed; settle will no-op */ }
  }

  /* Completion can retire status rows or mount tool outputs. Reapply the
     captured reading position for a bounded number of frames, stopping as
     soon as the reader scrolls or interacts. */
  function settle() {
    if (!state.reactLive) return;
    if (!_finishViewport || !_finishViewport.scroller) return;
    var _fvScroller = _finishViewport.scroller;
    var _fvUserIntent = false;
    var _fvMarkIntent = function () { _fvUserIntent = true; };
    var _fvIntentEvents = ["wheel", "touchstart", "pointerdown", "keydown"];
    for (var _fvei = 0; _fvei < _fvIntentEvents.length; _fvei++) {
      window.addEventListener(_fvIntentEvents[_fvei], _fvMarkIntent,
        { passive: true, capture: true });
    }
    var _fvDetachIntent = function () {
      for (var _fvej = 0; _fvej < _fvIntentEvents.length; _fvej++) {
        window.removeEventListener(_fvIntentEvents[_fvej], _fvMarkIntent,
          { capture: true });
      }
    };
    var _fvApply = function () {
      // Completion must preserve the text being read, including for a reader
      // who happens to be near the bottom. Snapping to the new bottom moves
      // every paragraph when actions/status change the row's height.
      if (_finishViewport.scrolledAway && _finishViewport.scrollTop <= 2) {
        /* At the absolute transcript top, preserving scrollTop
           is the user's explicit intent. Mid-answer reading is
           different: React/legacy height deltas move the visible
           paragraph even when scrollTop itself is unchanged, so
           let the row-anchor branches below preserve content. */
        writeScrollTop(_fvScroller, _finishViewport.scrollTop, 'finish');
      } else if (_finishViewport.streamRowId &&
        Number.isFinite(_finishViewport.streamRowOffset)) {
        var _fvStreamRow = state.list.querySelector(
          '.msg[data-client-id="' + _finishViewport.streamRowId + '"][data-react-owned]'
        );
        if (_fvStreamRow) {
          var _fvStreamRect = _fvStreamRow.getBoundingClientRect();
          var _fvStreamNow = _fvStreamRect.top -
            _fvScroller.getBoundingClientRect().top;
          var _fvStreamDelta = _fvStreamNow - _finishViewport.streamRowOffset;
          if (_fvStreamDelta > 1) {
            var _fvMaxTop = Math.max(0,
              _fvScroller.scrollHeight - _fvScroller.clientHeight);
            var _fvNeededTop = _fvScroller.scrollTop + _fvStreamDelta;
            var _fvShortfall = Math.ceil(_fvNeededTop - _fvMaxTop);
            if (_fvShortfall > 0) {
              /* The reader is already at the physical scroll
                 limit, so create only the missing answer reserve
                 before applying the row correction. This blank
                 tail is the same turn viewport anchor used while
                 streaming and is cleared when the next user turn
                 begins. */
              var _fvRequiredMin = Math.ceil(
                _fvStreamRect.height + _fvShortfall
              );
              _fvStreamRow.style.minHeight = _fvRequiredMin + "px";
              var _fvStreamMsg = state.msgIdx >= 0 ? stateStore.read("messages")[state.msgIdx] : null;
              if (_fvStreamMsg) {
                updateMessageSnapshot(_fvStreamMsg, {
                  _turnAnchorMinHeight: Math.max(
                    Number(_fvStreamMsg._turnAnchorMinHeight) || 0,
                    _fvRequiredMin
                  )
                }, true);
              }
            }
          }
          writeScrollTop(_fvScroller, _fvScroller.scrollTop + _fvStreamDelta, 'finish');
        }
      } else if (_finishViewport.anchorNode && _finishViewport.anchorNode.isConnected) {
        var _fvExactNow = _finishViewport.anchorNode.getBoundingClientRect().top -
          _fvScroller.getBoundingClientRect().top;
        writeScrollTop(
          _fvScroller,
          _fvScroller.scrollTop + _fvExactNow - _finishViewport.anchorOffset,
          'finish'
        );
      } else if (_finishViewport.anchorId) {
        var _fvCurrent = null;
        var _fvCurrentRows = state.list.querySelectorAll('.msg[data-client-id]');
        for (var _fvci = 0; _fvci < _fvCurrentRows.length; _fvci++) {
          if (_fvCurrentRows[_fvci].getAttribute('data-client-id') === _finishViewport.anchorId) {
            _fvCurrent = _fvCurrentRows[_fvci]; break;
          }
        }
        if (_fvCurrent) {
          var _fvNow = _fvCurrent.getBoundingClientRect().top -
            _fvScroller.getBoundingClientRect().top;
          writeScrollTop(
            _fvScroller,
            _fvScroller.scrollTop + _fvNow - _finishViewport.anchorOffset,
            'finish'
          );
        } else {
          writeScrollTop(_fvScroller, _finishViewport.scrollTop, 'finish');
        }
      } else {
        writeScrollTop(_fvScroller, _finishViewport.scrollTop, 'finish');
      }
    };
    var _fvFrames = 0;
    var _fvSettle = function () {
      if (_fvUserIntent) { _fvDetachIntent(); return; }
      try { _fvApply(); } catch (_) { /* frame apply failed */ }
      if (++_fvFrames < 30) { requestAnimationFrame(_fvSettle); }
      else { _fvDetachIntent(); }
    };
    _fvSettle();
  }

  return { capture, settle };
}
