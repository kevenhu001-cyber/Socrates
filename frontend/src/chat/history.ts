import { loadLocalMemory } from '../storage/localMemory.ts';
import { attachmentPointerLine, activeProviderSupportsImages } from '../attachments.js';

type HistoryRole = 'system' | 'user' | 'assistant';
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface StoredAttachment {
  kind?: string;
  dataUrl?: string;
  fileId?: string;
  text?: string;
  docKind?: string;
  name?: string;
}

interface StoredMessage {
  role?: string;
  rawText?: unknown;
  content?: unknown;
  attachments?: unknown;
  reasoningContent?: unknown;
}

export interface HistoryEntry {
  role: HistoryRole;
  content: string | ContentPart[];
  reasoning_content?: unknown;
}

const HISTORY_MAX_TURNS=30;      /* user+assistant pairs to keep (increased for longer context) */
const HISTORY_MAX_CHARS=2000;    /* per-message truncation ceiling (increased from 500) */

/* Compress a list of message texts into a short summary for when
   the conversation is longer than HISTORY_MAX_TURNS. Drops oldest
   messages but captures their key topics in a condensed form. */
function compressMessages(msgs: readonly StoredMessage[] | null | undefined): string{
  if(!msgs||!msgs.length)return"";
  const parts: string[]=[];
  for(let ci=0;ci<msgs.length;ci++){
    let ct=String(msgs[ci].rawText||msgs[ci].content||"").trim();
    if(!ct)continue;
    /* Take first 120 chars of each older message as a keyphrase. */
    if(ct.length>120)ct=ct.slice(0,117)+"…";
    parts.push(ct);
  }
  if(!parts.length)return"";
  return"[Earlier conversation: "+parts.join(" | ")+"]";
}

function isTextAttachment(att: StoredAttachment | null | undefined): boolean{
  if(!att)return false;
  return att.kind==="text"||att.kind==="document"||att.kind==="pdf";
}

function hasUsableAttachmentContent(att: StoredAttachment | null | undefined): boolean{
  return Boolean(att&&(
    (att.kind==="image"&&att.dataUrl)
    ||att.fileId
    ||(isTextAttachment(att)&&att.text)
  ));
}

function truncateHistoryText(text: string,truncate: boolean): string{
  return truncate&&text.length>HISTORY_MAX_CHARS?text.slice(0,HISTORY_MAX_CHARS)+"…":text;
}

function appendMultimodalImage(parts: ContentPart[],att: StoredAttachment,multimodal: boolean): void{
  if(att.kind!=="image"||!att.dataUrl||!multimodal)return;
  /* `detail` is omitted on purpose — MiniMax 400s on "auto"; the
     backend transform strips the field anyway (helpers.ts). */
  parts.push({type:"image_url",image_url:{url:att.dataUrl}});
}

function appendFilePointer(parts: ContentPart[],att: StoredAttachment): boolean{
  if(att.fileId){
    parts.push({type:"text",text:attachmentPointerLine(att)});
    return true;
  }
  return false;
}

function appendParsedText(parts: ContentPart[],att: StoredAttachment,truncate: boolean): boolean{
  if(isTextAttachment(att)&&att.text){
    const attTxt=truncateHistoryText(att.text,truncate);
    const label=att.docKind
      ?"[Parsed "+String(att.docKind).toUpperCase()+": "+(att.name||"file")+"]"
      :(att.kind==="pdf"?"[Parsed PDF: "+(att.name||"document")+"]":"[Parsed file: "+(att.name||"file")+"]");
    parts.push({type:"text",text:label+"\n"+attTxt});
    return true;
  }
  return false;
}

function appendUnviewableImage(parts: ContentPart[],att: StoredAttachment,multimodal: boolean): void{
  if(att.kind==="image"&&att.dataUrl&&!multimodal){
    /* Persisted inline image on a text-only provider with no fileId:
       the model cannot see it — say so instead of dropping silently. */
    parts.push({type:"text",text:"[User attached an image \""+(att.name||"image")+"\" that this model cannot view inline.]"});
  }
}

function appendStoredAttachmentParts(parts: ContentPart[],att: StoredAttachment | null | undefined,multimodal: boolean,truncate: boolean): void{
  if(!att)return;
  appendMultimodalImage(parts,att,multimodal);
  if(appendFilePointer(parts,att)||appendParsedText(parts,att,truncate))return;
  appendUnviewableImage(parts,att,multimodal);
}

/* P_file-attachments — rebuild a content-parts array from a user
   message's stored attachments so a resend / regenerate / history turn
   carries the file to the model:
     - images → native image_url parts, but ONLY when the active
       provider is multimodal (text-only providers get the pointer and
       read the file through read_attachment — no more upstream 400s).
     - fileId references → [Attached file: …] pointer lines.
     - legacy inline rows (text/dataUrl, no fileId) → the old
       [Parsed …] text parts so nothing degrades silently.
   Returns the parts array when the message has usable attachment
   content, or null when it's text-only (callers then send the plain
   string). */
function partsForStoredAttachments(
  rawText: unknown,
  attachments: unknown,
  opts: { truncate?: boolean } | null = {},
): ContentPart[] | null{
  const truncate=Boolean(opts?.truncate);
  if(!Array.isArray(attachments)||!attachments.length)return null;
  const multimodal=Boolean(activeProviderSupportsImages());
  /* Any inline image counts — multimodal providers get the image_url part,
     text-only ones get the "cannot view" note. */
  const storedAttachments=attachments as Array<StoredAttachment | null | undefined>;
  if(!storedAttachments.some(hasUsableAttachmentContent))return null;
  const text=String(rawText||"").trim();
  const parts: ContentPart[]=[];
  if(text)parts.push({type:"text",text:truncateHistoryText(text,truncate)});
  for(const attachment of storedAttachments)appendStoredAttachmentParts(parts,attachment,multimodal,truncate);
  return parts.length?parts:null;
}

