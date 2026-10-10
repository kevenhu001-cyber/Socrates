/* ui/composerShape.js — JS-owned composer shape flags (replaces :has hot path).
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

export function syncComposerShellFlags(root) {
  var scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope) return;
  var shells = [];
  if (scope.classList && scope.classList.contains('composer-shell')) {
    shells.push(scope);
  } else if (typeof scope.querySelectorAll === 'function') {
    try {
      var found = scope.querySelectorAll('.composer-shell');
      for (var i = 0; i < found.length; i++) shells.push(found[i]);
    } catch (_) { /* selector unsupported */ }
  }
  // Document scope: also cover the singleton by id (fast path, no query).
  if (!shells.length && typeof document !== 'undefined' && scope === document) {
    var single = document.getElementById('composerInputWrap');
    if (single) shells.push(single);
  }
  for (var s = 0; s < shells.length; s++) {
    var shell = shells[s];
    var hasPlugins = false;
    var hasFiles = false;
    try {
      hasPlugins = !!shell.querySelector('.composer-plugin-chips');
      var chips = shell.querySelector(':scope > .attachment-chips');
      hasFiles = !!chips && !chips.classList.contains('hidden') && chips.childElementCount > 0;
      // React attachment row toggles .hidden but keeps children during
      // exit; count children so an empty-but-visible host can't stick the flag.
      if (chips && !chips.classList.contains('hidden') && chips.childElementCount === 0) {
        // Fall back to text check: React may render whitespace only.
        hasFiles = (chips.textContent || '').trim().length > 0;
      }
    } catch (_) { /* detached node */ }
    /* toggle(name, force) is a true no-op when the class already matches, so
       it emits no MutationRecord. add()/remove() always mutate the attribute
       (even for an existing/absent token) and would re-trigger the document
       observer below every frame — an idle feedback loop. */
    shell.classList.toggle('has-plugin-chips', hasPlugins);
    shell.classList.toggle('has-attachments', hasFiles);
  }
}

var _installed = false;

export function installComposerShapeMirror() {
  if (_installed) return function () {};
  if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return function () {};
  _installed = true;
  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      syncComposerShellFlags(document);
    });
  }
  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      var t = m.target;
      if (!(t instanceof Element)) continue;
      if (t.closest && (t.closest('.composer-shell') || t.classList.contains('composer-shell'))) {
        schedule();
        return;
      }
      if (m.addedNodes && m.addedNodes.length) {
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n instanceof Element && n.closest && n.closest('.composer-shell')) {
            schedule();
            return;
          }
        }
      }
    }
  });
  try {
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  } catch (_) { /* observe failed */ }
  // Initial paint: stamp flags before first frame so no :has fallback flash.
  syncComposerShellFlags(document);
  return function () {
    try { observer.disconnect(); } catch (_) {}
    _installed = false;
  };
}
