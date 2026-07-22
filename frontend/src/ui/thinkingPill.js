/* User-facing thinking status.
 *
 * Reasoning tokens stay in the session state so compatible providers can
 * continue a conversation correctly. They are deliberately never rendered
 * into the chat UI. */

/* Retained for stream compatibility. Some providers echo prompt directives
 * into a reasoning channel; callers can still identify those fragments. */
export function looksLikeMetaInstruction(s){
  if(!s)return false;
  var t=String(s).toLowerCase();
  var phrases=[
    "do not output", "reply directly with", "chain-of-thought",
    "internal reasoning", "step-by-step scratch work",
    "exposing step-by-step", "rendered as a collapsible section"
  ];
  for(var i=0;i<phrases.length;i++)if(t.indexOf(phrases[i])>=0)return true;
  return false;
}

/* Display a transient status only. append() intentionally discards the
 * reasoning text while finalize() removes the status before the answer. */
export function appendThinking(){
  var list=document.getElementById("msgList");
  if(!list)return null;
  var last=list.lastElementChild;
  var body=last&&last.classList.contains("assistant")?last.querySelector(".msg-body"):null;
  if(!body){
    var div=document.createElement("div");
    div.className="msg assistant";
    body=document.createElement("div");
    body.className="msg-body";
    div.appendChild(body);
    list.appendChild(div);
  }
  var status=body.querySelector(".thinking-status");
  if(!status){
    status=document.createElement("span");
    status.className="thinking-status";
    status.setAttribute("role","status");
    status.setAttribute("aria-live","polite");
    var ring=document.createElement("span");
    ring.className="thinking-ring thinking-ring-sm";
    ring.setAttribute("aria-hidden","true");
    var label=document.createElement("span");
    label.textContent=(typeof window.t==="function")?window.t("think.thinking"):"Thinking…";
    status.appendChild(ring);
    status.appendChild(label);
    body.appendChild(status);
  }
  if(typeof window.scrollMainToBottom==="function")window.scrollMainToBottom();
  function remove(){if(status&&status.parentNode)status.parentNode.removeChild(status)}
  return {append:function(){},finalize:remove,remove:remove};
}
