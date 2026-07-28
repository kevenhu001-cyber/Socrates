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
    var label=document.createElement("span");
    label.className="thinking-status-label shimmer-text";
    label.textContent=(typeof window.t==="function")?window.t("think.thinking"):"Thinking…";
    status.appendChild(label);
    body.appendChild(status);
  }
  if(typeof window.scrollMainToBottom==="function")window.scrollMainToBottom();
  function remove(){if(status&&status.parentNode)status.parentNode.removeChild(status)}
  function setLabel(text,state){
    if(!status||!status.parentNode)return;
    var lbl=status.querySelector(".thinking-status-label");
    if(!lbl)return;
    lbl.textContent=String(text||"");
    status.dataset.mode="tool";
    /* state: "" (running, text shimmers) | "done" | "error". Settled
       states drop the shimmer so the pill reads as a result line
       ("Found 8 web results") rather than an ongoing activity. */
    if(state){status.dataset.state=state;lbl.classList.remove("shimmer-text");}
    else{delete status.dataset.state;lbl.classList.add("shimmer-text");}
    if(typeof window.scrollMainToBottom==="function")window.scrollMainToBottom();
  }
  return {append:function(){},finalize:remove,remove:remove,setLabel:setLabel};
}

/* Standalone helper that mounts (or reuses) the status pill in the
   current assistant bubble and rewrites its label. The argument may
   be a raw string or an i18n key (labelForTool returns a key). When
   a key is given, we resolve it through window.t() so the pill reads
   in the user's current language. Use this from the chat stream when
   a tool_use event lands AFTER the pill was already hidden by
   append()'s first-delta finalize — the pill might be gone from the
   DOM at this point, so the controller's local setLabel() would
   silently no-op. showLabel() always makes sure the user sees the
   new label. */
export function showLabel(textOrKey,state){
  var label = String(textOrKey || "");
  if(label && typeof window !== "undefined" && typeof window.t === "function"){
    var resolved = window.t(label);
    if(resolved && resolved !== label) label = resolved;
  }
  var ctl = appendThinking("");
  if(!ctl||typeof ctl.setLabel!=="function")return;
  ctl.setLabel(label,state||"");
}

/* Map a tool name to a short user-facing status key (i18n). Kept here
   so the live chat path and any other consumer share one source of
   truth. showLabel() resolves the key through window.t() so the
   label reads in the user's current language; consumers that just
   want the English fallback can use the key directly. */
export function labelForTool(name){
  switch(name){
    case "web_search":        return "tool.actionSearch";
    case "arxiv_search":      return "tool.actionSearch";
    case "zotero_search":     return "tool.actionSearch";
    case "notion_search_pages":return "tool.actionSearch";
    case "github_list_repos": return "tool.actionSearch";
    case "gitee_list_repos":  return "tool.actionSearch";
    case "code_interpreter":  return "tool.actionAnalyze";
    case "Code":              return "tool.actionAnalyze";
    case "render_visualization":return "tool.actionVisual";
    case "Read":
    case "Glob":
    case "Grep":
    case "WebFetch":          return "tool.actionRead";
    case "Write":
    case "Edit":
    case "Bash":              return "tool.actionWrite";
    default:                  return "tool.actionDefault";
  }
}

/* True for tools whose UX is "a web/library search" — they share the
   same searching / found-N / failed status copy. Mirrors the
   tool.actionSearch cases in labelForTool above. */
export function isSearchTool(name){
  switch(name){
    case "web_search":
    case "arxiv_search":
    case "zotero_search":
    case "notion_search_pages":
    case "github_list_repos":
    case "gitee_list_repos":
      return true;
    default:
      return false;
  }
}

/* Map a tool_result to a short completion label (resolved text, not a
   key — the count substitution has to happen here). Returns "" when
   the tool has no meaningful completion status (e.g. code runs show
   their own output), so callers can skip the pill update. The label
   is transient by design: the next answer delta removes the pill,
   exactly like ChatGPT's "Searched the web · N results" line. */
export function labelForToolResult(name,result){
  if(!isSearchTool(name))return "";
  var t=(typeof window!=="undefined"&&typeof window.t==="function")?window.t:function(k){return k};
  function resolve(key,fallback){
    var s=t(key);
    return (s&&s!==key)?s:fallback;
  }
  if(result&&result.ok===false){
    return resolve("tool.searchFailed","Web search failed");
  }
  var n=result&&Array.isArray(result.results)?result.results.length:0;
  if(n>0){
    return resolve("tool.searchDone","Found {n} web results").replace("{n}",String(n));
  }
  return resolve("tool.searchEmpty","No web results found");
}