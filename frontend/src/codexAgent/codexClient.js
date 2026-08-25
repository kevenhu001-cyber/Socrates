/* codexAgent/codexClient.js — embedded Codex workspace panel.
 *
 * Opens a self-contained overlay that drives the embedded Codex agent
 * runtime through the server bridge (/api/codex/*):
 *
 *   POST /api/codex/threads              → create an isolated thread + workspace
 *   POST /api/codex/threads/:id/turns   → start a turn, stream codex_* SSE events
 *   POST /api/codex/threads/:id/approvals → answer a pending approval
 *   POST /api/codex/threads/:id/interrupt → stop the active turn
 *
 * Streaming is POST-based, so we consume it with apiFetchRaw + ReadableStream
 * (EventSource only supports GET). CSRF/credentials come free from apiFetch*.
 *
 * The panel is deliberately decoupled from the chat send pipeline — the Codex
 * agent has its own file workspace, approval flow and event vocabulary, so it
 * gets a dedicated surface instead of pretending to be a chat bubble.
 *
 * Visual language: reuses the product's HSL design tokens (bg / text /
 * accent / tool-card families) so the panel follows light/dark themes
 * without its own color decisions.
 */

import { apiFetch, apiFetchRaw } from '../util/api.js';
import { formatMsg, formatMsgProgressive } from '../render/markdown.js';
import { esc } from '../render/helpers.js';

/* Same frame splitter as packages/core (kept local so this module stays
   out of the checked TS module graph — it's a stable 10-line pure fn). */
function consumeSseBuffer(buffer, onFrame) {
  let rest = buffer;
  const separator = /\r?\n\r?\n/;
  let match = separator.exec(rest);
  while (match) {
    onFrame(rest.slice(0, match.index));
    rest = rest.slice(match.index + match[0].length);
    match = separator.exec(rest);
  }
  return rest;
}

const STREAM_TIMEOUT_MS = 600000;

