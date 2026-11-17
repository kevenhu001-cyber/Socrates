/** Update renderer-owned prose while retaining table scroll/focus and unchanged
 * rows. Only table paths are reconciled; other rich surfaces keep their renderer. */
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

function reconcile(current: Node, next: Node, inTable = false, root = false): void {
  if (current.isEqualNode(next)) return;
  const currentElement = asElement(current);
  const nextElement = asElement(next);
  const tablePath = inTable || containsTable(nextElement);
  if (
    current.nodeType !== next.nodeType ||
    current.nodeName !== next.nodeName ||
    (!tablePath && !root)
  ) {
    // The root is a clone of the same host; replacement only handles its children.
    current.parentNode!.replaceChild(next.cloneNode(true), current);
    return;
  }
  if (current.nodeType === 3) {
    current.nodeValue = next.nodeValue;
    return;
  }
  if (currentElement && nextElement) syncAttributes(currentElement, nextElement);
  const children = [...next.childNodes];
  const withinTable = inTable || !!nextElement?.matches(TABLE_ROOT);
  children.forEach((child, index) => {
    const existing = current.childNodes[index];
    if (existing) reconcile(existing, child, withinTable);
    else current.appendChild(child.cloneNode(true));
  });
  while (current.childNodes.length > children.length) current.removeChild(current.lastChild!);
}

export function updateProseDom(host: HTMLElement, html: string): void {
  if (!host.querySelector('.ds-table')) {
    host.innerHTML = html;
    return;
  }
  const template = host.ownerDocument.createElement('template');
  template.innerHTML = html;
  const next = host.cloneNode(false) as HTMLElement;
  next.append(template.content);
  reconcile(host, next, false, true);
}
