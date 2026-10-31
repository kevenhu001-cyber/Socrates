import { apiFetch } from '../util/api.ts';
import { linkAbortSignal } from '../util/api/request.ts';

export const CHAT_PAGE_CONTEXT_TIMEOUT_MS = 2500;
// Research workflows allow the server's existing eight-second page timeout.
const PAGE_CONTEXT_TIMEOUT_MS = 10_000;
const FILE_EXTENSIONS = new Set(("pdf doc docx xls xlsx ppt pptx zip rar 7z tar gz " +
  "jpg jpeg png gif webp svg mp3 mp4 mov avi mkv exe dmg iso " +
  "txt md rtf csv json xml html htm").split(" "));

function isValidBareUrl(domain: string | undefined): boolean {
  if (!domain || domain.indexOf('.') === -1) return false;
  const host = domain.split('/')[0];
  const tld = host.slice(host.lastIndexOf('.') + 1);
  if (!/^[a-z]{2,}$/i.test(tld) || /^\d+(\.\d+)+$/.test(domain)) return false;
  const hasPath = domain.indexOf('/') !== -1;
  const hasWww = /^www\./i.test(domain);
  return hasPath || hasWww || !FILE_EXTENSIONS.has(tld.toLowerCase());
}

/* Heuristic: returns true if the user's text seems to refer to a
   website but we couldn't pull a usable URL out of it. We look for
   words like "网站"、"网址"、"网页"、"site"、"homepage", or for
   "看看/visit/check/打开" near a domain-shaped word. Conservative
   enough to avoid false positives in pure conceptual Q&A. */
export function looksLikeUserMentionedSite(text: string): boolean {
  if(!text)return false;
  if(/网站|网址|网页|主页|站点|官网|链接|URL|url|site|website|homepage/i.test(text))return true;
  if(/\b(visit|open|check|go to|browse|look at|see|read|fetch)\b/i.test(text)
     && /\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(text))return true;
  /* "看看 xxx" / "看一下 xxx" / "了解下 xxx" style — but only if there's
     a domain-shaped token in the sentence. */
  if(/(看看|看一下|了解下|了解|查阅|访问|打开|浏览|读一读|读一下)/.test(text)
     && /\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(text))return true;
  return false;
}

/* Extract URLs from a free-form text. Returns at most 3 URLs, deduped,
   in first-seen order. Strips trailing punctuation that commonly rides
   in (Chinese full-width parens, periods, commas).

   Two flavors of "URL" are accepted:
     1. Anything that already starts with http:// or https://
     2. Bare domains like example.com, www.foo.bar, sub.example.co.uk
        and the same followed by an obvious path. We prepend https://.

   Conservative rules: we only auto-promote a bare domain if it contains
   at least one dot and the TLD looks plausible (≥ 2 alpha chars). This
   avoids grabbing every word like "github" in prose. */
export function extractHttpUrls(text: string): string[] {
  if(!text)return[];
  const seen = Object.create(null) as Record<string, number>;
  const out: string[] = [];

  function add(u: string | undefined): void {
    if(!u)return;
    /* Strip common trailing punctuation. */
    u=u.replace(/[.,;:!?\]）】」』)]+$/,"");
    /* Drop anchor-only fragments the user didn't intend to send. */
    if(!u||u==="#")return;
    if(seen[u])return;
    seen[u]=1;
    out.push(u);
  }

  /* (1) http(s)://... */
  const re1=/https?:\/\/[^\s一-鿿\u3000-〿＀-￯"'<>)\]】」』]+/gi;
  let m: RegExpExecArray | null;
  while((m=re1.exec(text))!==null){
    add(m[0]);
    if(out.length>=3)break;
  }
  if(out.length>=3)return out;

  /* (2) Bare domains / domain+path. We anchor on a word boundary,
     require at least one dot, and only accept character classes that
     are valid in a URL host or path. We allow an optional path/query
     so things like "example.com/about" or "news.ycombinator.com/item?id=1"
     are picked up. */
  const re2=/(?:^|[^\w一-鿿＠@])([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[^\s一-鿿\u3000-〿＀-￯"'<>)\]】」』]*)?)/gi;
  while((m=re2.exec(text))!==null){
    const d = m[1];
    if (!isValidBareUrl(d)) continue;
    add("https://"+d);
    if(out.length>=3)break;
  }
  return out;
}

/* Fetch up to 3 pages in parallel and format them as [Referenced page]
   blocks. Returns {blocks, results} so the caller can also render
   link-preview cards in the user bubble. Failures degrade to a small
   error line per page so the assistant can still acknowledge the link
   in its answer. */
/** One entry of the /api/fetch-batch response. */
export interface FetchedPage {
  ok: boolean;
  title?: string;
  truncated?: boolean;
  content?: string;
  reason?: string;
}
export interface ReferencedPageBlocks {
  blocks: string[];
  results: FetchedPage[];
}

function formatReferencedPage(url: string, page: FetchedPage | undefined): string {
  if (page && page.ok && page.content) {
    return '[Referenced page] ' + url + '\n'
      + (page.title ? 'Title: ' + page.title + '\n' : '')
      + (page.truncated ? '(truncated excerpt)\n' : '')
      + page.content;
  }
  const reason = (page && page.reason) || 'fetch failed';
  return '[Referenced page] ' + url + '\n(could not retrieve: ' + reason + ')';
}

function formatReferencedPages(urls: string[], results: FetchedPage[]): string[] {
  const blocks: string[] = [];
  for (let index = 0; index < urls.length; index++) {
    blocks.push(formatReferencedPage(urls[index], results[index]));
  }
  return blocks;
}

function failedPageContext(urls: string[], error: unknown): ReferencedPageBlocks {
  const message = (error as { message?: string })?.message || String(error);
  return {
    blocks: urls.map((url) => '[Referenced page] ' + url + '\n(could not retrieve: ' + message + ')'),
    results: urls.map(() => ({ ok: false, reason: message })),
  };
}

export async function fetchPagesForContext(
  urls: string[],
  options: { signal?: AbortSignal | null; timeoutMs?: number } = {},
): Promise<ReferencedPageBlocks> {
  if(!Array.isArray(urls)||!urls.length)return{blocks:[],results:[]};
  const linked = linkAbortSignal(options.signal, 'chat.webLinks');
  let timedOut = false;
  let rejectOnAbort!: () => void;
  const aborted = new Promise((_, reject) => {
    rejectOnAbort = () => reject(new Error(timedOut ? 'page retrieval timed out' : 'page retrieval cancelled'));
    if (linked.controller.signal.aborted) rejectOnAbort();
    else linked.controller.signal.addEventListener('abort', rejectOnAbort, { once: true });
  });
  const timer = setTimeout(() => {
    timedOut = true;
    linked.controller.abort();
  }, options.timeoutMs ?? PAGE_CONTEXT_TIMEOUT_MS);
  try{
    // Race the full JSON operation as well as aborting transport: a stalled
    // response body or fetch mock must not hold the chat preparation open.
    const r = await Promise.race([
      apiFetch("/api/fetch-batch",{method:"POST",body:{urls:urls},signal:linked.controller.signal}),
      aborted,
    ]) as { results?: FetchedPage[] } | null;
    const results = (r && r.results) || [];
    return { blocks: formatReferencedPages(urls, results), results };
  }catch(e){
    return failedPageContext(urls, e);
  } finally {
    clearTimeout(timer);
    linked.controller.signal.removeEventListener('abort', rejectOnAbort);
    linked.detach();
  }
}
