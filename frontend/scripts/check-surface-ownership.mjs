#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const STYLES = join(FRONTEND, 'src', 'styles');

const surfaces = {
  sidebar: {
    owners: ['parity/sidebar.css', 'polish/sidebar.css'],
    context: /#sidebar(?![-\w])|\.sidebar(?![-\w])|\.sidebar-(?:inner|header|logo|logo-img|header-actions|nav|nav-btn|search|search-row|search-btn|footer|footer-actions|resize-handle)(?![-\w])|#sidebar(?:Header|Nav|Footer|CloseBtn|SearchBtn|UserRow|Search)(?![-\w])|#newChatBtn|\.nav-kbd|#nav[A-Z]\w+|\.recents-(?:panel|header|title|time-label|list-content)(?![-\w])|#recentsPanel|#recentsList|\.recent-item(?:-main|-title-row|-text|-meta|-overflow|-actions)?(?![-\w])|\.recent-mode-badge|\.user-(?:row|avatar|identity|name|plan)(?![-\w])/,
    exclude: /knowledge|mistake|kb-|tab-badge|sidebar-view-btn|tutor-only|recents-filter|filter-chip|recent-item-menu|recent-item-(?:tag|archive|del|action|rename|tags)|rename|tag-|drag|drop|more-popover|popover|backdrop|voice-/,
  },
  topbar: {
    owners: ['parity/topbar.css', 'polish/topbar.css'],
    context: /\.top-bar(?![-\w])|\.top-bar-(?:left|right)(?![-\w])|#modeSegmentedTop|\.top-mode-tabs(?![-\w])|\.app-mode-toggle|#shareBtn|\.share-btn(?![-\w])|\.share-btn-label|#findBtn|\.find-btn(?![-\w])|#chatModelWrap|\.chat-model-(?:wrap|trigger|glyph|caret)(?![-\w])|#chatModel(?![-\w])|\.top-model-switcher/,
    exclude: /mobile-|incognito|plugin-workspace|chat-model-menu|model-picker|exam-|chat-stats|sidebarOpenBtn|toggle-sidebar|glyph-/,
  },
  transcript: {
    owners: ['parity/transcript.css', 'components/chat.css', 'polish/transcript.css'],
    context: /#msgList|\.msg(?![-\w])|\.msg-(?:body|toolbar|toolbar-btn)(?![-\w])|\.code-block-(?:header|header-lang|copy|copy-label|expand)(?![-\w])/,
    exclude: /viz|tool-|tool_|think|thinking|reasoning|katex|math|tutor|scaffold|quiz|exam|widget|theorem|proof|attachment|edit|artifact|canvas|mermaid|plot|chart|card|search-|source|citation|streaming|stream-|cursor|typing|caret|new-reply|jump|skeleton|loading|error|retry|branch|feedback|rating|kb-|mindmap|inline-|Copied|copied|checkmark|agent/,
  },
};

/*
 * Motion is intentionally the one cross-surface exception. The visual owner
 * files above keep geometry, paint and typography, while polish/motion.css may
 * coordinate animation state across sidebar / transcript / composer surfaces.
 * The exception is property-scoped for the ENTIRE file: width, padding, color,
 * display, typography, etc. are rejected even if a future selector does not
 * belong to one of the guarded surfaces above.
 */
const CROSS_SURFACE_MOTION_OWNER = 'polish/motion.css';
const MOTION_PROPERTIES = new Set([
  'animation',
  'opacity',
  'transform',
  'transform-origin',
  'transition',
  'will-change',
]);

function isMotionDeclaration(prop) {
  return MOTION_PROPERTIES.has(prop)
    || prop.startsWith('animation-')
    || prop.startsWith('transition-');
}

function isMotionOnlyRule(rule) {
  const declarations = (rule.nodes || []).filter((node) => node.type === 'decl');
  return declarations.length > 0 && declarations.every((decl) => isMotionDeclaration(decl.prop));
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : entry.name.endsWith('.css') ? [path] : [];
  });
}