/* ── panel-scoped styles (kept local so we never touch styles.css) ── */
const PANEL_CSS = `
.codex-panel{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:24px;background:hsla(var(--bg-400),.5);backdrop-filter:blur(3px)}
.codex-panel[hidden]{display:none}
.codex-card{width:min(880px,100%);height:min(720px,calc(100vh - 48px));display:flex;flex-direction:column;border-radius:18px;box-shadow:0 24px 72px hsla(var(--bg-400),.35);overflow:hidden;background:hsl(var(--bg-000));color:hsl(var(--text-100));border:1px solid hsl(var(--border-300))}
.codex-head{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid hsl(var(--border-300));flex:none}
.codex-head .codex-logo{display:flex;align-items:center;gap:8px;font-weight:650;font-size:15px;letter-spacing:-.01em}
.codex-head .codex-logo svg{color:hsl(var(--accent-000))}
.codex-head .codex-status{display:flex;align-items:center;gap:6px;font-size:12px;color:hsl(var(--text-400));margin-left:auto}
.codex-head .codex-status .dot{width:8px;height:8px;border-radius:50%;background:hsl(var(--text-500));transition:background .2s}
.codex-head .codex-status.running .dot{background:hsl(var(--accent-000));animation:codex-pulse 1.1s infinite}
.codex-head .codex-status.running .status-label::after{content:attr(data-running)}
.codex-head .codex-status .status-label::after{content:attr(data-idle)}
@keyframes codex-pulse{0%,100%{opacity:1}50%{opacity:.3}}
.codex-head .codex-close{margin-left:4px;border:none;background:transparent;cursor:pointer;font-size:20px;line-height:1;color:hsl(var(--text-400));padding:4px 9px;border-radius:9px;transition:background .15s,color .15s}
.codex-head .codex-close:hover{color:hsl(var(--text-100));background:hsl(var(--bg-300))}
.codex-transcript{flex:1;overflow-y:auto;padding:18px 20px;display:flex;flex-direction:column;gap:12px;font-size:14px;line-height:1.62;scroll-behavior:smooth}
.codex-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;height:100%;color:hsl(var(--text-500));text-align:center;padding:0 40px}
.codex-empty .codex-empty-title{font-size:15px;font-weight:600;color:hsl(var(--text-300))}
.codex-empty .codex-empty-sub{font-size:12.5px;max-width:420px;line-height:1.6}
.codex-empty[hidden]{display:none}
.codex-msg{padding:11px 14px;border-radius:14px;max-width:86%;white-space:normal;word-wrap:break-word}
.codex-msg.user{align-self:flex-end;background:hsl(var(--accent-900));color:hsl(var(--text-100));border:1px solid hsl(var(--border-300))}
.codex-msg.assistant{align-self:flex-start;background:hsl(var(--bg-200));border:1px solid hsl(var(--border-300));border-radius:14px;min-width:0}
.codex-msg.assistant .codex-ast-body{min-width:0}
.codex-msg.assistant pre{background:hsl(var(--bg-000));border:1px solid hsl(var(--border-300));padding:10px 12px;border-radius:10px;overflow-x:auto;margin:8px 0}
.codex-msg.assistant code{font-family:var(--font-mono);font-size:12.5px}
.codex-msg.assistant p{margin:0 0 8px}
.codex-msg.assistant p:last-child{margin:0}
.codex-msg.assistant ul,.codex-msg.assistant ol{padding-left:20px;margin:0 0 8px}
.codex-msg.assistant blockquote{border-left:3px solid hsl(var(--accent-000));margin:8px 0;padding-left:12px;color:hsl(var(--text-400))}
.codex-msg.assistant .stream-cursor{display:inline-block;width:7px;height:16px;background:hsl(var(--accent-000));border-radius:2px;vertical-align:-2px;animation:codex-blink .9s infinite;margin-left:2px}
@keyframes codex-blink{0%,100%{opacity:1}50%{opacity:.15}}
.codex-thinking{display:block;align-self:flex-start;max-width:86%;border:1px solid hsl(var(--border-300));border-radius:12px;background:hsl(var(--bg-200));overflow:hidden;font-size:12.5px}
.codex-thinking summary{cursor:pointer;padding:8px 12px;color:hsl(var(--text-400));font-weight:550;list-style:none;display:flex;align-items:center;gap:8px;user-select:none}
.codex-thinking summary::-webkit-details-marker{display:none}
.codex-thinking summary::before{content:"";width:8px;height:8px;border-radius:50%;background:hsl(var(--accent-000));opacity:.9;flex:none}
.codex-thinking[open] summary::before{background:hsl(var(--text-500))}
.codex-thinking .codex-thinking-body{padding:2px 12px 10px;color:hsl(var(--text-400));white-space:pre-wrap;line-height:1.55;max-height:220px;overflow-y:auto;font-family:var(--font-mono)}
.codex-tool{border:1px solid hsl(var(--border-300));border-radius:12px;padding:10px 13px;align-self:stretch;background:hsl(var(--bg-200))}
.codex-tool .codex-tool-head{display:flex;align-items:center;gap:8px;font-weight:600;font-size:12.5px;color:hsl(var(--text-200))}
.codex-tool .codex-tool-head svg{color:hsl(var(--accent-000));flex:none}
.codex-tool .codex-tool-cmd{font-family:var(--font-mono);font-size:12px;margin-top:7px;white-space:pre-wrap;word-break:break-all;color:hsl(var(--text-300))}
.codex-tool .codex-tool-out{font-family:var(--font-mono);font-size:12px;margin-top:7px;white-space:pre-wrap;color:hsl(var(--text-400));max-height:180px;overflow-y:auto;border-top:1px dashed hsl(var(--border-300));padding-top:7px}
.codex-tool .codex-tool-out:empty{display:none}
.codex-approval{border:1px solid hsl(var(--accent-000)/.45);border-radius:12px;padding:12px 14px;align-self:stretch;background:hsl(var(--accent-900))}
.codex-approval .codex-approval-title{font-weight:650;font-size:13.5px;display:flex;align-items:center;gap:8px}
.codex-approval .codex-approval-title svg{color:hsl(var(--accent-000));flex:none}
.codex-approval .codex-approval-body{font-size:12.5px;margin-top:6px;color:hsl(var(--text-300));white-space:pre-wrap;word-break:break-word;line-height:1.55}
.codex-approval .codex-approval-actions{display:flex;gap:8px;margin-top:12px}
.codex-approval button{border:none;border-radius:10px;padding:7px 16px;font-size:13px;cursor:pointer;font-weight:650;transition:opacity .15s,transform .1s}
.codex-approval button:active{transform:scale(.97)}
.codex-approval .approve{background:hsl(var(--accent-000));color:hsl(var(--oncolor-100))}
.codex-approval .decline{background:transparent;color:hsl(var(--text-300));border:1px solid hsl(var(--border-300))}
.codex-approval button:disabled{opacity:.45;cursor:default;transform:none}
.codex-inputbar{display:flex;gap:8px;padding:14px 18px;border-top:1px solid hsl(var(--border-300));flex:none}
.codex-inputbar input{flex:1;border:1px solid hsl(var(--border-300));border-radius:12px;padding:10px 14px;font-size:14px;background:hsl(var(--bg-200));color:hsl(var(--text-100));outline:none;transition:border-color .15s,box-shadow .15s}
.codex-inputbar input::placeholder{color:hsl(var(--text-500))}
.codex-inputbar input:focus{border-color:hsl(var(--accent-000));box-shadow:0 0 0 3px hsl(var(--accent-000)/.15)}
.codex-inputbar button{border:none;border-radius:12px;padding:10px 18px;font-size:14px;cursor:pointer;font-weight:650;transition:opacity .15s}
.codex-send{background:hsl(var(--accent-000));color:hsl(var(--oncolor-100))}
.codex-stop{background:hsl(0 58% 50%);color:hsl(var(--oncolor-100))}
.codex-inputbar button:disabled{opacity:.45;cursor:default}
.codex-error{color:hsl(0 58% 52%);font-size:13px;padding:10px 14px;border-radius:12px;background:hsl(0 58% 50%/.1);border:1px solid hsl(0 58% 50%/.3)}
.codex-run-footer{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:hsl(var(--text-500));background:hsl(var(--bg-200));border:1px solid hsl(var(--border-300));border-radius:999px;padding:4px 12px}
@media (max-width:640px){
  .codex-panel{padding:0}
  .codex-card{width:100%;height:100%;border-radius:0;border:none}
  .codex-msg{max-width:92%}
}
`;

