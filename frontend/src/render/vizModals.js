/* Fullscreen and source dialogs for sandboxed visualization cards. */

export function decodeSrcdoc(srcdoc) {
  return String(srcdoc || '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function openVizModal(srcdoc, title) {
  if (!srcdoc) return;
  // srcdoc is HTML-attribute-encoded when it comes from
  // data-srcdoc. Decode it back to raw HTML before stuffing it
  // into the modal iframe, which expects a raw srcdoc value.
  var decoded = decodeSrcdoc(srcdoc);
  var opener = document.activeElement;
  var modal = document.createElement("div");
  modal.className = "viz-modal-backdrop";
  modal.onclick = function (e) { if (e.target === modal) close(); };
  function close() {
    modal.remove();
    document.removeEventListener("keydown", onKey);
    if (opener && typeof opener.focus === "function") opener.focus();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  var dialog = document.createElement("div");
  dialog.className = "viz-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "Canvas fullscreen");
  dialog.setAttribute("aria-modal", "true");

  var head = document.createElement("div");
  head.className = "viz-modal-head";

  var titleEl = document.createElement("span");
  titleEl.className = "viz-modal-title";
  titleEl.textContent = title || "Canvas";
  head.appendChild(titleEl);

  var closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "viz-modal-close";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  closeButton.addEventListener("click", close);
  head.appendChild(closeButton);

  var modalBody = document.createElement("div");
  modalBody.className = "viz-modal-body";

  var iframe = document.createElement("iframe");
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
  closeButton.focus();
}

/* P_modal-raw — like openVizModal but the body is raw HTML, not a
   sandboxed iframe. Used by the image lightbox (matplotlib output)
   and the code-block fullscreen view where we don't need sandboxing
   — the content is our own, not user-input. Shares the same shell,
   close button, Esc handler, and click-outside-to-close behaviour
   as the sandboxed version so the two modals feel identical. */
export function openVizModalRaw(html, title) {
  if (!html) return;
  var opener = document.activeElement;
  var modal = document.createElement("div");
  modal.className = "viz-modal-backdrop";
  modal.onclick = function (e) { if (e.target === modal) close(); };
  function close() {
    modal.remove();
    document.removeEventListener("keydown", onKey);
    if (opener && typeof opener.focus === "function") opener.focus();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  var dialog = document.createElement("div");
  dialog.className = "viz-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", title || "Fullscreen");
  dialog.setAttribute("aria-modal", "true");

  var head = document.createElement("div");
  head.className = "viz-modal-head";
  var titleEl = document.createElement("span");
  titleEl.className = "viz-modal-title";
  titleEl.textContent = title || "Fullscreen";
  head.appendChild(titleEl);

  var closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "viz-modal-close";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  closeButton.addEventListener("click", close);
  head.appendChild(closeButton);

  var modalBody = document.createElement("div");
  modalBody.className = "viz-modal-body viz-modal-body-raw";
  modalBody.innerHTML = html;

  dialog.appendChild(head);
  dialog.appendChild(modalBody);
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  closeButton.focus();
}

export function openVizSourceModal(srcdoc, title) {
  if (!srcdoc) return;
  var decoded = decodeSrcdoc(srcdoc);
  var opener = document.activeElement;
  var modal = document.createElement("div");
  modal.className = "viz-modal-backdrop";
  function close() {
    modal.remove();
    document.removeEventListener("keydown", onKey);
    if (opener && typeof opener.focus === "function") opener.focus();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  modal.addEventListener("click", function (event) { if (event.target === modal) close(); });

  var dialog = document.createElement("div");
  dialog.className = "viz-modal viz-source-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "Canvas source");
  dialog.setAttribute("aria-modal", "true");

  var head = document.createElement("div");
  head.className = "viz-modal-head";
  var titleEl = document.createElement("span");
  titleEl.className = "viz-modal-title";
  titleEl.textContent = (title || "Canvas") + " source";
  head.appendChild(titleEl);

  var copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "viz-source-copy";
  copyButton.textContent = "Copy source";
  copyButton.addEventListener("click", function () {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") return;
    navigator.clipboard.writeText(decoded).then(function () {
      copyButton.textContent = "Copied";
      setTimeout(function () { copyButton.textContent = "Copy source"; }, 1200);
    }).catch(function () { copyButton.textContent = "Copy failed"; });
  });
  head.appendChild(copyButton);

  var closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "viz-modal-close";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  closeButton.addEventListener("click", close);
  head.appendChild(closeButton);

  var body = document.createElement("div");
  body.className = "viz-modal-body viz-source-body";
  var pre = document.createElement("pre");
  pre.className = "viz-source-code";
  pre.textContent = decoded;
  body.appendChild(pre);

  dialog.appendChild(head);
  dialog.appendChild(body);
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  closeButton.focus();
}
