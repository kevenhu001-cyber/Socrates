/* User-facing thinking status.
 *
 * Reasoning tokens stay in the session state so compatible providers can
 * continue a conversation correctly. They are deliberately never rendered
 * into the chat UI. */

/* Retained for stream compatibility. Some providers echo prompt directives
   into a reasoning channel; callers can still identify those fragments. */
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
   reasoning text while finalize() removes the status before the answer.
   setLabel() rewrites the visible label so tool events (searching /
   coding / data-processing) can announce themselves in place of
   "Thinking…". */
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
    label.className="thinking-status-label";
    label.textContent=(typeof window.t==="function")?window.t("think.thinking"):"Thinking…";
    status.appendChild(ring);
    status.appendChild(label);
    body.appendChild(status);
  }
  if(typeof window.scrollMainToBottom==="function")window.scrollMainToBottom();
  function remove(){if(status&&status.parentNode)status.parentNode.removeChild(status)}
  function setLabel(text){
    if(!status||!status.parentNode)return;
    var lbl=status.querySelector(".thinking-status-label");
    if(!lbl)return;
    lbl.textContent=String(text||"");
    status.dataset.mode="tool";
    if(typeof window.scrollMainToBottom==="function")window.scrollMainToBottom();
  }
  return {append:function(){},finalize:remove,remove:remove,setLabel:setLabel};
}

/* Map a tool name to a short user-facing status string. Kept here so
   the live chat path and any other consumer share one source of
   truth. The label is intentionally generic ("Searching" / "Coding"
   / "Data Processing") — it tells the user what the model is doing,
   without leaking tool internals the user used to see in the old
   tool-card UI. */
export function labelForTool(name){
  switch(name){
    case "web_search":        return "Searching";
    case "arxiv_search":      return "Searching";
    case "zotero_search":     return "Searching";
    case "notion_search_pages":return "Searching";
    case "github_list_repos": return "Searching";
    case "gitee_list_repos":  return "Searching";
    case "code_interpreter":  return "Coding";
    case "Code":              return "Coding";
    case "render_visualization":return "Building a visual";
    case "Read":
    case "Glob":
    case "Grep":
    case "WebFetch":          return "Reading files";
    case "Write":
    case "Edit":
    case "Bash":              return "Updating files";
    default:                  return "Working";
  }
}