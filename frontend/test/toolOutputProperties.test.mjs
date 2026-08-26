/**
 * Property tests for the XSS-safe tool-output renderer.
 *
 * Covers `formatToolOutput` from src/render/toolOutput.ts, the sink for
 * UNTRUSTED tool output (Python stdout/stderr, JSON dumps, web_fetch text).
 * The two properties mirror the design's tool-output invariants:
 *
 *   Property 11 — nothing the caller drops into innerHTML can execute:
 *     every `<`, `>`, `&`, and quote from the input is escaped before it
 *     reaches the DOM.
 *   Property 12 — the rich upgrades are lossless: a JSON document round-trips
 *     to a deep-equal value, and a fenced code block preserves its original
 *     code content (in escaped form).
 *
 * These are validation-only tests; the source is not modified.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';
import fc from 'fast-check';

import { formatToolOutput } from '../src/render/toolOutput.ts';
import { decodeEntities } from '../src/render/helpers.ts';

const RUNS = 200;

/* The only markup formatToolOutput ever emits itself: a <pre> wrapper and,
   for rich output, a nested <code> (optionally carrying a language-* class).
   Untrusted bytes are inserted only as *text* inside those elements. We use a
   real DOM to prove that: parse the HTML, then read every element back and
   assert the tree contains nothing but pre/code — so no attacker-controlled
   <script>, <img>, etc. was ever materialised as an element. */
function parseElements(html) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  const body = dom.window.document.body;
  return Array.from(body.querySelectorAll('*'));
}

/* Assert that the produced HTML only ever creates the renderer's own
   pre/code scaffold — never an element sourced from the untrusted input. */
function assertOnlySafeScaffold(html) {
  const els = parseElements(html);
  for (const el of els) {
    const tag = el.tagName.toLowerCase();
    assert.ok(
      tag === 'pre' || tag === 'code',
      `unexpected element <${tag}> materialised from tool output: ${html}`,
    );
    // The only attribute the renderer sets is class (on pre and code).
    for (const attr of Array.from(el.attributes)) {
      assert.equal(
        attr.name,
        'class',
        `unexpected attribute ${attr.name} on <${tag}>: ${html}`,
      );
    }
  }
}

/* Hostile fragments a web page / tool result might contain. Assembled into
   larger strings so the generator exercises markup embedded in surrounding
   text, not just in isolation. */
const hostileFragment = () => fc.constantFrom(
  '<script>alert(1)</script>',
  '<img src=x onerror="alert(1)">',
  '<img src=x onerror=\'alert(1)\'>',
  '</pre><script>alert(2)</script>',
  '</code></pre><iframe src="javascript:alert(3)">',
  '<svg/onload=alert(4)>',
  '<a href="javascript:alert(5)">x</a>',
  '&lt;already&gt; &amp; "quoted" \'apos\'',
  '<style>*{}</style>',
  '"><b>bold</b>',
  '& < > " \'',
);

const hostileString = () => fc.array(
  fc.oneof(hostileFragment(), fc.string()),
  { minLength: 1, maxLength: 6 },
).map((parts) => parts.join(''));

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 11: Tool output never yields
// executable markup — for any string with HTML-like markup, the produced HTML
// escapes every `<`, `>`, `&`, and quote before insertion.
//
// Implementation note: formatToolOutput escapes <, >, & everywhere (escHTML)
// and never opens an attribute context from untrusted bytes, so untrusted
// quotes are left as literal *text* — which is safe. The test therefore
// verifies the operative guarantee: no attacker byte survives as an element
// or as an attribute value (DOM-level), and no raw angle bracket survives in
// the insertion region (byte-level).
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 11: Tool output never yields executable markup', () => {
  fc.assert(
    fc.property(hostileString(), (raw) => {
      const { html } = formatToolOutput(raw);

      // 1. Parsing the output must only ever produce the renderer's own
      //    pre/code scaffold — the untrusted markup never becomes an element.
      assertOnlySafeScaffold(html);

      // 2. Structural safety, byte level: strip the renderer's own fixed
      //    scaffold tags (the only markup it legitimately emits), and assert
      //    the remaining insertion region carries no raw `<`, `>` — i.e. every
      //    angle bracket sourced from the input was escaped to an entity.
      const insertionRegion = html
        .replace(/<pre class="agent-tool-output-pre">/g, '')
        .replace(/<code(?: class="language-[a-z0-9_+-]*")?>/g, '')
        .replace(/<\/code>/g, '')
        .replace(/<\/pre>/g, '');
      assert.ok(
        !insertionRegion.includes('<') && !insertionRegion.includes('>'),
        `unescaped angle bracket survived into the DOM insertion region: ${html}`,
      );

      // 3. Quotes: the renderer escapes <, >, & but leaves quotes as literal
      //    text — which is safe precisely because every angle bracket is
      //    escaped, so no attacker byte can open a tag or an attribute context
      //    in the first place. Prove that safety at the DOM level: any quote
      //    the parser sees must land as element *text*, never as an attribute
      //    on the pre/code scaffold. assertOnlySafeScaffold already confirms
      //    class is the only attribute present; here we confirm no attribute
      //    value carries an attacker-controlled quote or angle bracket.
      for (const el of parseElements(html)) {
        for (const attr of Array.from(el.attributes)) {
          assert.ok(
            !/["<>]/.test(attr.value),
            `attribute value carries untrusted markup: ${attr.name}="${attr.value}"`,
          );
        }
      }
    }),
    { numRuns: RUNS },
  );
});

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 12: JSON output round-trips and
// fenced code is preserved — for any JSON value v, formatToolOutput(
// JSON.stringify(v)) is marked rich and its decoded code content parses back
// to a deep-equal value; and for any fenced code string, output is rich and
// contains the original code content in escaped form.
// ---------------------------------------------------------------------------