/* P0.1 BUG-P01-03 — rebuild a multimodal content parts array from a
   user message's stored attachments so an edit-and-resend (or a
   regenerate) carries the original image / PDF / text to the model
   instead of degrading to plain text. Mirrors the reconstruction inside
   extractHistory() below. Returns the parts array when the message has
   usable multimodal attachments, or null when it's text-only (callers
   then send the plain string). Unlike the history path this does NOT
   truncate — it is the CURRENT turn's content, not compressed context. */
export function buildUserContentParts(rawText: unknown, attachments: unknown): ContentPart[] | null{
  return partsForStoredAttachments(rawText,attachments,{truncate:false});
}

function summaryPrefix(messages: readonly StoredMessage[]): HistoryEntry[]{
  const maxMessages=HISTORY_MAX_TURNS*2;
  if(messages.length<=maxMessages)return[];
  const summary=compressMessages(messages.slice(0,messages.length-maxMessages));
  return summary
    ?[{role:"system",content:"[Conversation summary of earlier messages]: "+summary}]
    :[];
}

function cleanTurnText(value: unknown): string{
  return String(value||"").replace(/^Thinking\.\.\.\s*/i,"").replace(/^Thinking\s*/i,"").trim();
}

function historyMessageFromStore(message: StoredMessage | null | undefined): HistoryEntry | null{
  if(!message)return null;
  const attachments=message.role==="user"&&Array.isArray(message.attachments)&&message.attachments.length
    ?message.attachments as Array<StoredAttachment | null | undefined>
    :[];
  if(!message.rawText&&!attachments.length)return null;

  let text=cleanTurnText(message.rawText);
  /* Reasoning can also be embedded inline in older assistant snapshots.
     Its canonical value stays in reasoningContent below. */
  if(message.role==="assistant"||message.role==="system"){
    text=text.replace(/<think>[\s\S]*?<\/think>/g,"").replace(/<\/?think>/g,"").trim();
  }
  if(!text&&!attachments.length)return null;

  const content=attachments.length
    ?partsForStoredAttachments(text,attachments,{truncate:true})||truncateHistoryText(text,true)
    :truncateHistoryText(text,true);
  const output: HistoryEntry={role:message.role==="user"?"user":"assistant",content};
  if(message.reasoningContent)output.reasoning_content=message.reasoningContent;
  return output;
}

function historyFromStateMessages(messages: unknown): HistoryEntry[] | null{
  if(!Array.isArray(messages)||!messages.length)return null;
  const storedMessages=messages as Array<StoredMessage | null | undefined>;
  const maxMessages=HISTORY_MAX_TURNS*2;
  const out=summaryPrefix(storedMessages as StoredMessage[]);
  for(let i=Math.max(0,storedMessages.length-maxMessages);i<storedMessages.length;i++){
    const message=historyMessageFromStore(storedMessages[i]);
    if(message)out.push(message);
  }
  return out.length?out:null;
}

function historyFromLocalMemory(record: ReturnType<typeof loadLocalMemory>): HistoryEntry[] | null{
  const messages=record&&record.messages;
  if(!messages||!messages.length)return null;
  const maxMessages=HISTORY_MAX_TURNS*2;
  const out=summaryPrefix(messages);
  for(let i=Math.max(0,messages.length-maxMessages);i<messages.length;i++){
    const message=messages[i];
    if(!message||!message.content)continue;
    const text=truncateHistoryText(cleanTurnText(message.content),true);
    if(!text)continue;
    out.push({role:message.role==="user"?"user":"assistant",content:text});
  }
  return out.length?out:null;
}

function historyFromDom(list: HTMLElement | null): HistoryEntry[]{
  if(!list)return[];
  const out: HistoryEntry[]=[];
  const children=list.children;
  for(let i=children.length-1;i>=0&&out.length<HISTORY_MAX_TURNS*2;i--){
    const element=children[i];
    const isUser=element.classList.contains("user");
    if(!isUser&&!element.classList.contains("assistant"))continue;
    const body=element.querySelector<HTMLElement>(".msg-body");
    if(!body)continue;
    let text=(body.innerText||body.textContent||"").trim();
    if(!text)continue;
    /* Strip leaked UI affordances that may have been serialised into history. */
    text=truncateHistoryText(cleanTurnText(text),true);
    out.unshift({role:isUser?"user":"assistant",content:text});
  }
  return out;
}

export function extractHistory(): HistoryEntry[]{
  /* P1.1 — three-tier source-of-truth, preferred in order:
     1. window.stateStore.read("messages").rawText (authoritative, in-memory, never
       re-rendered, never has half-streamed text)
     2. localStorage mirror (good for cross-tab / post-reload)
     3. live DOM (legacy fallback — only used when neither 1 nor 2
       is available, e.g. a session that was loaded from the server
       but the in-memory list hasn't been hydrated yet) */
  const inMemory=historyFromStateMessages(window.stateStore!.read("messages"));
  if(inMemory)return inMemory;
  /* P_context-race — if currentSessionId is null (state was reset
     but no session loaded yet), skip the localStorage fallback.
     _memKey(null) resolves to "socrates-memory-default" which is a
     shared key that may contain stale messages from a previous
     session — reading it would inject wrong history into the LLM
     context ("会话串台"). */
  const sid=window.stateStore!.read("currentSessionId");
  if(!sid)return[];
  const fromStorage=historyFromLocalMemory(loadLocalMemory(sid as string));
  if(fromStorage)return fromStorage;
  return historyFromDom(document.getElementById("msgList"));
}
