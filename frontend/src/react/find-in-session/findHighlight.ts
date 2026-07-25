/**
 * DOM text-node highlighting utility for the in-session find (Ctrl-F).
 *
 * Walks `.msg-body` text nodes under `#msgList`, wraps case-insensitive
 * matches in `<mark class="find-hl">`, and provides navigation helpers.
 *
 * This is deliberately procedural DOM manipulation — it operates on the
 * already-rendered markdown/KaTeX/code DOM without re-rendering.
 */

let _findMatches: HTMLElement[] = [];
let _findIndex = -1;
let _findQuery = '';

function msgList(): HTMLElement | null {
  return document.getElementById('msgList');
}

function wrapMatchesInTextNode(node: Text, needle: string): void {
  const text = node.nodeValue || '';
  const lower = text.toLowerCase();
  let idx = lower.indexOf(needle);
  if (idx < 0) return;
  const frag = document.createDocumentFragment();
  let pos = 0;
  while (idx >= 0) {
    if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)));
    const mark = document.createElement('mark');
    mark.className = 'find-hl';
    mark.textContent = text.slice(idx, idx + needle.length);
    frag.appendChild(mark);
    pos = idx + needle.length;
    idx = lower.indexOf(needle, pos);
  }
  if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
  if (node.parentNode) node.parentNode.replaceChild(frag, node);
}

function clearHighlights(): void {
  const list = msgList();
  if (list) {
    const marks = list.querySelectorAll('mark.find-hl');
    marks.forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(m.textContent || ''), m);
      try { parent.normalize(); } catch (_) { /* ignore */ }
    });
  }
  _findMatches = [];
  _findIndex = -1;
}

function highlightTextNodes(query: string): { matchCount: number } {
  clearHighlights();
  _findQuery = query;
  const list = msgList();
  if (!_findQuery || !list) return { matchCount: 0 };

  const needle = _findQuery.toLowerCase();
  const textNodes: Text[] = [];
  const bodies = list.querySelectorAll('.msg-body');
  bodies.forEach((body) => {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentNode;
        if (p && (p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE' || p.nodeName === 'TEXTAREA')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n: Node | null;
    while ((n = walker.nextNode())) textNodes.push(n as Text);
  });

  textNodes.forEach((node) => wrapMatchesInTextNode(node, needle));
  _findMatches = Array.prototype.slice.call(list.querySelectorAll('mark.find-hl'));
  if (_findMatches.length) setActive(0);

  return { matchCount: _findMatches.length };
}

function setActive(i: number): void {
  if (!_findMatches.length) {
    _findIndex = -1;
    return;
  }
  if (_findIndex >= 0 && _findMatches[_findIndex]) {
    _findMatches[_findIndex].classList.remove('find-hl-active');
  }
  const len = _findMatches.length;
  _findIndex = ((i % len) + len) % len;
  const el = _findMatches[_findIndex];
  if (el) {
    el.classList.add('find-hl-active');
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    catch (_) { try { el.scrollIntoView(); } catch (__) { /* ignore */ } }
  }
}

export function runHighlightQuery(query: string): { matchCount: number; activeIndex: number } {
  const { matchCount } = highlightTextNodes(query);
  return { matchCount, activeIndex: _findIndex };
}

export function navigateNext(): { matchCount: number; activeIndex: number } {
  if (_findMatches.length) setActive(_findIndex + 1);
  return { matchCount: _findMatches.length, activeIndex: _findIndex };
}

export function navigatePrev(): { matchCount: number; activeIndex: number } {
  if (_findMatches.length) setActive(_findIndex - 1);
  return { matchCount: _findMatches.length, activeIndex: _findIndex };
}

export function closeHighlights(): void {
  clearHighlights();
  _findQuery = '';
}
