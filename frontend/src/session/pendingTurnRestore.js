/* Re-attach detached chat turns after reload or reconnect. The session loader
 * owns when this runs; this module owns pending-turn transport and replay. */
import { stateStore } from '../state/store.js';
import { quietTurn } from '../chat/turnUi.js';
import { buildUserContentParts } from '../chat/history.js';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import {
  bumpPendingSeq,
  clearPendingTurn,
  createChatTurn,
  getChatTurn,
  loadPendingTurn,
  savePendingTurn,
  subscribeChatTurnEvents,
} from '../chat/turnClient.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

/* M2 async — re-attach a detached turn after reload/reconnect.
 * Cases:
 *   completed + fullText → append once (deduped by exact rawText) so
 *     the answer the server finished while we were gone is visible.
 *   failed/interrupted  → drop the pointer; the in-place error affordance
 *     from the original tab (or streamingText recovery) owns the UX.
 *   open                → open a live bubble and tail events from lastSeq.
 * All paths are best-effort and session-scoped: if the user switches
 * sessions mid-tail the subscription aborts and the bubble's
 * stillOwnsSlot guard keeps the writes inert. */
export async function reattachPendingTurn(sessionId){
  var pending=null;
  try{ pending=loadPendingTurn(sessionId); }catch(_){ return; }
  if(!pending||(!pending.turnId && !pending.clientTurnId))return;
  var snapshot=null;
  try{
    if(pending.turnId){
      snapshot=await getChatTurn(pending.turnId);
    }else if(pending.clientTurnId){
      var resTurn=await createChatTurn({ clientTurnId: pending.clientTurnId, sessionId: sessionId });
      if(resTurn && resTurn.turn && resTurn.turn.id){
        pending.turnId=resTurn.turn.id;
        savePendingTurn(sessionId, { turnId: pending.turnId, clientTurnId: pending.clientTurnId, lastSeq: 0 });
        snapshot=await getChatTurn(pending.turnId);
      }
    }
  }
  catch(_){ try{clearPendingTurn(sessionId)}catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~1'); } return; }
  if(!snapshot||!snapshot.turn)return;
  var turn=snapshot.turn;
  if(turn.sessionId&&turn.sessionId!==sessionId){ try{clearPendingTurn(sessionId)}catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~2'); } return; }
  if(stateStore.read("currentSessionId")!==sessionId)return;
  if(turn.status==="completed"){
    try{
      var full=turn.fullText||"";
      if(full){
        var msgs=stateStore.read("messages")||[];
        var already=false;
        for(var i=0;i<msgs.length;i++){
          if(msgs[i]&&msgs[i].role==="assistant"&&msgs[i].rawText===full){already=true;break}
        }
        if(!already&&typeof window.addMessage==="function"){
          window.addMessage("assistant",full);
          try{publishReactChatRuntime({type:"state-synced",reason:"pending-turn-completed"});}catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~3'); }
        }
      }
    }catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~4'); }
    try{clearPendingTurn(sessionId)}catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~5'); }
    return;
  }
  if(turn.status==="failed"||turn.status==="interrupted"){
    try{clearPendingTurn(sessionId)}catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~6'); }
    return;
  }
  if(typeof window.addStreamingMessage!=="function")return;
  var ctl=await window.addStreamingMessage({onRetry:function(){
    try{
      var lastUserEntry=null;
      var lastUser=null;
      var list=stateStore.read("messages")||[];
      for(var ui=list.length-1;ui>=0;ui--){
        if(list[ui]&&list[ui].role==="user"){
          lastUserEntry=list[ui];
          lastUser=lastUserEntry.rawText||null;
          break;
        }
      }
      if(lastUser&&typeof window.askChatTurn==="function"){
        /* Same slicing hazard as the recovered-stream retry above: carry
           the stored multimodal parts through the replay. */
        var lastUserParts=null;
        try{lastUserParts=buildUserContentParts(lastUser,lastUserEntry&&lastUserEntry.attachments);}catch(_){lastUserParts=null;}
        quietTurn(window.askChatTurn(lastUser,lastUserParts));
      }
    }catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~7'); }
  }});
  var subAbort=new AbortController();
  var maxSeq=Number(pending.lastSeq)||0;
  function applyFrame(frame){
    if(!frame||stateStore.read("currentSessionId")!==sessionId){
      try{subAbort.abort("session-switch")}catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~8'); }
      return;
    }
    try{
      var data=frame.data||{};
      if(frame.event==="content"&&typeof data.delta==="string")ctl.append(data.delta);
      else if(frame.event==="reasoning"&&typeof data.delta==="string")ctl.appendThinking(data.delta);
      else if(frame.event==="tool_use"){
        var _calls=Array.isArray(data)?data:(data.calls||[data]);
        for(var ci=0;ci<_calls.length;ci++){ try{ctl.recordToolUse(_calls[ci])}catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~9'); } }
      }
      else if(frame.event==="tool_result")ctl.recordToolResult(data);
      else if(frame.event==="tool_approval"&&typeof ctl.recordToolApproval==="function")ctl.recordToolApproval(data);
      else if(frame.event==="tool_progress"&&ctl.recordToolProgress)ctl.recordToolProgress(data);
      else if(frame.event==="execution_start"&&ctl.recordExecutionStart)ctl.recordExecutionStart(data);
      else if(frame.event==="agent_step"&&typeof ctl.recordAgentStep==="function")ctl.recordAgentStep(data);
      else if(frame.event==="agent_plan"&&typeof ctl.recordAgentPlan==="function")ctl.recordAgentPlan(data);
      else if(frame.event==="turn_done"){ ctl.finish(); try{clearPendingTurn(sessionId)}catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~10'); } try{subAbort.abort("done")}catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~11'); } return; }
      else if(frame.event==="turn_failed"){
        try{
          if(turn.fullText||ctl)ctl.finish();
        }catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~12'); }
        try{clearPendingTurn(sessionId)}catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~13'); }
        try{subAbort.abort("done")}catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~14'); }
        return;
      }
      if(typeof frame.sequence==="number"&&frame.sequence>maxSeq){
        maxSeq=frame.sequence;
        try{bumpPendingSeq(sessionId,maxSeq)}catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~15'); }
      }
    }catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~16'); }
  }
  try{
    var replay=(snapshot.events||[]);
    for(var r=0;r<replay.length;r++)applyFrame(replay[r]);
    if(stateStore.read("currentSessionId")!==sessionId){try{subAbort.abort("session-switch")}catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~17'); }return}
    await subscribeChatTurnEvents(pending.turnId,maxSeq,subAbort.signal,{
      onEvent:applyFrame,
      onError:function(){},
    });
  }catch (error) {reportSwallow(error, 'session/pendingTurnRestore.reattachPendingTurn~18'); }
}
