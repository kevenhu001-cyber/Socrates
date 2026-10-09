import { esc } from "../render/helpers.js";
import { apiFetch } from "../util/api.js";
import { trTool } from "./toolCardHelpers.js";
import { openArtifactPreview } from "./artifactPreview.js";

/* Build the diagnostic placeholder shown when an inline artifact
   fails to load. */
export function makeArtifactError(fileId, mimeType, url, reason) {
  const box = document.createElement("div");
  box.className = "artifact-error";
  box.innerHTML =
    '<svg class="artifact-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
      '<circle cx="9" cy="9" r="2"/>' +
      '<path d="m21 15-5-5L5 21"/>' +
    '</svg>' +
    `<span class="artifact-error-text">图片产物暂时无法加载</span>` +
    '<a class="artifact-error-open" target="_blank" rel="noopener" download>打开原文件</a>' +
    '<button type="button" class="artifact-error-retry">重试</button>' +
    `<details class="artifact-error-detail"><summary>查看详情</summary><code>${esc(reason || 'load failed')} · ${esc(fileId)}</code></details>`;
  box.querySelector('.artifact-error-open').href = url;
  box.querySelector(".artifact-error-retry").addEventListener("click", function () {
    const fresh = document.createElement("img");
    fresh.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + "_=" + Date.now();
    fresh.alt = "execution artifact";
    fresh.className = "exec-artifact-image";
    fresh.addEventListener("load", function () { fresh.classList.add("loaded"); });
    fresh.addEventListener("error", function () { fresh.replaceWith(makeArtifactError(fileId, mimeType, url, "load failed")); });
    if (box.parentNode) box.parentNode.replaceChild(fresh, box);
  });
  return box;
}

/* Append an inline artifact (matplotlib PNG, CSV download link, etc.)
   produced by the code interpreter to the last tool card's output.
   The rendering path is:
     1. Show a sized skeleton (matched to the artifact's natural
        ratio when we can read it) so the card height doesn't jump
        when the image arrives.
     2. Lazy-preload via Image() so we know load/error state before
        touching the DOM, and so we can fall back gracefully when
        the network is down.
     3. On error, show a structured makeArtifactError with a Retry
        button instead of a broken-icon.
     4. Apply a fade-in transition so the image appearing doesn't
        visually "pop" — this matters for chat streams where the
        user is reading and a sudden large image is jarring. */
