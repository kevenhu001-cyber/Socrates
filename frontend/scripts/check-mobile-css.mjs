/* Phone layout has explicit owners; shared base and desktop rules are allowed. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const styles = fileURLToPath(new URL('../src/styles/', import.meta.url));
const geometry = /^(?:position|width|min-width|max-width|height|min-height|max-height|top|bottom|left|right|inset.*|padding.*|margin.*|transform|font-size|line-height)$/;
const shell = /(?:\.top-bar|#topicSetup|\.topic-setup|#topicTitle\.greeting|\.topic-title\.greeting)$/;
const directories = /\.library-|\.plugin-directory|\.plugin-installed|\.connector-tile-base|\.connector-mark-wrap/;
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? walk(path) : entry.name.endsWith('.css') ? [path] : [];
});
const errors = [];
for (const file of walk(styles)) {
  const owner = relative(styles, file);
  postcss.parse(readFileSync(file, 'utf8')).walkRules(rule => {
    let phone = false;
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
      if (parent.type === 'atrule' && parent.name === 'media' && /max-width:\s*(?:768|480|375)px/.test(parent.params)) phone = true;
    }
    if (!phone) return;
    for (const selector of rule.selectors) {
      if (directories.test(selector) && owner !== 'polish/mobile-directories.css') errors.push(`${owner}:${rule.source.start.line}: directory rule outside mobile owner: ${selector}`);
      if (shell.test(selector) && !/hidden|data-keyboard|data-topic-input-focus/.test(selector) && owner !== 'polish/mobile-shell.css') {
        rule.walkDecls(decl => {
          if (geometry.test(decl.prop)) errors.push(`${owner}:${rule.source.start.line}: ${decl.prop} outside mobile shell owner: ${selector}`);
        });
      }
    }
  });
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('mobile CSS ownership passed (shell and directories)');
