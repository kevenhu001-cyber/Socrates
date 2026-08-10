// One-shot helper: replace every "↗" glyph inside the marketing
// HTML with a tiny x.ai-style arrow-up-right SVG, so the pages
// stop using the unicode arrow.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'site');
const FILES = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.html'))
  .map(f => path.join(ROOT, f));
const ZH = fs.readdirSync(path.join(ROOT, 'zh'))
  .filter(f => f.endsWith('.html'))
  .map(f => path.join(ROOT, 'zh', f));
const ALL = [...FILES, ...ZH];

// Different contexts get different SVG sizes/classes. The default
// replacement is a 14x14 arrow that fits in a text-action / list-row.
const ARROW_14 = '<svg class="xa-link-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 16.5H16V9.41406L6.99998 18.4141L5.58591 17L14.5859 8H7.49998V6H18V16.5Z"/></svg>';
// 16x16 inline (used inside .xa-arrow-button / answer submit)
const ARROW_16 = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 16.5H16V9.41406L6.99998 18.4141L5.58591 17L14.5859 8H7.49998V6H18V16.5Z"/></svg>';

let totalReplacements = 0;
for (const file of ALL) {
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes('↗')) continue;

  // Match spans that wrap a bare ↗ — drop the wrapper and inline the
  // SVG. We also drop `aria-hidden="true"` from the span (SVG has it).
  const before = src;
  src = src.replace(/<span aria-hidden="true">↗<\/span>/g, ARROW_14);
  src = src.replace(/>↗<\/button>/g, '>' + ARROW_16 + '</button>');
  src = src.replace(/>↗<\/a>/g, '>' + ARROW_14 + '</a>');
  // Any remaining bare ↗ in a non-link context (e.g. plain text):
  // replace with the inline 14x14 arrow.
  src = src.replace(/↗/g, ARROW_14);

  const replaced = (before.length - src.length) !== 0 || before !== src;
  if (replaced) {
    fs.writeFileSync(file, src, 'utf8');
    totalReplacements += 1;
    console.log('updated', path.relative(ROOT, file));
  }
}
console.log(`\n${totalReplacements} files updated.`);