function appliesOnDesktop(rule) {
  for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
    if (parent.type !== 'atrule') continue;
    if (/keyframes/i.test(parent.name)) return false;
    if (parent.name !== 'media') continue;
    const max = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(parent.params);
    if (max && Number(max[1]) <= 768) return false;
  }
  return true;
}

function insideKeyframes(rule) {
  for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
    if (parent.type === 'atrule' && /keyframes/i.test(parent.name)) return true;
  }
  return false;
}

const problems = [];
for (const file of walk(STYLES)) {
  const rel = relative(STYLES, file).replaceAll('\\', '/');
  if (rel.startsWith('legacy/') || rel.startsWith('restore/') || rel === 'themes.css' || rel === 'tokens.css') continue;
  const root = postcss.parse(readFileSync(file, 'utf8'), { from: file });
  root.walkRules((rule) => {
    if (insideKeyframes(rule)) return;

    if (rel === CROSS_SURFACE_MOTION_OWNER && !isMotionOnlyRule(rule)) {
      problems.push(`${rel}:${rule.source?.start?.line ?? '?'} motion policy may declare motion properties only: ${rule.selectors.join(', ')}`);
      return;
    }

    if (!appliesOnDesktop(rule)) return;
    for (const [name, surface] of Object.entries(surfaces)) {
      if (surface.owners.includes(rel)) continue;
      const motionException = rel === CROSS_SURFACE_MOTION_OWNER;
      for (const selector of rule.selectors) {
        if (!surface.context.test(selector) || surface.exclude.test(selector)) continue;
        if (motionException) continue;
        problems.push(`${rel}:${rule.source?.start?.line ?? '?'} ${name} desktop rule outside ${surface.owners.join(', ')}: ${selector}`);
      }
    }
  });
}

/*
 * Second rule: one declaration, one owner.
 *
 * The owner-list check above answers "is this rule in a file allowed to own
 * this surface". It cannot answer "does another live file already say
 * something else about the same property", which is how several real defects
 * survived it: `.tier-badge` carried three font-sizes across three files, the
 * composer tools footer search had two heights in one popover, and the
 * `.recents-time-label` group header changed size between breakpoints. Each
 * resolved silently by @import order, so the shipped value was whichever file
 * sorted last and the other declaration was invisible dead code that a later
 * edit could revive.
 */
const duplicatePairs = [
  ['.tier-badge', 'font-size'],
  ['.recents-time-label', 'font-size'],
  ['.composer-tools-footer-search', 'min-height'],
];

/* Last simple selector of a compound: "#appShell .a .b" -> ".b". */
const lastSimple = (selector) => {
  const parts = selector.trim().split(/\s+|(?=\.|#\[)/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : selector.trim();
};

const ownerOf = new Map();
for (const file of walk(STYLES)) {
  const rel = relative(STYLES, file).replaceAll('\\', '/');
  if (rel.startsWith('legacy/') || rel.startsWith('restore/') || rel === 'themes.css' || rel === 'tokens.css') continue;
  const root = postcss.parse(readFileSync(file, 'utf8'), { from: file });
  root.walkRules((rule) => {
    if (!appliesOnDesktop(rule)) return;
    for (const selector of rule.selectors) {
      const tail = lastSimple(selector);
      for (const [className, property] of duplicatePairs) {
        if (tail !== className) continue;
        const decl = rule.nodes?.find((node) => node.type === 'decl' && node.prop === property && !node.important);
        if (!decl) continue;
        const prior = ownerOf.get(`${className}|${property}`);
        const here = `${rel}:${rule.source?.start?.line ?? '?'} ${property}: ${decl.value}`;
        if (prior && prior.value !== decl.value) {
          problems.push(`${property} on ${className} has two live desktop values — ${prior.where} vs ${here}. Keep one owner and delete the other.`);
        } else if (!prior) {
          ownerOf.set(`${className}|${property}`, { value: decl.value, where: here });
        }
      }
    }
  });
}

if (problems.length) {
  console.error(`surface ownership check failed (${problems.length}):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log('surface ownership check passed (sidebar, topbar, transcript + restricted motion owner + duplicate-declaration pairs)');
