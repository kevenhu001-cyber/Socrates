/* Phone layout has explicit owners; shared base and desktop rules are allowed. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const styles = fileURLToPath(new URL('../src/styles/', import.meta.url));
const geometry = /^(?:position|width|min-width|max-width|height|min-height|max-height|top|bottom|left|right|inset.*|padding.*|margin.*|transform|font-size|line-height)$/;
const shell = /(?:\.top-bar|#topicSetup|\.topic-setup|#topicTitle\.greeting|\.topic-title\.greeting)$/;
const directories = /\.library-|\.plugin-directory|\.plugin-installed|\.connector-tile-base|\.connector-mark-wrap/;
/*
 * Mobile sidebar ownership (2026-11-04 pass, docs/plans/2026-11-04-sidebar-ui-consistency.md).
 * Phone-drawer rules for the sidebar surface currently live in three sanctioned
 * files; pass 2 merges them into polish/mobile-sidebar.css and this allowlist
 * shrinks to one. Frozen zones stay out — css-debt tracks them separately.
 * The context/exclude regexes mirror check-surface-ownership.mjs so the two
 * guards agree on what "the sidebar surface" is.
 */
const sidebarCtx = /#sidebar(?![-\w])|\.sidebar(?![-\w])|\.sidebar-(?:inner|header|logo|logo-img|header-actions|nav|nav-btn|search|search-row|search-btn|footer|footer-actions|resize-handle)(?![-\w])|#sidebar(?:Header|Nav|Footer|CloseBtn|SearchBtn|UserRow|Search)(?![-\w])|#newChatBtn|\.nav-kbd|#nav[A-Z]\w+|\.recents-(?:panel|header|title|time-label|list-content)(?![-\w])|#recentsPanel|#recentsList|\.recent-item(?:-main|-title-row|-text|-meta|-overflow|-actions)?(?![-\w])|\.recent-mode-badge|\.user-(?:row|avatar|identity|name|plan)(?![-\w])/;
const sidebarExcl = /knowledge|mistake|kb-|tab-badge|sidebar-view-btn|tutor-only|recents-filter|filter-chip|recent-item-menu|recent-item-(?:tag|archive|del|action|rename|tags)|rename|tag-|drag|drop|more-popover|popover|backdrop|voice-/;
const sidebarOwners = new Set([
  'polish/mobile-sidebar.css',
  /* Charter owner for ≤768px shared controls / hit areas, same cross-surface
     carve-out motion.css has on desktop. Its sidebar touch-target rules are
     out of merge scope (2026-11-04 pass 2). */
  'polish/mobile-controls.css',
]);
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? walk(path) : entry.name.endsWith('.css') ? [path] : [];
});
const errors = [];
for (const file of walk(styles)) {
  const owner = relative(styles, file).replaceAll('\\', '/');
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
      if (!owner.startsWith('legacy/') && !owner.startsWith('restore/') && sidebarCtx.test(selector) && !sidebarExcl.test(selector) && !sidebarOwners.has(owner)) {
        errors.push(`${owner}:${rule.source.start.line}: mobile sidebar rule outside ${[...sidebarOwners].join(', ')}: ${selector}`);
      }
    }
  });
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('mobile CSS ownership passed (shell, directories, sidebar)');
