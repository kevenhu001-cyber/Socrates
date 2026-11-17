/**
 * HTML/text escaping and citation cleanup shared by the renderers.
 */
/* ── HTML / attribute escaping shared by the markdown renderer ──
   These are deliberately separate from util/safe.ts because they
   produce HTML-safe text intended for innerHTML (escapeHtml in
   safe.js also escapes single-quote, which is correct for JS strings
   but the renderer's helpers follow the existing calling conventions
   in the 600-line formatMsg function). */

import { stripHtmlTags } from '../util/stripHtml.ts';

export function esc(s: unknown): string {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function escAttr(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escHTML(s: unknown): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function stripTags(s: string): string {
  return stripHtmlTags(s);
}

/* P_strip-citations — remove [1] / [2,3] / [1][2][3] / 【1】 style web-search
   citation markers from assistant prose.
 *
 * The system prompt forbids these markers, but models add them anyway, and
 * the reader sees raw "[1]" noise in the answer body. Sources stay visible
 * in the search tool card, so the markers carry no information we need.
 *
 * Protected content (never stripped):
 *   • fenced code blocks and `inline code` — stashed first;
 *   • \(..\), \[..\] and $..$ math — a[1] indexing must survive.
 *
 * Also left intact:
 *   • markdown links `[1](https://…)` and reference definitions `[1]: url`
 *     (negative lookahead on `(` / `:`);
 *   • `[`-prefixed runs like `[[1]]`.
 *
 * Idempotent: stripping an already-stripped string is a no-op, so both the
 * streaming preprocessor and the final pass can call it every frame.
 */
export function stripCitationMarkers(s: string): string {
  let t = String(s ?? '');
  if (t.indexOf('[') === -1 && t.indexOf('【') === -1) return t;
  const stash: string[] = [];
  const keep = (html: string): string => {
    const id = stash.length;
    stash.push(html);
    return '\uE000SOCRATES_CITE_' + id + '\uE001';
  };
  /* Protect code and math spans before touching brackets. */
  t = t.replace(/```[\w-]*\n?[\s\S]*?```/g, keep);
  t = t.replace(/`[^`\n]+`/g, keep);
  t = t.replace(/\\\[[\s\S]+?\\\]/g, keep);
  t = t.replace(/\\\([\s\S]+?\\\)/g, keep);
  t = t.replace(/\$[^$\n]+\$/g, keep);
  /* The marker itself: one number, or 2–4 numbers joined by , ， - – ~.
     A `+` run consumes adjacent markers like "[1][2][3]" in one match —
     scanning per-marker would stop after the first because the preceding
     character of "[2]" is the "]" of "[1]", which the previous match
     already consumed. Up to one space before the run is consumed with it,
     so "with [1]." becomes "with." not "with .". A following "(" or ":"
     cancels the strip so markdown links "[1](url)" and reference
     definitions "[1]: url" survive. */
  t = t.replace(/[ \t]?((?:[[【]\d{1,3}(?:\s*[,，\-–~]\s*\d{1,3}){0,3}[\]】])+)(?!\s*[(（:[])/g,
    (m, run: string) => {
      // Every group must pair the same bracket style; a stray "[1】" or
      // mixed "[1】【2]" run stays as-is.
      const ok = /^(?:\[\d{1,3}(?:\s*[,，\-–~]\s*\d{1,3}){0,3}\]|【\d{1,3}(?:\s*[,，\-–~]\s*\d{1,3}){0,3}】)+$/.test(String(run));
      return ok ? '' : m;
    });
  return t.replace(/\uE000SOCRATES_CITE_(\d+)\uE001/g, (_m, id: string) => stash[Number(id)]);
}