/* The first pass kept the panel visually close to a generic modal. Codex
   reads better as an execution surface: prose stays open, tool activity is
   reduced to quiet rows, and detail only appears when the user asks for it.
   Keep this refinement local to the harness panel so the host app's tokens
   remain the single source of truth for light/dark themes. */
const PANEL_CSS_REFINEMENT = `
.codex-panel{
  padding:20px;
  background:hsl(var(--bg-400)/.72);
  backdrop-filter:blur(12px) saturate(.9);
}
.codex-panel .codex-card{
  width:min(1040px,100%);
  height:min(800px,calc(100vh - 40px));
  border-radius:24px;
  background:hsl(var(--bg-100));
  border:1px solid hsl(var(--border-300)/.42);
  box-shadow:0 28px 100px hsl(var(--bg-400)/.5),0 3px 12px hsl(var(--bg-400)/.22);
}
.codex-panel .codex-head{
  min-height:64px;
  padding:16px 22px;
  gap:12px;
  border-bottom:1px solid hsl(var(--border-300)/.28);
  background:hsl(var(--bg-000)/.58);
}
.codex-panel .codex-logo{
  gap:10px;
  color:hsl(var(--text-100));
  font-size:15px;
  letter-spacing:-.02em;
}
.codex-panel .codex-logo-mark{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:28px;
  height:28px;
  border:1px solid hsl(var(--text-400)/.48);
  border-radius:9px;
  color:hsl(var(--text-300));
  background:hsl(var(--bg-200)/.55);
}
.codex-panel .codex-logo-mark svg{width:17px;height:17px;color:hsl(var(--text-300))!important}
.codex-panel .codex-head-context{
  color:hsl(var(--text-500));
  font-size:12px;
  white-space:nowrap;
}
.codex-panel .codex-status{
  gap:7px;
  padding:5px 9px;
  margin-left:auto;
  border:1px solid hsl(var(--border-300)/.25);
  border-radius:999px;
  background:hsl(var(--bg-200)/.48);
  color:hsl(var(--text-500));
  font-size:11px;
}
.codex-panel .codex-status .dot{width:6px;height:6px}
.codex-panel .codex-status.running{color:hsl(var(--text-300))}
.codex-panel .codex-status.running .dot{box-shadow:0 0 0 3px hsl(var(--accent-000)/.12)}
.codex-panel .codex-close{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:32px;
  height:32px;
  margin-left:2px;
  padding:0;
  border:1px solid transparent;
  border-radius:9px;
  color:hsl(var(--text-400));
  font-size:0;
}
.codex-panel .codex-close svg{width:16px;height:16px}
.codex-panel .codex-close:hover{border-color:hsl(var(--border-300)/.3);background:hsl(var(--bg-300)/.7)}
.codex-panel .codex-transcript{
  gap:22px;
  padding:28px clamp(22px,5vw,58px) 34px;
  font-size:14px;
  line-height:1.68;
  scrollbar-color:hsl(var(--border-300)/.65) transparent;
}
.codex-panel .codex-empty{
  align-items:flex-start;
  justify-content:center;
  max-width:620px;
  margin:0 auto;
  padding:0 18px;
  text-align:left;
}
.codex-panel .codex-empty-title{font-size:17px;color:hsl(var(--text-200));letter-spacing:-.02em}
.codex-panel .codex-empty-sub{max-width:560px;color:hsl(var(--text-500));font-size:13px;line-height:1.7}
.codex-panel .codex-msg{max-width:100%;padding:0;border:0;border-radius:0}
.codex-panel .codex-msg.user{
  align-self:flex-end;
  max-width:min(720px,88%);
  padding:11px 15px;
  border:1px solid hsl(var(--border-300)/.34);
  border-radius:16px 16px 5px 16px;
  background:hsl(var(--bg-300)/.7);
  color:hsl(var(--text-200));
  line-height:1.55;
}
.codex-panel .codex-msg.assistant{background:transparent;color:hsl(var(--text-100))}
.codex-panel .codex-msg.assistant p{margin:0 0 12px}
.codex-panel .codex-msg.assistant p:last-child{margin-bottom:0}
.codex-panel .codex-msg.assistant pre{
  margin:12px 0;
  border-color:hsl(var(--border-300)/.3);
  border-radius:10px;
  background:hsl(var(--bg-200)/.55);
}
.codex-panel .codex-thinking,
.codex-panel .codex-tool{
  align-self:stretch;
  max-width:none;
  border:0;
  border-radius:0;
  background:transparent;
  overflow:visible;
  color:hsl(var(--text-400));
}
.codex-panel .codex-thinking summary,
.codex-panel .codex-tool-head{
  display:grid;
  align-items:center;
  width:100%;
  min-height:27px;
  padding:0;
  gap:10px;
  border-radius:7px;
  background:transparent;
  color:hsl(var(--text-400));
  cursor:pointer;
  list-style:none;
}
.codex-panel .codex-thinking summary::-webkit-details-marker,
.codex-panel .codex-tool-head::-webkit-details-marker{display:none}
.codex-panel .codex-thinking summary::before{display:none!important;content:none}
.codex-panel .codex-thinking summary:hover,
.codex-panel .codex-tool-head:hover,
.codex-panel .codex-thinking[open] summary,
.codex-panel .codex-tool[open] .codex-tool-head{
  color:hsl(var(--text-300));
}
.codex-panel .codex-thinking summary:focus-visible,
.codex-panel .codex-tool-head:focus-visible{
  outline:2px solid hsl(var(--text-400)/.52);
  outline-offset:4px;
}
.codex-panel .codex-thinking summary{grid-template-columns:18px minmax(0,1fr) auto}
.codex-panel .codex-thinking-icon{
  width:17px;
  height:17px;
  border:1.4px solid currentColor;
  border-radius:50%;
  opacity:.82;
}
.codex-panel .codex-thinking-icon::after{
  content:"";
  display:block;
  width:5px;
  height:5px;
  margin:4px auto;
  border-radius:50%;
  background:currentColor;
}
.codex-panel .codex-thinking-body{
  max-height:220px;
  margin:9px 0 0 28px;
  padding:10px 12px;
  border-left:1px solid hsl(var(--border-300)/.42);
  color:hsl(var(--text-500));
  font:12px/1.58 var(--font-mono);
}
.codex-panel .codex-thinking-chev,
.codex-panel .codex-tool-chev{
  width:9px;
  height:9px;
  border:solid currentColor;
  border-width:0 1.4px 1.4px 0;
  transform:rotate(45deg) translateY(-2px);
  transition:transform .16s ease;
}
.codex-panel .codex-thinking[open] .codex-thinking-chev,
.codex-panel .codex-tool[open] .codex-tool-chev{transform:rotate(225deg) translate(-1px,-1px)}
.codex-panel .codex-tool-head{grid-template-columns:19px minmax(0,max-content) minmax(80px,1fr) auto 10px}
.codex-panel .codex-tool-icon{display:inline-flex;align-items:center;justify-content:center;width:19px;height:19px;color:currentColor}
.codex-panel .codex-tool-icon svg{width:18px;height:18px;stroke-width:1.7;color:currentColor!important}
.codex-panel .codex-tool-label{min-width:0;font-size:13.5px;font-weight:500;white-space:nowrap}
.codex-panel .codex-tool-command{
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  color:hsl(var(--text-500));
  font:12px/1.45 var(--font-mono);
}
.codex-panel .codex-tool-status{color:hsl(var(--text-500));font-size:11px;white-space:nowrap}
.codex-panel .codex-tool-detail{
  margin:9px 0 3px 29px;
  padding:0 0 0 17px;
  border-left:1px solid hsl(var(--border-300)/.25);
}
.codex-panel .codex-tool-cmd{
  display:flex;
  flex-wrap:wrap;
  align-items:baseline;
  gap:8px;
  margin:0;
  padding:1px 0 3px;
  border:0;
  border-radius:0;
  background:transparent;
  color:hsl(var(--text-500));
}
.codex-panel .codex-tool-cmd-label{font-size:11px;color:hsl(var(--text-500))}
.codex-panel .codex-tool-cmd code{padding:2px 6px;border-radius:5px;background:hsl(var(--bg-300)/.72);color:hsl(var(--text-300));font:12px/1.5 var(--font-mono);white-space:pre-wrap;word-break:break-word}
.codex-panel .codex-tool-out{
  max-height:190px;
  margin-top:8px;
  padding:8px 10px 0;
  border-top:1px dashed hsl(var(--border-300)/.34);
  color:hsl(var(--text-400));
  font:12px/1.55 var(--font-mono);
}
.codex-panel .codex-tool-out:empty{display:none}
.codex-panel .codex-tool[data-state="error"] .codex-tool-icon,
.codex-panel .codex-tool[data-state="error"] .codex-tool-label{color:hsl(0 58% 68%)}
.codex-panel .codex-approval{
  align-self:stretch;
  max-width:none;
  margin:2px 0;
  padding:10px 0 10px 29px;
  border:0;
  border-left:2px solid hsl(var(--accent-000)/.78);
  border-radius:0;
  background:transparent;
}
.codex-panel .codex-approval-title{gap:9px;color:hsl(var(--text-300));font-size:13px}
.codex-panel .codex-approval-title svg{color:hsl(var(--accent-000))}
.codex-panel .codex-approval-body{margin-top:5px;color:hsl(var(--text-500));font-size:12.5px;line-height:1.55}
.codex-panel .codex-approval-code{display:block;margin-top:8px;padding:8px 10px;border:1px solid hsl(var(--border-300)/.3);border-radius:9px;background:hsl(var(--bg-200)/.52);color:hsl(var(--text-300));font:12px/1.5 var(--font-mono);white-space:pre-wrap;word-break:break-word}
.codex-panel .codex-approval-actions{gap:7px;margin-top:10px}
.codex-panel .codex-approval button{padding:6px 12px;border-radius:8px;font-size:12px}
.codex-panel .codex-approval .decline{border-color:hsl(var(--border-300)/.4)}
.codex-panel .codex-error{align-self:stretch;padding:10px 12px;border:0;border-left:2px solid hsl(0 58% 62%);border-radius:0;background:hsl(0 58% 50%/.09);color:hsl(0 58% 72%);font-size:12.5px}
.codex-panel .codex-run-footer{align-self:stretch;padding:8px 0 0 29px;border:0;border-radius:0;background:transparent;color:hsl(var(--text-500));font-size:11.5px}
.codex-panel .codex-inputbar{
  gap:10px;
  padding:14px 20px 18px;
  border-top:1px solid hsl(var(--border-300)/.28);
  background:hsl(var(--bg-000)/.62);
}
.codex-panel .codex-inputbar input{
  min-width:0;
  height:42px;
  padding:10px 14px;
  border:1px solid hsl(var(--border-300)/.42);
  border-radius:13px;
  background:hsl(var(--bg-200)/.64);
  color:hsl(var(--text-100));
  font-size:13px;
}
.codex-panel .codex-inputbar input:focus{border-color:hsl(var(--text-400)/.65);box-shadow:0 0 0 3px hsl(var(--text-400)/.1)}
.codex-panel .codex-inputbar button{height:42px;min-width:66px;padding:9px 14px;border-radius:13px;font-size:13px}
.codex-panel .codex-send{background:hsl(var(--text-100));color:hsl(var(--bg-400))}
.codex-panel .codex-send:hover{background:hsl(var(--text-200))}
.codex-panel .codex-stop{background:hsl(0 58% 50%);color:hsl(var(--oncolor-100))}
@media(max-width:640px){
  .codex-panel{padding:0}
  .codex-panel .codex-card{height:100%;border:0;border-radius:0}
  .codex-panel .codex-head{padding:13px 16px}
  .codex-panel .codex-head-context{display:none}
  .codex-panel .codex-transcript{gap:19px;padding:22px 17px 28px}
  .codex-panel .codex-tool-head{grid-template-columns:19px minmax(0,1fr) auto 10px}
  .codex-panel .codex-tool-command{grid-column:2 / 4;grid-row:2;margin-top:-5px}
  .codex-panel .codex-tool-status{grid-column:3;grid-row:1}
  .codex-panel .codex-tool-detail{margin-left:24px;padding-left:13px}
  .codex-panel .codex-approval{padding-left:24px}
  .codex-panel .codex-run-footer{padding-left:24px}
  .codex-panel .codex-inputbar{padding:11px 13px calc(13px + env(safe-area-inset-bottom,0px))}
  .codex-panel .codex-inputbar input{height:40px}
  .codex-panel .codex-inputbar button{height:40px;min-width:58px;padding:8px 11px}
}
@media(prefers-reduced-motion:reduce){
  .codex-panel .codex-thinking-chev,.codex-panel .codex-tool-chev{transition:none}
}
`;

