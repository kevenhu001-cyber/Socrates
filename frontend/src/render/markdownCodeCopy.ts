/* DOM observer and clipboard behavior for Markdown code blocks. */
import { escHTML } from './helpers.js';

/* ── Code-block copy affordance (Task 7.1) ───────────────────────────
   Post-render pass that gives every fenced code block in assistant
   markdown output a copy control. The button lives inside the
   `.code-block-header` bar that `wireCodeBlockHeaders` mounts atop each
   `<pre>` (see main.js); we augment that header rather than emit a
   competing one so the language label and expand control are preserved.

   The clipboard write + success/failure state mirrors the copy affordance
   already wired for tool cards (`ui/toolCards.js`): prefer
   `navigator.clipboard.writeText`, fall back to an off-screen textarea +
   `execCommand('copy')`, and on rejection show a non-fatal "copy failed"
   state that leaves the code content intact. Success/failure are surfaced
   via the `.copied` / `.copy-failed` classes the Task 8.1 CSS targets. */

const COPY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
  '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

function trCopy(key: string, fallback: string): string {
  try {
    const w = (typeof window !== 'undefined') ? window : undefined;
    if (w && typeof w.t === 'function') return w.t(key) || fallback;
  } catch (_) { /* ignore */ }
  return fallback;
}

/* Copy `value` to the clipboard, resolving on success and rejecting on
   failure so the caller can render a non-fatal error state. */
function copyCodeText(value: string): Promise<void> {
  const text = String(value ?? '');
  if (!text) return Promise.reject(new Error('empty'));
  const nav = (typeof navigator !== 'undefined') ? navigator : undefined;
  if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
    return nav.clipboard.writeText(text);
  }
  return new Promise<void>(function (resolve, reject) {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      if (ok) resolve(); else reject(new Error('copy failed'));
    } catch (err) { reject(err instanceof Error ? err : new Error(String(err))); }
  });
}

interface CopyButtonEl extends HTMLButtonElement {
  _copyFeedbackTimer?: ReturnType<typeof setTimeout>;
}

const CHECK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<polyline points="20 6 9 17 4 12"/></svg>';

function setCodeCopyFeedback(button: CopyButtonEl, ok: boolean): void {
  const labelEl = button.querySelector('.code-block-copy-label');
  const idleLabel = trCopy('tool.copyCode', 'Copy');
  button.classList.remove('copied', 'copy-failed');
  button.classList.add(ok ? 'copied' : 'copy-failed');
  if (ok) {
    button.innerHTML = CHECK_ICON + '<span class="code-block-copy-label">' + escHTML(trCopy('tool.copied', 'Copied')) + '</span>';
  } else {
    if (labelEl) labelEl.textContent = trCopy('tool.copyFailed', 'Copy failed');
  }
  clearTimeout(button._copyFeedbackTimer);
  button._copyFeedbackTimer = setTimeout(function () {
    button.classList.remove('copied', 'copy-failed');
    button.innerHTML = COPY_ICON + '<span class="code-block-copy-label">' + escHTML(idleLabel) + '</span>';
  }, 1800);
}

/* Build the copy button for a code-block header. The `<code>` textContent is
   read lazily at click time so it reflects the fully rendered block. */
function makeCodeCopyButton(pre: HTMLElement): CopyButtonEl {
  const button = document.createElement('button') as CopyButtonEl;
  button.type = 'button';
  button.className = 'code-block-copy';
  button.setAttribute('aria-label', trCopy('tool.copyCode', 'Copy'));
  button.title = trCopy('tool.copyCode', 'Copy');
  button.innerHTML = COPY_ICON + '<span class="code-block-copy-label">' + escHTML(trCopy('tool.copyCode', 'Copy')) + '</span>';
  button.addEventListener('click', function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const code = pre.querySelector('code');
    copyCodeText(code ? (code.textContent || '') : '')
      .then(function () { setCodeCopyFeedback(button, true); })
      .catch(function () { setCodeCopyFeedback(button, false); });
  });
  return button;
}

/* Inject a copy control into a `.code-block-header` if it does not have one
   yet. Idempotent — safe to run repeatedly over the same header. */
function addCopyToHeader(header: Element): void {
  if (header.querySelector('.code-block-copy')) return;
  const pre = header.nextElementSibling;
  if (!pre || pre.tagName !== 'PRE') return;
  header.appendChild(makeCodeCopyButton(pre as HTMLElement));
}

const COPY_HEADER_SELECTOR =
  '.msg-body .code-block-header, .think-content .code-block-header';

/* Scan a mounted subtree for code-block headers and wire copy controls.
   Skips headers inside tool cards / viz / exec artifacts, matching the
   scope of the header pass in main.js. The root itself is checked too:
   `wireCodeBlockHeaders` inserts the header node directly, and
   querySelectorAll never includes its own root. */
function wireCodeBlockCopy(root: ParentNode): void {
  const headers: Element[] = [];
  const rootEl = root as Element;
  if (typeof rootEl.matches === 'function' && rootEl.matches(COPY_HEADER_SELECTOR)) headers.push(rootEl);
  const found = root.querySelectorAll(COPY_HEADER_SELECTOR);
  for (let i = 0; i < found.length; i++) headers.push(found[i]);
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (header.closest('.exec-artifact') || header.closest('.agent-tool-card') || header.closest('.viz')) continue;
    addCopyToHeader(header);
  }
}

let _codeCopyInstalled = false;

/* Install a one-shot MutationObserver so copy controls appear on code-block
   headers as soon as they are mounted (the header itself is added by
   `wireCodeBlockHeaders` after the markdown HTML is inserted, so we react to
   its insertion rather than emit the header ourselves). Only the added
   subtrees are scanned: streaming appends text nodes every frame, and a
   document-wide querySelectorAll on each of those would be needless work. */
export function installCodeBlockCopy(): void {
  if (_codeCopyInstalled) return;
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  _codeCopyInstalled = true;

  const observer = new MutationObserver(function (mutations) {
    for (let i = 0; i < mutations.length; i++) {
      const added = mutations[i].addedNodes;
      if (!added || !added.length) continue;
      for (let j = 0; j < added.length; j++) {
        const node = added[j];
        if (node.nodeType !== 1) continue; /* element nodes only */
        try { wireCodeBlockCopy(node as Element); } catch (_) { /* ignore */ }
      }
    }
  });

  const start = () => {
    if (!document.body) return;
    observer.observe(document.body, { childList: true, subtree: true });
    try { wireCodeBlockCopy(document); } catch (_) { /* ignore */ }
  };

  if (document.body) start();
  else if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', start, { once: true });
  }
}

