/* Fullscreen and source dialogs for sandboxed visualization cards. */
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { mountOwnedRoot } from '../react/lib/boot/ownedRoot';
import { VizModalActions } from '../react/visualization/VizModalActions.tsx';

function mountModalActions(host: HTMLElement, onClose: () => void, onCopy?: () => Promise<void>): () => void {
  const content = createElement(VizModalActions, { onClose, onCopy });
  const root = mountOwnedRoot(host, 'viz-modal-actions', content);
  flushSync(() => root.render(content));
  return () => root.destroy();
}

export function decodeSrcdoc(srcdoc: string | null | undefined): string {
  return String(srcdoc || '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function openVizModal(srcdoc: string | null | undefined, title?: string): void {
  if (!srcdoc) return;
  // srcdoc is HTML-attribute-encoded when it comes from
  // data-srcdoc. Decode it back to raw HTML before stuffing it
  // into the modal iframe, which expects a raw srcdoc value.
  const decoded = decodeSrcdoc(srcdoc);
  const opener = document.activeElement as HTMLElement | null;
  const modal = document.createElement("div");
  modal.className = "viz-modal-backdrop";
  modal.onclick = function (e) { if (e.target === modal) close(); };
  let disposeActions: (() => void) | null = null;
  function close(): void {
    disposeActions?.();
    modal.remove();
    document.removeEventListener("keydown", onKey);
    if (opener && typeof opener.focus === "function") opener.focus();
  }
  function onKey(e: KeyboardEvent): void { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  const dialog = document.createElement("div");
  dialog.className = "viz-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "Canvas fullscreen");
  dialog.setAttribute("aria-modal", "true");

  const head = document.createElement("div");
  head.className = "viz-modal-head";

  const titleEl = document.createElement("span");
  titleEl.className = "viz-modal-title";
  titleEl.textContent = title || "Canvas";
  head.appendChild(titleEl);

  const actions = document.createElement("div");
  actions.className = "viz-modal-actions";
  head.appendChild(actions);

  const modalBody = document.createElement("div");
  modalBody.className = "viz-modal-body";

  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("title", "Canvas fullscreen");
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "0";
  iframe.style.background = "transparent";
  iframe.style.display = "block";
  iframe.srcdoc = decoded;
  modalBody.appendChild(iframe);

  dialog.appendChild(head);
  dialog.appendChild(modalBody);
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  disposeActions = mountModalActions(actions, close);
  actions.querySelector("button")?.focus();
}

/* P_modal-raw — like openVizModal but the body is raw HTML, not a
   sandboxed iframe. Used by the image lightbox (matplotlib output)
   and the code-block fullscreen view where we don't need sandboxing
   — the content is our own, not user-input. Shares the same shell,
   close button, Esc handler, and click-outside-to-close behaviour
   as the sandboxed version so the two modals feel identical. */
export function openVizModalRaw(html: string | null | undefined, title?: string): void {
  if (!html) return;
  const opener = document.activeElement as HTMLElement | null;
  const modal = document.createElement("div");
  modal.className = "viz-modal-backdrop";
  let disposeActions: (() => void) | null = null;
  modal.onclick = function (e) { if (e.target === modal) close(); };
  function close(): void {
    disposeActions?.();
    modal.remove();
    document.removeEventListener("keydown", onKey);
    if (opener && typeof opener.focus === "function") opener.focus();
  }
  function onKey(e: KeyboardEvent): void { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  const dialog = document.createElement("div");
  dialog.className = "viz-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", title || "Fullscreen");
  dialog.setAttribute("aria-modal", "true");

  const head = document.createElement("div");
  head.className = "viz-modal-head";
  const titleEl = document.createElement("span");
  titleEl.className = "viz-modal-title";
  titleEl.textContent = title || "Fullscreen";
  head.appendChild(titleEl);

  const actions = document.createElement("div");
  actions.className = "viz-modal-actions";
  head.appendChild(actions);

  const modalBody = document.createElement("div");
  modalBody.className = "viz-modal-body viz-modal-body-raw";
  modalBody.innerHTML = html;

  dialog.appendChild(head);
  dialog.appendChild(modalBody);
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  disposeActions = mountModalActions(actions, close);
  actions.querySelector("button")?.focus();
}

export function openVizSourceModal(srcdoc: string | null | undefined, title?: string): void {
  if (!srcdoc) return;
  const decoded = decodeSrcdoc(srcdoc);
  const opener = document.activeElement as HTMLElement | null;
  const modal = document.createElement("div");
  modal.className = "viz-modal-backdrop";
  let disposeActions: (() => void) | null = null;
  function close(): void {
    disposeActions?.();
    modal.remove();
    document.removeEventListener("keydown", onKey);
    if (opener && typeof opener.focus === "function") opener.focus();
  }
  function onKey(e: KeyboardEvent): void { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  modal.addEventListener("click", function (event) { if (event.target === modal) close(); });

  const dialog = document.createElement("div");
  dialog.className = "viz-modal viz-source-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "Canvas source");
  dialog.setAttribute("aria-modal", "true");

  const head = document.createElement("div");
  head.className = "viz-modal-head";
  const titleEl = document.createElement("span");
  titleEl.className = "viz-modal-title";
  titleEl.textContent = (title || "Canvas") + " source";
  head.appendChild(titleEl);

  const actions = document.createElement("div");
  actions.className = "viz-modal-actions";
  head.appendChild(actions);

  const body = document.createElement("div");
  body.className = "viz-modal-body viz-source-body";
  const pre = document.createElement("pre");
  pre.className = "viz-source-code";
  pre.textContent = decoded;
  body.appendChild(pre);

  dialog.appendChild(head);
  dialog.appendChild(body);
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  disposeActions = mountModalActions(actions, close, async () => {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") throw new Error("Clipboard is unavailable");
    await navigator.clipboard.writeText(decoded);
  });
  actions.querySelector("button")?.focus();
}
