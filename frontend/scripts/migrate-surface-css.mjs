// scripts/migrate-surface-css.mjs — one-off cascade migration helper.
//
// For a named surface, rewrites the given stylesheets so that every rule
// targeting that surface stops applying on desktop (>= 769px):
//   - rules inside a mobile-only @media (max-width <= 768px) are kept as is;
//   - rules inside a desktop-only @media (min-width >= 769px) are deleted;
//   - every other rule (global, reduced-motion, max-width > 768 …) is moved
//     into an adjacent `@media (max-width: 768px)` wrapper, so phones keep
//     the exact same cascade while desktop is owned by styles/parity/.
// Selector lists are split: only matching selectors move.
//
//   node scripts/migrate-surface-css.mjs composer src/styles/restore/*.css ...
//   node scripts/migrate-surface-css.mjs composer --dry ...
import { readFileSync, writeFileSync } from 'node:fs';
import postcss from 'postcss';

const SURFACES = {
  composer: {
    context: /#topicInputWrap|#chatInputWrap|\.topic-input-wrap|\.chat-input-wrap|#sendBtn|#startBtn|#topicMobileMicBtn|#chatMobileMicBtn|#topicComposerToolsBtn|#chatComposerToolsBtn|\.composer-shell|\.composer-footer|\.composer-primary-btn|\.topic-footer|\.chat-input-footer|\.footer-left-group|\.chat-composer-body|\.composer-editor-root|\.rich-composer(?![-\w])|\.rich-composer-editor|\.composer-plugin-chip|\.composer-tool-chip|\.attach-btn|\.send-btn|\.start-btn|\.mobile-mic-btn|\.composer-tools-trigger|\.effort-picker|\.effort-trigger/,
    subject: /InputWrap|input-wrap|composer-shell|composer-footer|composer-primary-btn|topic-footer|chat-input-footer|footer-left-group|chat-composer-body|composer-editor-root|rich-composer(?![-\w])|rich-composer-editor|tiptap|ProseMirror|is-editor-empty|is-empty|^p(?![-\w])|composer-plugin-chip|composer-tool-chip|send-btn|start-btn|mobile-mic-btn|attach-btn|composer-tools-trigger|#sendBtn|#startBtn|MobileMicBtn|ComposerToolsBtn|BtnContent|icon-voice|icon-send|icon-stop|effort-picker|effort-trigger|effort-label|effort-value|effort-caret|^svg|^span|^path|^rect|^\*/,
    // Never move: voice recording UI, attachment chips, popovers.
    exclude: /voice-recording-active|voice-|attachment-chip|attach-chip|composer-tools-menu|effort-menu|effort-popover|effort-panel|effort-option/,
  },
  sidebar: {
    // The desktop sidebar subtree plus the "main shifts with the sidebar" rules.
    context: /#sidebar(?![-\w])|\.sidebar(?![-\w])|\.sidebar-(?:inner|header|logo|logo-img|header-actions|nav|nav-btn|search|search-row|search-btn|footer|footer-actions|resize-handle)(?![-\w])|#sidebar(?:Header|Nav|Footer|CloseBtn|SearchBtn|UserRow|Search)(?![-\w])|#newChatBtn|\.nav-kbd|#nav[A-Z]\w+|\.recents-(?:panel|header|title|time-label|list-content)(?![-\w])|#recentsPanel|#recentsList|\.recent-item(?:-main|-title-row|-text|-meta|-overflow|-actions)?(?![-\w])|\.recent-mode-badge|\.user-(?:row|avatar|identity|name|plan)(?![-\w])/,
    subject: /./,
    exclude: /knowledge|mistake|kb-|tab-badge|sidebar-view-btn|tutor-only|recents-filter|filter-chip|recent-item-menu|recent-item-(?:tag|archive|del|action|rename|tags)|rename|tag-|drag|drop|more-popover|popover|backdrop|voice-/,
  },
  topbar: {
    // Desktop header chrome. Phone-only controls (mobile mode menu, mobile
    // new-chat/incognito) are excluded so their desktop display:none rules stay.
    context: /\.top-bar(?![-\w])|\.top-bar-(?:left|right)(?![-\w])|#modeSegmentedTop|\.top-mode-tabs(?![-\w])|\.app-mode-toggle|#shareBtn|\.share-btn(?![-\w])|\.share-btn-label|#findBtn|\.find-btn(?![-\w])|#chatModelWrap|\.chat-model-(?:wrap|trigger|glyph|caret)(?![-\w])|#chatModel(?![-\w])|\.top-model-switcher/,
    subject: /./,
    exclude: /mobile-|incognito|plugin-workspace|chat-model-menu|model-picker|exam-|chat-stats|sidebarOpenBtn|toggle-sidebar|glyph-/,
  },
  transcript: {
    // Message column, bubbles, markdown prose, code blocks and the per-message
    // toolbar. Socrates-specific blocks (viz, tools, thinking, tutor widgets,
    // KaTeX internals, attachments, inline edit) keep their own rules.
    context: /#msgList|\.msg(?![-\w])|\.msg-(?:body|toolbar|toolbar-btn)(?![-\w])|\.code-block-(?:header|header-lang|copy|copy-label|expand)(?![-\w])/,
    subject: /./,
    exclude: /viz|tool-|tool_|think|thinking|reasoning|katex|math|tutor|scaffold|quiz|exam|widget|theorem|proof|attachment|edit|artifact|canvas|mermaid|plot|chart|card|search-|source|citation|streaming|stream-|cursor|typing|caret|new-reply|jump|skeleton|loading|error|retry|branch|feedback|rating|kb-|mindmap|inline-|Copied|copied|checkmark/,
  },
};

