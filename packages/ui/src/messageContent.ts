import { marked, type Token } from 'marked';
import type { Message } from '@socrates/contracts';
import { extractFootnoteDefinitions, splitMathSegments, stripCitationMarkers, type Footnote } from './math.ts';

export { plainText, safeImage, safeLink } from './urlSafety';

export function parseMessageContent(message: Pick<Message, 'rawText' | 'content' | 'reasoningContent'>): { text: string; reasoning: string; tokens: Token[] } {
  let text = message.rawText || message.content || '';
  let reasoning = message.reasoningContent || '';
  // Legacy inline thinking appears at the start; fenced examples remain code.
  const legacy = /^\s*<think>([\s\S]*?)(?:<\/think>|$)/i.exec(text);
  if (legacy) { if (!reasoning) reasoning = legacy[1]; text = text.slice(legacy[0].length).trimStart(); }
  return { text, reasoning, tokens: marked.lexer(text, { gfm: true, breaks: true }) };
}

export type RichSegment =
  | { kind: 'prose'; tokens: Token[] }
  | { kind: 'math'; tex: string }
  | { kind: 'notes'; notes: Footnote[] };

/* Inline math stays inside the prose flow: `$x$` becomes a codespan so
 * the sentence keeps its shape and the TeX source stays readable (a tap
 * target per formula is display-math only — see MathCard). Backticks in
 * the TeX fall back to literal dollars. */
function inlineMathAsCode(tex: string): string {
  return tex.includes('`') ? `$${tex}$` : `\`${tex}\``;
}

/** Assistant pipeline: strip `[1]` citation noise (sources live in the
 * tool card), lift footnote definitions into Notes, split display math
 * into island cards. User messages keep whatever was typed. */
export function parseAssistantSegments(rawText: string): RichSegment[] {
  const { body, notes } = extractFootnoteDefinitions(stripCitationMarkers(rawText));
  const out: RichSegment[] = [];
  let prose = '';
  const flushProse = () => {
    if (prose !== '') out.push({ kind: 'prose', tokens: marked.lexer(prose, { gfm: true, breaks: true }) });
    prose = '';
  };
  for (const part of splitMathSegments(body)) {
    if (part.kind === 'math') {
      if (part.display) {
        flushProse();
        out.push({ kind: 'math', tex: part.tex });
      } else {
        prose += inlineMathAsCode(part.tex);
      }
    } else {
      prose += part.text;
    }
  }
  flushProse();
  if (notes.length) out.push({ kind: 'notes', notes });
  return out;
}