const TOOL_ICONS = {
  commandExecution: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  fileChange: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
  webSearch: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  mcpToolCall: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12 2 6"/></svg>',
  default: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
};
const APPROVAL_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/></svg>';

const state = {
  panel: null,
  threadId: null,
  busy: false,
  controller: null,
  statusEl: null,
  statusLabelEl: null,
  transcriptEl: null,
  inputEl: null,
  sendEl: null,
  stopEl: null,
  emptyEl: null,
  assistant: null, // { el, body, full }
  thinking: null,  // { el, body, full }
};

/* ── panel lifecycle ── */

export function openCodexPanel() {
  const panel = ensurePanel();
  panel.hidden = false;
  const input = state.inputEl;
  setTimeout(() => input && input.focus(), 50);
  checkCapabilities();
}

export function closeCodexPanel() {
  if (state.panel) state.panel.hidden = true;
}

function ensurePanel() {
  if (state.panel) return state.panel;
  const style = document.createElement('style');
  style.textContent = PANEL_CSS + PANEL_CSS_REFINEMENT;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.className = 'codex-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Codex agent workspace');
  panel.hidden = true;
  panel.innerHTML = `
    <div class="codex-card" role="document">
      <div class="codex-head">
        <span class="codex-logo">
          <span class="codex-logo-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9l-3 3 3 3"/><path d="M13 15l3-3-3-3"/><rect x="3" y="3" width="18" height="18" rx="4"/></svg></span>
          Codex
        </span>
        <span class="codex-head-context">Agent workspace</span>
        <span class="codex-status">
          <span class="dot"></span>
          <span class="status-label" data-idle="idle" data-running="running"></span>
        </span>
        <button class="codex-close" title="Close" aria-label="Close"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m3.5 3.5 9 9M12.5 3.5l-9 9"/></svg></button>
      </div>
      <div class="codex-transcript" role="log" aria-live="polite">
        <div class="codex-empty">
          <div class="codex-empty-title">Codex agent workspace</div>
          <div class="codex-empty-sub">Tell Codex what to work on. It operates inside its own sandboxed folder — commands and file changes are shown here and require your approval.</div>
        </div>
      </div>
      <div class="codex-inputbar">
        <input type="text" aria-label="Message Codex" placeholder="Tell Codex what to do…" />
        <button class="codex-send" aria-label="Send message">Send</button>
        <button class="codex-stop" hidden>Stop</button>
      </div>
    </div>`;
  document.body.appendChild(panel);

  state.panel = panel;
  state.statusEl = panel.querySelector('.codex-status');
  state.statusLabelEl = panel.querySelector('.status-label');
  state.transcriptEl = panel.querySelector('.codex-transcript');
  state.emptyEl = panel.querySelector('.codex-empty');
  state.inputEl = panel.querySelector('input');
  state.sendEl = panel.querySelector('.codex-send');
  state.stopEl = panel.querySelector('.codex-stop');

  panel.querySelector('.codex-close').addEventListener('click', closeCodexPanel);
  state.sendEl.addEventListener('click', () => onSend());
  state.stopEl.addEventListener('click', () => stopTurn());
  state.inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
  });
  panel.addEventListener('click', (e) => { if (e.target === panel) closeCodexPanel(); });

  return panel;
}

