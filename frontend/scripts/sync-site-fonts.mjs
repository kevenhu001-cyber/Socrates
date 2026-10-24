import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function chineseFontStyles(source) {
  const faces = [...source.matchAll(/@font-face\s*\{[^}]+\}/g)]
    .map(([face]) => face)
    .filter((face) => /font-family:\s*'Noto Sans SC'/.test(face));
  if (!faces.length) throw new Error('Marketing site Chinese font faces are missing');
  const styles = faces.map((face) => face.replace(/url\(([^)]+)\)/g, (_, raw) => {
    const path = raw.trim().replace(/^['"]|['"]$/g, '');
    if (!/^\/media\/fonts\/[a-z0-9-]+\.woff2$/.test(path)) throw new Error('Expected a local marketing font asset');
    // Vite emits these shared source assets onto the app's own origin.
    return `url('../../../../site${path}')`;
  }));
  return '/* Generated from site/fonts.css by npm run sync:site-fonts.\n' +
    ' * Keep the marketing site glyphs, weights and unicode ranges identical.\n' +
    ' * The browser downloads only the subsets needed by the visible text. */\n\n' + styles.join('\n\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = readFileSync(new URL('../../site/fonts.css', import.meta.url), 'utf8');
  writeFileSync(new URL('../src/styles/foundations/fonts-cjk.css', import.meta.url), chineseFontStyles(source));
}
