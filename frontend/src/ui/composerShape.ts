import { reportSwallow } from '../util/reportSwallow.ts';



/* ui/composerShape.ts — JS-owned composer shape flags (replaces :has hot path).
 *
 * The two-row composer layouts used to be keyed off
 * `:has(.composer-plugin-chips)` and `:has(> .attachment-chips:not(.hidden))`.
 * Those selectors force the browser to re-evaluate the whole composer
 * subtree on every DOM insertion (every streamed token mounts elsewhere,
 * but :has still invalidates). The flags below are the same state as
 * cheap classes toggled synchronously from the owners + one
 * MutationObserver fallback, so CSS matches a single class on the shell.
 *
 * Flags:
 *   .has-plugin-chips — a .composer-plugin-chips node is mounted
 *   .has-attachments  — .attachment-chips is mounted and not .hidden
 *
 * Install once via installComposerShapeMirror(); syncComposerShellFlags()
 * is exported for direct calls (React effects, tests).
 */

function findComposerShells(scope: Document | Element) {
  if (scope instanceof Element && scope.classList.contains('composer-shell')) {
    return [scope];
  }
  if (typeof scope.querySelectorAll !== 'function') return [];
  try { return Array.from(scope.querySelectorAll('.composer-shell')); }
  catch (_) { return []; /* selector unsupported */ }
}

function visibleAttachmentChips(shell: Element) {
  const chips = shell.querySelector(':scope > .attachment-chips');
  if (!chips || chips.classList.contains('hidden')) return false;
  if (chips.childElementCount > 0) return true;
  // React may render whitespace only into an empty-but-visible host.
  return (chips.textContent || '').trim().length > 0;
}

function readComposerShape(shell: Element) {
  let hasPlugins = false;
  let hasFiles = false;
  let hasQueue = false;
  try {
    hasPlugins = !!shell.querySelector('.composer-plugin-chips');
    hasFiles = visibleAttachmentChips(shell);
    hasQueue = !!shell.querySelector('.composer-queue-banner');
  } catch (_) {
    reportSwallow(_, 'empty catch: ui/composerShape.ts:47');
    /* detached node */
  }
  return { hasPlugins: hasPlugins, hasFiles: hasFiles, hasQueue: hasQueue };
}

function syncShellFlags(shell: Element) {
  const shape = readComposerShape(shell);
  /* toggle(name, force) is a true no-op when the class already matches, so
     it emits no MutationRecord. add()/remove() always mutate the attribute
     (even for an existing/absent token) and would re-trigger the document
     observer below every frame — an idle feedback loop. */
  shell.classList.toggle('has-plugin-chips', shape.hasPlugins);
  shell.classList.toggle('has-attachments', shape.hasFiles);
  shell.classList.toggle('has-queue', shape.hasQueue);
}

export function syncComposerShellFlags(root?: Document | Element | null) {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope) return;
  const shells = findComposerShells(scope);
  // Document scope: also cover the singleton by id (fast path, no query).
  if (!shells.length && typeof document !== 'undefined' && scope === document) {
    const single = document.getElementById('composerInputWrap');
    if (single) shells.push(single);
  }
  for (let s = 0; s < shells.length; s++) syncShellFlags(shells[s]);
}

let _installed = false;

export function installComposerShapeMirror() {
  if (_installed) return () => undefined;
  if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return () => undefined;
  _installed = true;
  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      syncComposerShellFlags(document);
    });
  }
  const observer = new MutationObserver(function () {
    schedule();
  });
  const observed = new Set<Element>();
  function observeShell(shell: Element) {
    if (observed.has(shell)) return;
    observed.add(shell);
    observer.observe(shell, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }
  function observeKnownShells(): boolean {
    let found = false;
    for (const shell of findComposerShells(document)) {
      observeShell(shell);
      found = true;
    }
    // Document scope: also cover the singleton by id (fast path, no query).
    const single = document.getElementById('composerInputWrap');
    if (single) {
      observeShell(single);
      found = true;
    }
    return found;
  }
  /* The shells are static app chrome (index.html: .composer-shell on
     #composerInputWrap), so observing them directly covers every chip
     mount/unmount and .hidden toggle. Streaming mutations elsewhere (the
     message list) no longer reach this observer at all — the old
     document-wide watch woke for every streamed token and paid a closest()
     ancestor walk per record (audit R3). syncShellFlags uses
     classList.toggle(name, force), which no-ops on a matching class, so the
     shell's own attribute mutations cannot feed back into a loop.
     If no shell exists yet (deferred mount), keep a document watch only
     until the first sync finds one, then drop it. */
  let bodyWatch: MutationObserver | null = null;
  if (!observeKnownShells()) {
    bodyWatch = new MutationObserver(function () {
      schedule();
      if (observeKnownShells() && bodyWatch) {
        bodyWatch.disconnect();
        bodyWatch = null;
      }
    });
    bodyWatch.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }
  // Initial paint: stamp flags before first frame so no :has fallback flash.
  syncComposerShellFlags(document);
  return function () {
    try { observer.disconnect(); } catch (error) { reportSwallow(error, 'ui/composerShape.ts:109', 'expected'); }
    if (bodyWatch) bodyWatch.disconnect();
    _installed = false;
  };
}