function setStatus(running) {
  if (!state.statusEl) return;
  state.statusEl.classList.toggle('running', running);
}

function hideEmpty() {
  if (state.emptyEl) state.emptyEl.hidden = true;
}

async function checkCapabilities() {
  try {
    const cap = await apiFetch('/api/codex/capabilities');
    if (cap && cap.enabled === false) {
      appendInfo('Codex harness is disabled on this server (CODEX_ENABLED=false).');
    }
  } catch { /* ignore */ }
}

/* ── transcript helpers ── */

function scrollBottom() {
  const el = state.transcriptEl;
  if (el) el.scrollTop = el.scrollHeight;
}

function appendInfo(text) {
  const el = state.transcriptEl;
  if (!el) return;
  hideEmpty();
  const div = document.createElement('div');
  div.className = 'codex-error';
  div.textContent = text;
  el.appendChild(div);
  scrollBottom();
}

function addUserMsg(text) {
  const el = state.transcriptEl;
  if (!el) return;
  hideEmpty();
  const div = document.createElement('div');
  div.className = 'codex-msg user';
  div.textContent = text;
  el.appendChild(div);
  scrollBottom();
}

function appendRunFooter(status, durationMs) {
  const el = state.transcriptEl;
  if (!el) return;
  const div = document.createElement('div');
  div.className = 'codex-run-footer';
  const label = status === 'interrupted' ? 'Interrupted' : status === 'failed' ? 'Failed' : 'Done';
  const dur = durationMs ? ` · ${(durationMs / 1000).toFixed(1)}s` : '';
  div.textContent = `${label}${dur}`;
  el.appendChild(div);
  scrollBottom();
}

