// scripts/composer-surface.mjs — what counts as "a composer rule".
//
// Shared by unify-composer-css.mjs (one-off cleanup) and check-composer-css.mjs
// (lint guard): a selector belongs to the composer when it mentions the
// composer context AND its subject (rightmost compound) is the shell, one of
// its controls, or the editor. Voice-recording UI, attachment chips and the
// tools / effort popovers are separate components and never match.

export const COMPOSER_SURFACE = {
  context: /#topicInputWrap|#chatInputWrap|\.topic-input-wrap|\.chat-input-wrap|\.composer-shell|\.composer-footer|\.composer-primary-btn|#sendBtn|#startBtn|#topicMobileMicBtn|#chatMobileMicBtn|#topicComposerToolsBtn|#chatComposerToolsBtn|#topicComposerRoot|#chatComposerRoot|\.topic-footer|\.chat-input-footer|\.footer-left-group|\.chat-composer-body|\.composer-editor-root|\.rich-composer(?![-\w])|\.rich-composer-editor|\.composer-plugin-chip|\.composer-tool-chip|\.attach-btn|\.send-btn|\.start-btn|\.mobile-mic-btn|\.composer-tools-trigger|\.effort-picker|\.effort-trigger/,
  subject: /InputWrap|input-wrap|composer-shell|composer-footer|composer-primary-btn|ComposerRoot|topic-footer|chat-input-footer|footer-left-group|chat-composer-body|composer-editor-root|rich-composer(?![-\w])|rich-composer-editor|tiptap|ProseMirror|is-editor-empty|is-empty|^p(?![-\w])|composer-plugin-chip|composer-tool-chip|send-btn|start-btn|mobile-mic-btn|attach-btn|composer-tools-trigger|#sendBtn|#startBtn|MobileMicBtn|ComposerToolsBtn|BtnContent|icon-voice|icon-send|icon-stop|icon-arrow|effort-picker|effort-trigger|effort-label|effort-value|effort-caret|^svg|^span|^path|^rect|^\*/,
  exclude: /voice-recording-(?!active)|voice-wave|attachment-chip|attach-chip|composer-tools-menu|effort-menu|effort-popover|effort-panel|effort-option|effort-sheet|slash-|template-|mention-/,
};

export function stripNot(sel) {
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

export function subjectOf(sel) {
  const s = stripNot(sel).replace(/::?[a-z-]+(\([^)]*\))?/gi, (m) => (m.startsWith('::') ? m : ''));
  const parts = s.trim().split(/\s*[\s>+~]\s*/).filter(Boolean);
  return parts[parts.length - 1] || '';
}

/* `:has(...)` arguments describe state, not the subject, so they are removed
   before the context test as well (`.x:has(.composer-tool-chip)` elsewhere
   is not a composer rule). */
function stripHas(sel) {
  return sel.replace(/:has\((?:[^()]|\([^()]*\))*\)/g, '');
}

export function matchesSurface(spec, sel) {
  const bare = stripHas(sel);
  if (!spec.context.test(bare)) return false;
  const positive = stripNot(bare);
  if (spec.exclude.test(positive)) return false;
  const subj = subjectOf(bare);
  const compounds = subj.split(/(?=[.#[:])/);
  /* Generic subjects (span, svg, p, *) only count when the selector is
     rooted in the composer — `.x span` alone is not ours. */
  return compounds.some((c) => spec.subject.test(c)) || spec.subject.test(subj);
}
