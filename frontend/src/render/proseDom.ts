/** Update renderer-owned prose in place while retaining unchanged blocks,
 * inline nodes, text selections, table scroll/focus and rich widgets. */
const TABLE_ROOT = '.ds-table-wrap, .ds-table';

function asElement(node: Node): Element | null {
  return node.nodeType === 1 ? (node as Element) : null;
}

function containsTable(element: Element | null): boolean {
  return !!element && (element.matches(TABLE_ROOT) || !!element.querySelector('.ds-table'));
}

function syncAttributes(current: Element, next: Element): void {
  for (const attribute of [...current.attributes]) {
    if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  }
  for (const attribute of [...next.attributes]) {
    if (current.getAttribute(attribute.name) !== attribute.value)
      current.setAttribute(attribute.name, attribute.value);
  }
}

function replaceWithClone(current: Node, next: Node): void {
  // The root is a clone of the same host; replacement only handles its children.
  if (current.parentNode) current.parentNode.replaceChild(next.cloneNode(true), current);
}

/* Update only the changed middle of a text node. Keeping the node itself
   (rather than replacing it) preserves a selection anchor inside a growing
   paragraph and avoids rebuilding the surrounding inline markup. */
function syncTextData(current: Node, next: Node): void {
  const target = current as CharacterData;
  const oldValue = target.nodeValue || '';
  const nextValue = next.nodeValue || '';
  if (oldValue === nextValue) return;
  let prefix = 0;
  const maxPrefix = Math.min(oldValue.length, nextValue.length);
  while (prefix < maxPrefix && oldValue.charCodeAt(prefix) === nextValue.charCodeAt(prefix)) {
    prefix += 1;
  }
  let suffix = 0;
  const maxSuffix = Math.min(oldValue.length - prefix, nextValue.length - prefix);
  while (
    suffix < maxSuffix &&
    oldValue.charCodeAt(oldValue.length - 1 - suffix) ===
      nextValue.charCodeAt(nextValue.length - 1 - suffix)
  ) {
    suffix += 1;
  }
  target.replaceData(
    prefix,
    oldValue.length - prefix - suffix,
    nextValue.slice(prefix, nextValue.length - suffix),
  );
}

function compatibleNode(current: Node, next: Node): boolean {
  return current.nodeType === next.nodeType && current.nodeName === next.nodeName;
}

function reconcile(current: Node, next: Node, inTable = false, root = false): void {
  if (current.isEqualNode(next)) return;
  const currentElement = asElement(current);
  const nextElement = asElement(next);
  if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
    replaceWithClone(current, next);
    return;
  }
  if (current.nodeType === 3 || current.nodeType === 8) {
    syncTextData(current, next);
    return;
  }
  if (!currentElement || !nextElement) {
    replaceWithClone(current, next);
    return;
  }

  const tablePath = inTable || containsTable(nextElement);
  syncAttributes(currentElement, nextElement);
  const children = [...next.childNodes];
  const existingChildren = [...current.childNodes];
  const withinTable = inTable || !!nextElement.matches(TABLE_ROOT);

  /* Tables keep the index-based append/remove walk: a growing row must not
     lose its table, focus or scroll offset. Outside tables, align the common
     prefix and suffix first, then replace only the middle. That preserves a
     paragraph and its text node when an inline element starts or ends in the
     middle of a sentence, instead of rebuilding the whole paragraph. */
  if (!tablePath || root) {
    let prefix = 0;
    const maxPrefix = Math.min(existingChildren.length, children.length);
    while (prefix < maxPrefix && compatibleNode(existingChildren[prefix], children[prefix])) {
      reconcile(existingChildren[prefix], children[prefix], inTable);
      prefix += 1;
    }
    let currentEnd = existingChildren.length - 1;
    let nextEnd = children.length - 1;
    while (
      currentEnd >= prefix &&
      nextEnd >= prefix &&
      compatibleNode(existingChildren[currentEnd], children[nextEnd])
    ) {
      reconcile(existingChildren[currentEnd], children[nextEnd], inTable);
      currentEnd -= 1;
      nextEnd -= 1;
    }
    /* Anchor insertion at the first surviving suffix node, not at a node
       that the removal loop is about to detach. */
    const reference = existingChildren[currentEnd + 1] || null;
    for (let index = prefix; index <= currentEnd; index++)
      current.removeChild(existingChildren[index]);
    for (let index = prefix; index <= nextEnd; index++) {
      current.insertBefore(children[index].cloneNode(true), reference);
    }
    return;
  }

  children.forEach((child, index) => {
    const existing = existingChildren[index];
    if (existing) reconcile(existing, child, withinTable);
    else current.appendChild(child.cloneNode(true));
  });
  while (current.childNodes.length > children.length) current.removeChild(current.lastChild!);
}

export function updateProseDom(host: HTMLElement, html: string): void {
  const template = host.ownerDocument.createElement('template');
  template.innerHTML = html;
  const next = host.cloneNode(false) as HTMLElement;
  next.append(template.content);
  reconcile(host, next, false, true);
}
