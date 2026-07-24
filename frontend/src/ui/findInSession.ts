/* ui/findInSession.ts — In-session find (Ctrl-F / Cmd-F).
 *
 * A lightweight, browser-style "find on page" bar scoped to the CURRENT
 * conversation's message list (#msgList). This is deliberately distinct
 * from the global Cmd-K palette (ui/cmdK.js): Cmd-K fuzzy-searches across
 * ALL sessions and messages via fuse.js + /api/search, whereas this
 * highlights literal matches inside the messages already on screen and
 * lets the user step through them with Enter / Shift+Enter (or the up/
 * down buttons).
 *
 * Design notes:
 *   - We never touch the global Cmd-K index, so the two features stay
 *     independent (P0.2 of the roadmap: "新建独立模块，不污染全局 Cmd-K 索引").
 *   - Highlighting walks TEXT nodes under each `.msg-body` and wraps the
 *     matched substrings in <mark class="find-hl">. This preserves the
 *     rendered markdown / KaTeX / code DOM (no re-render), and unwinds
 *     cleanly on close by replacing every mark with its text + normalize().
 *
 * Bridge: windowExports.js exposes openFindInSession / closeFindInSession
 * / onFindInput / onFindKey / findNext / findPrev / isFindOpen so the
 * index.html inline handlers resolve.
 */

var _findMatches: HTMLElement[] = []; /* <mark class="find-hl"> nodes, in document order */
var _findIndex = -1;   /* index of the active match, or -1 when none */
var _findQuery = "";   /* the current (trimmed) query */

function msgList(): HTMLElement | null { return document.getElementById("msgList"); }
function findBar(): HTMLElement | null { return document.getElementById("findBar"); }
function findInput(): HTMLInputElement | null { return document.getElementById("findInput") as HTMLInputElement | null; }
function findCount(): HTMLElement | null { return document.getElementById("findCount"); }

/* Remove every highlight mark and merge the split text nodes back so a
   subsequent search sees clean, contiguous text. */
function clearHighlights(): void {
  var list = msgList();
  if (list) {
    var marks = list.querySelectorAll("mark.find-hl");
    marks.forEach(function (m) {
      var parent = m.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(m.textContent || ""), m);
      /* Merge the adjacent text nodes the split created so the next
         query can match across the (now-restored) boundary. */
      try { parent.normalize(); } catch (_) {}
    });
  }
  _findMatches = [];
  _findIndex = -1;
}

/* Wrap every case-insensitive occurrence of `needle` inside a single
   text node with <mark class="find-hl">. Replaces the text node with a
   fragment so surrounding markup is untouched. */
function wrapMatchesInTextNode(node: Text, needle: string): void {
  var text = node.nodeValue || "";
  var lower = text.toLowerCase();
  var idx = lower.indexOf(needle);
  if (idx < 0) return;
  var frag = document.createDocumentFragment();
  var pos = 0;
  while (idx >= 0) {
    if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)));
    var mark = document.createElement("mark");
    mark.className = "find-hl";
    mark.textContent = text.slice(idx, idx + needle.length);
    frag.appendChild(mark);
    pos = idx + needle.length;
    idx = lower.indexOf(needle, pos);
  }
  if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
  if (node.parentNode) node.parentNode.replaceChild(frag, node);
}

function highlightMatches(query: string): void {
  clearHighlights();
  _findQuery = query || "";
  var list = msgList();
  if (!_findQuery || !list) { updateCount(); return; }
  var needle = _findQuery.toLowerCase();
  /* Collect candidate text nodes first — mutating the DOM while the
     TreeWalker is live would invalidate the traversal. */
  var textNodes: Text[] = [];
  var bodies = list.querySelectorAll(".msg-body");
  bodies.forEach(function (body) {
    var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node: Node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = node.parentNode;
        if (p && (p.nodeName === "SCRIPT" || p.nodeName === "STYLE" || p.nodeName === "TEXTAREA")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var n: Node | null;
    while ((n = walker.nextNode())) textNodes.push(n as Text);
  });
  textNodes.forEach(function (node) { wrapMatchesInTextNode(node, needle); });
  _findMatches = Array.prototype.slice.call(list.querySelectorAll("mark.find-hl"));
  if (_findMatches.length) setActive(0);
  updateCount();
}

/* Move the active highlight to index `i` (wrapping around), scroll it
   into view, and refresh the "n/m" counter. */
function setActive(i: number): void {
  if (!_findMatches.length) { _findIndex = -1; updateCount(); return; }
  if (_findIndex >= 0 && _findMatches[_findIndex]) {
    _findMatches[_findIndex].classList.remove("find-hl-active");
  }
  var len = _findMatches.length;
  _findIndex = ((i % len) + len) % len;
  var el = _findMatches[_findIndex];
  if (el) {
    el.classList.add("find-hl-active");
    try { el.scrollIntoView({ block: "center", behavior: "smooth" }); }
    catch (_) { try { el.scrollIntoView(); } catch (__) {} }
  }
  updateCount();
}

function updateCount(): void {
  var c = findCount();
  if (!c) return;
  if (!_findQuery) { c.textContent = ""; return; }
  c.textContent = _findMatches.length ? (_findIndex + 1) + "/" + _findMatches.length : "0/0";
}

export function findNext(): void { if (_findMatches.length) setActive(_findIndex + 1); }
export function findPrev(): void { if (_findMatches.length) setActive(_findIndex - 1); }

export function onFindInput(q: string): void { highlightMatches((q || "").trim()); }

export function onFindKey(ev: KeyboardEvent): void {
  if (ev.key === "Escape") {
    ev.preventDefault();
    closeFindInSession();
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    if (ev.shiftKey) findPrev(); else findNext();
  }
}

export function isFindOpen(): boolean {
  var bar = findBar();
  return !!(bar && !bar.classList.contains("hidden"));
}

export function openFindInSession(): void {
  var bar = findBar();
  if (!bar) return;
  bar.classList.remove("hidden");
  var input = findInput();
  if (input) {
    setTimeout(function () { try { input!.focus(); input!.select(); } catch (_) {} }, 0);
    var q = (input.value || "").trim();
    if (q) highlightMatches(q);
  }
}

export function closeFindInSession(): void {
  var bar = findBar();
  if (bar) bar.classList.add("hidden");
  clearHighlights();
  _findQuery = "";
  updateCount();
}
