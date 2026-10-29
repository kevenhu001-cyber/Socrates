/* util/stripHtml.ts — tag stripping for untrusted text.
 *
 * A single `replace(/<[^>]+>/g, '')` pass is not a sanitiser. In `<<script>`
 * it consumes the second `<` and its `>`, leaving `<script` behind: feed the
 * result to an HTML sink and the tag is reassembled. Repeat the replacement
 * until the string stops shrinking so no partial tag can survive.
 *
 * The pass deliberately does NOT eat a lone `<` / `>` from prose (`a < b`
 * keeps its bracket) — only a bracket pair with something between them is
 * treated as markup.
 */
export function stripHtmlTags(input: unknown): string {
  let text = String(input ?? '');
  for (let pass = 0; pass < 8; pass += 1) {
    const next = text.replace(/<[^>]*>/g, '');
    if (next === text) break;
    text = next;
  }
  return text;
}