const MOBILE_MAX = 768;

function stripNot(sel) {
  // Remove :not(...) groups (balanced) so a negated state does not count.
  let out = '';
  for (let i = 0; i < sel.length; i += 1) {
    if (sel.startsWith(':not(', i)) {
      let depth = 0;
      for (let j = i + 4; j < sel.length; j += 1) {
        if (sel[j] === '(') depth += 1;
        else if (sel[j] === ')') { depth -= 1; if (depth === 0) { i = j; break; } }
      }
      continue;
    }
    out += sel[i];
  }
  return out;
}

function subjectOf(sel) {
  const s = stripNot(sel).replace(/::?[a-z-]+(\([^)]*\))?/gi, (m) => (m.startsWith('::') ? m : ''));
  const parts = s.trim().split(/\s*[\s>+~]\s*/).filter(Boolean);
  return parts[parts.length - 1] || '';
}

function matches(spec, sel) {
  if (!spec.context.test(sel)) return false;
  const positive = stripNot(sel);
  if (spec.exclude.test(positive)) return false;
  const subj = subjectOf(sel);
  const compounds = subj.split(/(?=[.#[:])/);
  return compounds.some((c) => spec.subject.test(c)) || spec.subject.test(subj);
}

function mediaKind(rule) {
  let min = null; let max = null; let other = false;
  for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
    if (p.type !== 'atrule') continue;
    if (/keyframes/i.test(p.name)) return 'keyframes';
    if (p.name !== 'media') { other = true; continue; }
    const mMin = /min-width:\s*(\d+)px/.exec(p.params);
    const mMax = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(p.params);
    if (mMin) min = Math.max(min ?? 0, Number(mMin[1]));
    if (mMax) max = Math.min(max ?? Infinity, Number(mMax[1]));
    if (!mMin && !mMax) other = true;
  }
  if (max !== null && max <= MOBILE_MAX) return 'mobile';
  if (min !== null && min > MOBILE_MAX - 60 && max === null) return 'desktop';
  return other || min !== null || max !== null ? 'mixed' : 'global';
}

const [surfaceName, ...rest] = process.argv.slice(2);
const dry = rest.includes('--dry');
const files = rest.filter((f) => !f.startsWith('--'));
const spec = SURFACES[surfaceName];
if (!spec) { console.error(`unknown surface ${surfaceName}`); process.exit(1); }

let totalMoved = 0; let totalDeleted = 0;
for (const file of files) {
  const root = postcss.parse(readFileSync(file, 'utf8'), { from: file });
  let moved = 0; let deleted = 0;
  const rules = [];
  root.walkRules((r) => { rules.push(r); });
  for (const rule of rules) {
    const kind = mediaKind(rule);
    if (kind === 'keyframes' || kind === 'mobile') continue;
    const sels = rule.selectors;
    const hit = sels.filter((s) => matches(spec, s));
    if (!hit.length) continue;
    const keep = sels.filter((s) => !hit.includes(s));
    if (kind === 'desktop') {
      deleted += hit.length;
    } else {
      const wrapper = postcss.atRule({ name: 'media', params: `(max-width: ${MOBILE_MAX}px)` });
      const clone = rule.clone({ selectors: hit });
      wrapper.append(clone);
      rule.after(wrapper);
      moved += hit.length;
    }
    if (keep.length) rule.selectors = keep;
    else rule.remove();
  }
  // Drop at-rules left empty.
  root.walkAtRules((a) => { if (a.nodes && a.nodes.length === 0) a.remove(); });
  if (!dry) writeFileSync(file, root.toString());
  totalMoved += moved; totalDeleted += deleted;
  console.log(`${file}: moved ${moved} selectors to mobile, deleted ${deleted} desktop selectors`);
}
console.log(`total: moved ${totalMoved}, deleted ${totalDeleted}${dry ? ' (dry run)' : ''}`);