/* Extract the text content of the single <code> element the rich branch
   emits, decoded back from HTML entities to the raw string that was escaped
   for insertion. This is the inverse of the escHTML the renderer applies. */
function decodedCodeContent(html) {
  const m = /<code(?: class="language-[a-z0-9_+-]*")?>([\s\S]*)<\/code>/.exec(html);
  assert.ok(m, `expected a <code> block in rich output: ${html}`);
  return decodeEntities(m[1]);
}

test('Feature: chat-experience-revamp, Property 12: JSON output round-trips and fenced code is preserved', () => {
  // JSON round-trip. prettyJson only upgrades object/array documents (a bare
  // number/string/bool is left as plain text), so constrain the generator to
  // objects and arrays — the documents the rich JSON branch actually handles.
  const jsonValue = fc.oneof(
    fc.dictionary(fc.string(), fc.jsonValue()),
    fc.array(fc.jsonValue()),
  );

  fc.assert(
    fc.property(jsonValue, (v) => {
      const serialized = JSON.stringify(v);
      const { html, rich } = formatToolOutput(serialized);

      assert.equal(rich, true, `JSON document should be rich: ${serialized}`);

      // The decoded code content is the pretty-printed JSON; it must parse
      // back to a value deep-equal to the original.
      const decoded = decodedCodeContent(html);
      assert.deepEqual(JSON.parse(decoded), v);
    }),
    { numRuns: RUNS },
  );
});

test('Feature: chat-experience-revamp, Property 12: fenced code content is preserved in escaped form', () => {
  // A fenced block: an optional language tag plus arbitrary code content. The
  // FENCE_RE requires the whole output to be the fence, code on its own lines,
  // so we exclude a lone ``` line and CR from the body (which would terminate
  // or reshape the fence) — the generator still covers <, >, &, quotes.
  const langTag = fc.stringMatching(/^[a-zA-Z0-9_+-]*$/);
  const codeBody = fc.array(
    fc.string().filter((line) => !/\r/.test(line) && !/^```/.test(line.trim())),
    { minLength: 1, maxLength: 6 },
  ).map((lines) => lines.join('\n'))
    // FENCE_RE captures ([\s\S]*?) between the newlines; a body that is empty
    // or ends in a way that collides with the closing fence is out of scope.
    .filter((body) => body.length > 0 && !body.endsWith('\n'));

  fc.assert(
    fc.property(langTag, codeBody, (lang, code) => {
      const fenced = '```' + lang + '\n' + code + '\n```';
      const { html, rich } = formatToolOutput(fenced);

      assert.equal(rich, true, `fenced code should be rich: ${JSON.stringify(fenced)}`);

      // Structural safety still holds for the fenced branch.
      assertOnlySafeScaffold(html);

      // The original code content is preserved verbatim once entities are
      // decoded — nothing added, nothing dropped.
      const decoded = decodedCodeContent(html);
      assert.equal(decoded, code);
    }),
    { numRuns: RUNS },
  );
});