function beginAssistant() {
  const el = state.transcriptEl;
  hideEmpty();
  const div = document.createElement('div');
  div.className = 'codex-msg assistant';
  const body = document.createElement('div');
  body.className = 'codex-ast-body';
  div.appendChild(body);
  el.appendChild(div);
  const cursor = document.createElement('span');
  cursor.className = 'stream-cursor';
  body.appendChild(cursor);
  const renderer = {
    full: '',
    append(delta) {
      if (!delta) return;
      renderer.full += delta;
      body.innerHTML = formatMsgProgressive(renderer.full) + cursor.outerHTML;
      scrollBottom();
    },
    finalize() {
      if (!renderer.full) body.innerHTML = '<em>(no text reply)</em>';
      else body.innerHTML = formatMsg(renderer.full);
      scrollBottom();
    },
  };
  state.assistant = renderer;
  return renderer;
}

function beginThinking() {
  if (state.thinking) return state.thinking;
  const el = state.transcriptEl;
  hideEmpty();
  const details = document.createElement('details');
  details.className = 'codex-thinking';
  details.innerHTML = '<summary><span class="codex-thinking-icon" aria-hidden="true"></span><span>Thinking</span><span class="codex-thinking-chev" aria-hidden="true"></span></summary><div class="codex-thinking-body"></div>';
  const body = details.querySelector('.codex-thinking-body');
  // Insert before the latest assistant bubble if present.
  const lastMsg = state.transcriptEl.querySelector('.codex-msg.assistant:last-of-type');
  if (lastMsg) el.insertBefore(details, lastMsg);
  else el.appendChild(details);
  const renderer = {
    full: '',
    append(delta) {
      if (!delta) return;
      renderer.full += delta;
      if (body) body.textContent = renderer.full;
      scrollBottom();
    },
  };
  state.thinking = renderer;
  return renderer;
}