export function appendInlineArtifact(fileId, mimeType, outEl, displayName) {
  const t = window.t || function (k) { return k; };
  const out = outEl || document.querySelector(".msg.assistant .agent-tool-card:last-child .agent-tool-out");
  if (!out || !fileId) return;
  /* P_artifact-image-defer — generated images are no longer rendered
     automatically. The assistant must explicitly reference them in
     prose (e.g. `![description](/api/files/<id>/raw)`) so the user only
     sees images the model chooses to show. */
  if (/^image\//i.test(mimeType || "")) return;
  const url = "/api/files/" + encodeURIComponent(fileId) + "/raw";
  const selectorId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(String(fileId)) : String(fileId).replace(/[^a-zA-Z0-9_-]/g, '');
  /* P_artifact-doc-wide-dedup — a single artifact fileId should
     render exactly once per message, regardless of how many
     mount points call us (tool card output + message body, on
     every recordToolResult reentry, on SSE retries). The previous
     per-out check let the same image appear twice (tool card +
     inline) and re-trigger requestImage() in parallel, producing
     the retry-storm flicker pattern. */
  if (document.querySelector(`[data-artifact-id="${selectorId}"]`)) return;
  if ((mimeType || "").indexOf("image/") === 0) {
    appendInlineImage(fileId, mimeType, url, out, displayName);
  } else if ((mimeType || "").indexOf("text/html") === 0) {
    appendInlineHtml(fileId, mimeType, url, out, displayName);
  } else {
    appendInlineFileLink(fileId, mimeType, url, out, t, displayName);
  }
}

function appendInlineImage(fileId, mimeType, url, out, artifactName) {
  const wrap = document.createElement("figure");
  wrap.className = "exec-artifact";
  wrap.dataset.artifactId = String(fileId);
  const skeleton = document.createElement("div");
  skeleton.className = "exec-artifact-skeleton";
  skeleton.innerHTML = '<span class="exec-artifact-skeleton-pulse"></span>';
  wrap.appendChild(skeleton);

  /* P_artifact-scaffold — actions overlay (fullscreen + download) sits
     in the top-right of the figure so it visually parallels the viz
     buttons. Always visible at low opacity, brightens on hover. */
  const actions = document.createElement("div");
  actions.className = "exec-artifact-actions";
  const fsLabel = trTool('chrome.fullscreen', 'Fullscreen');
  const dlLabel = trTool('chrome.download', 'Download');
  actions.innerHTML =
    '<button type="button" class="exec-artifact-btn" title="' + esc(fsLabel) + '" aria-label="' + esc(fsLabel) + '" data-i18n-title="chrome.fullscreen" data-i18n-aria="chrome.fullscreen">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>' +
    '</button>' +
    '<a class="exec-artifact-btn" href="' + esc(url) + '" download target="_blank" rel="noopener" title="' + esc(dlLabel) + '" aria-label="' + esc(dlLabel) + '" data-i18n-title="chrome.download" data-i18n-aria="chrome.download">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>' +
    '</a>';
  wrap.appendChild(actions);

  const img = new Image();
  img.alt = "execution artifact";
  img.className = "exec-artifact-image";
  img.loading = "eager";
  img.decoding = "async";
  // Cache-bust so the browser doesn't reuse a stale 404 after a
  // previous failed load (e.g. worker regenerated the artifact
  // and re-uploaded it under the same id).
  let loadTimer = null;
  let attempts = 0;
  function requestImage() {
    clearTimeout(loadTimer);
    img.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + "cb=" + Date.now();
    loadTimer = setTimeout(function () {
      if (!wrap.parentNode || img.complete) return;
      if (attempts++ === 0) return requestImage();
      try { wrap.parentNode.replaceChild(makeArtifactError(fileId, mimeType, url, "load timeout after retry"), wrap); } catch (_) {}
    }, 10000);
  }

  img.addEventListener("load", function () {
    clearTimeout(loadTimer);
    if (!wrap.parentNode) return;
    if (skeleton.parentNode) skeleton.parentNode.removeChild(skeleton);
    img.style.display = "";
    img.classList.add("loaded");
    wrap.appendChild(img);
    /* P_artifact-meta — once the image is on the page we can read
       its natural size to render a tight metadata strip under the
       figure. We don't have the byte count client-side, so size
       is a string from naturalWidth × naturalHeight. The filename
       comes from the URL's last path segment (fileId is opaque,
       but the original name survives in the `files` table — fetch
       metadata lazily so we don't block the render). */
    var meta = document.createElement("figcaption");
    meta.className = "exec-artifact-meta";
    var name = document.createElement("span");
    name.className = "exec-artifact-meta-name";
    name.textContent = (artifactName || displayName(fileId, mimeType) || 'artifact');
    var size = document.createElement("span");
    size.className = "exec-artifact-meta-size";
    size.textContent = (img.naturalWidth ? img.naturalWidth + '×' + img.naturalHeight + ' px' : 'image');
    meta.appendChild(name);
    meta.appendChild(size);
    wrap.appendChild(meta);
    if (typeof apiFetch === "function") {
      try {
        apiFetch("/api/files/" + encodeURIComponent(fileId))
          .then(function (metaRow) {
            if (metaRow && metaRow.name) name.textContent = metaRow.name;
            if (metaRow && typeof metaRow.size === "number") {
              var cur = size.textContent;
              size.textContent = cur + ' · ' + formatBytes(metaRow.size);
            }
          })
          .catch(function () {});
      } catch (_) {}
    }
  });
  img.addEventListener("error", function () {
    clearTimeout(loadTimer);
    if (attempts++ === 0) return requestImage();
    try {
      if (wrap.parentNode) wrap.parentNode.replaceChild(makeArtifactError(fileId, mimeType, url, "load failed after retry"), wrap);
    } catch (_) {}
  });
  img.style.display = "none";
  /* Image and expand affordances open the shared Artifacts drawer. */
  function openLightbox(ev) {
    if (ev) ev.preventDefault();
    var fullSrc = url + (url.indexOf("?") >= 0 ? "&" : "?") + "cb=" + Date.now();
    openArtifactPreview({
      url: fullSrc,
      mimeType: mimeType,
      name: artifactName || displayName(fileId, mimeType) || 'Artifact'
    });
  }
  wrap.addEventListener("click", function (ev) {
    var t = ev && ev.target;
    if (!t) return;
    /* The download action is an <a download>: let its default behaviour
       run (nothing to intercept). The expand action is the <button>. */
    if (t.closest && t.closest('a.exec-artifact-btn')) return;
    if (t.closest && t.closest('button.exec-artifact-btn')) {
      openLightbox(ev);
      return;
    }
    /* Image click → fullscreen. */
    if (t === img) openLightbox(ev);
  });
  out.appendChild(wrap);
  requestImage();
}

function appendInlineHtml(fileId, mimeType, url, out, artifactName) {
  const t = window.t || function (key) { return key; };
  const wrap = document.createElement('figure');
  wrap.className = 'exec-artifact exec-artifact-html';
  wrap.dataset.artifactId = String(fileId);

  const frame = document.createElement('iframe');
  frame.className = 'exec-artifact-html-frame';
  frame.src = url;
  frame.title = artifactName || t('artifact.htmlAlt');
  frame.loading = 'lazy';
  frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups');
  wrap.appendChild(frame);

  const caption = document.createElement('figcaption');
  caption.className = 'exec-artifact-meta';
  const name = document.createElement('span');
  name.className = 'exec-artifact-meta-name';
  name.textContent = artifactName || displayName(fileId, mimeType) || 'HTML';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'exec-artifact-open';
  open.textContent = t('artifact.openPreview');
  open.addEventListener('click', function () {
    openArtifactPreview({ url: url, mimeType: mimeType, name: name.textContent });
  });
  caption.appendChild(name);
  caption.appendChild(open);
  wrap.appendChild(caption);
  out.appendChild(wrap);
}

/* Best-effort display name for an artifact. fileId is opaque so we
   fall back to a short id-derived label; the real name arrives via
   the lazy /api/files/:id fetch above. */
function displayName(fileId, mimeType) {
  if (!fileId) return '';
  var short = String(fileId).split('-')[0] || String(fileId);
  if (mimeType && /^image\//.test(mimeType)) return short + (mimeType === 'image/png' ? '.png' : mimeType === 'image/jpeg' ? '.jpg' : '.img');
  return short;
}

/* Format a byte count as a short human string (1.4 KB / 12.3 MB). */
function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
  return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function appendInlineFileLink(fileId, mimeType, url, out, t, displayName) {
  const a = document.createElement("a");
  a.href = url;
  a.textContent = displayName || t("common.downloadFile").replace("{type}", mimeType || "file");
  a.target = "_blank";
  a.rel = "noopener";
  a.className = "exec-artifact-link";
  a.download = "";
  if (typeof fetch === "function") {
    try {
      fetch(url, { method: "HEAD", credentials: "same-origin" }).then(function (r) {
        if (!r.ok && a.parentNode) {
          a.parentNode.replaceChild(makeArtifactError(fileId, mimeType, url, "HTTP " + r.status), a);
        }
      }).catch(function () {});
    } catch (_) {}
  }
  out.appendChild(a);
}