function addToolCard(data) {
  const el = state.transcriptEl;
  if (!el) return;
  hideEmpty();
  const card = document.createElement('details');
  card.className = 'codex-tool';
  const kind = data.type || 'tool';
  const label =
    kind === 'commandExecution' ? 'Command'
    : kind === 'fileChange' ? 'File change'
    : kind === 'mcpToolCall' ? (data.name || 'MCP tool')
    : kind === 'webSearch' ? 'Web search'
    : 'Tool';
  const icon = TOOL_ICONS[kind] || TOOL_ICONS.default;
  const cmd = data.command || (data.changes ? JSON.stringify(data.changes).slice(0, 400) : '');
  const status = data.status === 'completed' || data.status === 'complete' ? 'Done' : 'Running';
  if (data.itemId != null) card.dataset.itemId = String(data.itemId);
  card.dataset.state = data.status === 'failed' || data.status === 'error' ? 'error' : 'running';
  card.open = true;
  card.innerHTML = `
    <summary class="codex-tool-head">
      <span class="codex-tool-icon" aria-hidden="true">${icon}</span>
      <span class="codex-tool-label">${esc(label)}</span>
      <span class="codex-tool-command">${esc(cmd)}</span>
      <span class="codex-tool-status" role="status" aria-live="polite">${status}</span>
      <span class="codex-tool-chev" aria-hidden="true"></span>
    </summary>
    <div class="codex-tool-detail">
      ${cmd ? `<div class="codex-tool-cmd"><span class="codex-tool-cmd-label">Command</span><code>${esc(cmd)}</code></div>` : ''}
      <pre class="codex-tool-out"></pre>
    </div>`;
  el.appendChild(card);
  card._outEl = card.querySelector('.codex-tool-out');
  card._statusEl = card.querySelector('.codex-tool-status');
  scrollBottom();
  return card;
}

function addApprovalCard(data) {
  const el = state.transcriptEl;
  if (!el) return;
  hideEmpty();
  const card = document.createElement('div');
  card.className = 'codex-approval';
  const kindLabel = data.kind === 'commandExecution' ? 'Approve command?' : 'Approve file change?';
  const bodyText = data.reason || data.command || 'The agent is requesting permission to proceed.';
  card.innerHTML = `
    <div class="codex-approval-title">${APPROVAL_ICON}${esc(kindLabel)}</div>
    <div class="codex-approval-body">${esc(bodyText)}</div>
    ${data.command ? `<code class="codex-approval-code">${esc(data.command)}</code>` : ''}
    <div class="codex-approval-actions">
      <button class="approve">Accept</button>
      <button class="decline">Decline</button>
    </div>`;
  el.appendChild(card);
  const buttons = card.querySelectorAll('button');
  const disable = () => buttons.forEach((b) => { b.disabled = true; });
  const note = (text) => {
    const body = card.querySelector('.codex-approval-body');
    if (body) body.textContent += '\n→ ' + text;
  };
  buttons[0].addEventListener('click', async () => {
    disable();
    await answerApproval(data.requestId, 'accept');
    note('accepted');
  });
  buttons[1].addEventListener('click', async () => {
    disable();
    await answerApproval(data.requestId, 'decline');
    note('declined');
  });
  scrollBottom();
  return card;
}

/* ── actions ── */

async function onSend() {
  const text = (state.inputEl.value || '').trim();
  if (!text || state.busy) return;
  state.inputEl.value = '';
  await startTurn(text);
}

async function startTurn(text) {
  state.busy = true;
  setStatus(true);
  state.sendEl.disabled = true;
  state.stopEl.hidden = false;
  addUserMsg(text);

  const controller = new AbortController();
  state.controller = controller;
  try {
    if (!state.threadId) {
      const created = await apiFetch('/api/codex/threads', { method: 'POST', body: {} });
      state.threadId = created.threadId;
    }

    const assistant = beginAssistant();
    let sawCompletion = false;
    const resp = await apiFetchRaw(`/api/codex/threads/${state.threadId}/turns`, {
      method: 'POST',
      body: { input: text },
      signal: controller.signal,
      timeoutMs: STREAM_TIMEOUT_MS,
    });

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = consumeSseBuffer(buffer + decoder.decode(value, { stream: true }), (frame) => {
        const { event, data } = parseFrame(frame);
        if (data == null) return;
        let payload = data;
        try { payload = JSON.parse(data); } catch { /* keep string */ }
        if (event === 'codex_turn_completed') sawCompletion = true;
        handleEvent(event, payload, assistant);
      });
    }
    if (!sawCompletion) assistant.finalize();
  } catch (err) {
    if (err && err.name === 'AbortError') {
      // user pressed stop; nothing to render
    } else {
      appendInfo((err && err.message) || 'Codex request failed');
      if (state.assistant) state.assistant.finalize();
    }
  } finally {
    state.busy = false;
    state.controller = null;
    setStatus(false);
    state.sendEl.disabled = false;
    state.stopEl.hidden = true;
  }
}

function findCodexTool(itemId) {
  const cards = state.transcriptEl ? Array.from(state.transcriptEl.querySelectorAll('.codex-tool')) : [];
  if (itemId != null) {
    const match = cards.find((card) => card.dataset.itemId === String(itemId));
    if (match) return match;
  }
  return cards[cards.length - 1] || null;
}

function settleCodexTools(status) {
  if (!state.transcriptEl) return;
  const interrupted = status === 'interrupted';
  state.transcriptEl.querySelectorAll('.codex-tool').forEach((card) => {
    if (card.dataset.state === 'error') return;
    card.dataset.state = status === 'failed' ? 'error' : interrupted ? 'stopped' : 'done';
    const statusEl = card._statusEl || card.querySelector('.codex-tool-status');
    if (statusEl) statusEl.textContent = status === 'failed' ? 'Failed' : interrupted ? 'Stopped' : 'Done';
  });
}

function handleEvent(event, payload, assistant) {
  switch (event) {
    case 'codex_delta':
      assistant.append(payload.delta || '');
      break;
    case 'codex_reasoning':
      beginThinking().append(payload.delta || '');
      break;
    case 'codex_tool':
      addToolCard(payload);
      break;
    case 'codex_tool_output': {
      const last = findCodexTool(payload.itemId);
      if (last && last._outEl) last._outEl.textContent += payload.delta || '';
      if (last && last._statusEl) last._statusEl.textContent = 'Output';
      break;
    }
    case 'codex_approval':
      addApprovalCard(payload);
      break;
    case 'codex_turn_completed': {
      assistant.finalize();
      settleCodexTools(payload.status === 'failed' ? 'failed' : payload.status === 'interrupted' ? 'interrupted' : 'completed');
      appendRunFooter(payload.status, payload.error ? 0 : undefined);
      break;
    }
    case 'codex_error':
      settleCodexTools('failed');
      appendInfo(payload.message || 'Codex stream error');
      assistant.finalize();
      break;
    default:
      break;
  }
}

function parseFrame(frame) {
  let event = 'message';
  const data = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  if (!data.length) return { event, data: null };
  return { event, data: data.join('\n') };
}

async function answerApproval(requestId, decision) {
  if (!state.threadId || requestId == null) return;
  try {
    await apiFetch(`/api/codex/threads/${state.threadId}/approvals`, {
      method: 'POST',
      body: { requestId, decision },
    });
  } catch { /* surface later via stream */ }
}

async function stopTurn() {
  if (state.controller) {
    try { state.controller.abort(); } catch { /* ignore */ }
  }
  if (state.threadId) {
    try {
      await apiFetch(`/api/codex/threads/${state.threadId}/interrupt`, { method: 'POST', body: {} });
    } catch { /* ignore */ }
  }
}

export function toggleCodexPanel() {
  if (state.panel && !state.panel.hidden) closeCodexPanel();
  else openCodexPanel();
}
