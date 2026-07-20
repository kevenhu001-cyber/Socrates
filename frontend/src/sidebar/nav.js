import { toggleMorePopover } from "./morePopover.js";

var NAV_NAMES = ["library", "projects", "scheduled", "plugins", "more"];
var workspaceCache = { library: { files: [], artifacts: [], query: "", selection: {}, renameItem: null }, projects: [], tasks: [], connectors: [] };

function byId(id) { return document.getElementById(id); }
function t(key, fallback) { return typeof window.t === "function" ? window.t(key) : fallback; }
function esc(value) { return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function api(path, options) { return window.apiFetch(path, options); }
function toast(message) { if (typeof window.showToast === "function") window.showToast(message); }
function confirmAction(title, message) { return typeof window.showConfirm === "function" ? window.showConfirm(title, message, true) : Promise.resolve(window.confirm(message)); }
function icon(name) {
  var icons = {
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M8 2v4m8-4v4M3 10h18"/></svg>',
    app: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>'
  };
  return icons[name] || icons.file;
}
function connectorIcon(provider) {
  var icons = {
    github: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0c6.63 0 12 5.276 12 11.79-.001 5.067-3.29 9.567-8.175 11.187-.6.118-.825-.25-.825-.56 0-.398.015-1.665.015-3.242 0-1.105-.375-1.813-.81-2.181 2.67-.295 5.475-1.297 5.475-5.822 0-1.297-.465-2.344-1.23-3.169.12-.295.54-1.503-.12-3.125 0 0-1.005-.324-3.3 1.209a11.32 11.32 0 00-3-.398c-1.02 0-2.04.133-3 .398-2.295-1.518-3.3-1.209-3.3-1.209-.66 1.622-.24 2.83-.12 3.125-.765.825-1.23 1.887-1.23 3.169 0 4.51 2.79 5.527 5.46 5.822-.345.294-.66.81-.765 1.577-.69.31-2.415.81-3.495-.973-.225-.354-.9-1.223-1.845-1.209-1.005.015-.405.56.015.781.51.28 1.095 1.327 1.23 1.666.24.663 1.02 1.93 4.035 1.385 0 .988.015 1.916.015 2.196 0 .31-.225.664-.825.56C3.303 21.374-.003 16.867 0 11.791 0 5.276 5.37 0 12 0z"></path></svg>',
    feishu: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.944 18.587l-1.704-.445V10.01l1.824-.462c1-.254 1.84-.461 1.88-.453.032 0 .056 2.235.056 4.972v4.973l-.176-.008c-.104 0-.952-.207-1.88-.446z"/><path d="M7 16.542c0-2.736.024-4.98.064-4.98.032-.008.872.2 1.88.454l1.816.461-.016 4.05-.024 4.049-1.632.422c-.896.23-1.736.445-1.856.469L7 21.523v-4.98z"/><path d="M19.24 12.477c0-9.03.008-9.515.144-9.475.072.024.784.207 1.576.406.792.207 1.576.405 1.744.445l.296.08-.016 8.56-.024 8.568-1.624.414c-.888.23-1.728.437-1.856.47l-.24.055v-9.523z"/><path d="M1 12.509c0-4.678.024-8.505.064-8.505.032 0 .872.207 1.872.454l1.824.461v7.582c0 4.16-.016 7.574-.032 7.574-.024 0-.872.215-1.88.47L1 21.013v-8.505z"/></svg>',
    'baidu-netdisk': '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.859 11.735c1.017-1.71 4.059-3.083 6.202.286 1.579 2.284 4.284 4.397 4.284 4.397s2.027 1.601.73 4.684c-1.24 2.956-5.64 1.607-6.005 1.49l-.024-.009s-1.746-.568-3.776-.112c-2.026.458-3.773.286-3.773.286l-.045-.001c-.328-.01-2.38-.187-3.001-2.968-.675-3.028 2.365-4.687 2.592-4.968.226-.288 1.802-1.37 2.816-3.085zm.986 1.738v2.032h-1.64s-1.64.138-2.213 2.014c-.2 1.252.177 1.99.242 2.148.067.157.596 1.073 1.927 1.342h3.078v-7.514l-1.394-.022zm3.588 2.191l-1.44.024v3.956s.064.985 1.44 1.344h3.541v-5.3h-1.528v3.979h-1.46s-.466-.068-.553-.447v-3.556zM9.82 16.715v3.06H8.58s-.863-.045-1.126-1.049c-.136-.445.02-.959.088-1.16.063-.203.353-.671.951-.85H9.82zm9.525-9.036c2.086 0 2.646 2.06 2.646 2.742 0 .688.284 3.597-2.309 3.655-2.595.057-2.704-1.77-2.704-3.08 0-1.374.277-3.317 2.367-3.317zM4.24 6.08c1.523-.135 2.645 1.55 2.762 2.513.07.625.393 3.486-1.975 4-2.364.515-3.244-2.249-2.984-3.544 0 0 .28-2.797 2.197-2.969zm8.847-1.483c.14-1.31 1.69-3.316 2.931-3.028 1.236.285 2.367 1.944 2.137 3.37-.224 1.428-1.345 3.313-3.095 3.082-1.748-.226-2.143-1.823-1.973-3.424zM9.425 1c1.307 0 2.364 1.519 2.364 3.398 0 1.879-1.057 3.4-2.364 3.4s-2.367-1.521-2.367-3.4C7.058 2.518 8.118 1 9.425 1z"/></svg>',
    gitee: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path clip-rule="evenodd" d="M15.08 14.637c.218.815.46 1.648.72 2.513.238.79-.472 1.1-.755.356a66.148 66.148 0 01-.864-2.402c-1.542.775-3.08 1.421-4.823 2.148.697 2.563 1.34 4.707 2.34 6.744.1.003.2.004.302.004 6.628 0 12-5.373 12-12 0-2.38-.693-4.598-1.888-6.464-3.117.281-5.881.738-8.42 1.308a39.775 39.775 0 001.077 6.587 97.459 97.459 0 003.64-1.718c.92-.46 1.808-.49.312.683a37.134 37.134 0 01-3.642 2.24zm6.614-9.712A11.993 11.993 0 0013.557.1c-.101 1.617-.07 3.658.052 5.603 2.44-.37 5.094-.627 8.085-.778zM11.962 0a37.821 37.821 0 00.152 5.948c-1.69.298-3.28.656-4.818 1.074-.067-.767-.1-1.467-.1-2.077a.8.8 0 00-1.6 0c0 .742.061 1.594.172 2.518-.767.234-1.524.484-2.276.75a.8.8 0 00.533 1.508c.65-.23 1.306-.458 1.969-.681.32 1.96.807 4.126 1.368 6.21.098.363.202.726.31 1.086-2.067.712-4.176 1.29-6.105 1.597A11.945 11.945 0 010 12C0 5.385 5.352.02 11.962 0zM2.515 19.352a11.985 11.985 0 008.237 4.584c-.797-1.463-1.792-3.706-2.628-6.182-1.86.712-3.769 1.208-5.61 1.598zm11.27-5.484a39.054 39.054 0 01-1.232-5.302 15.441 15.441 0 01-.277-1.388A74.043 74.043 0 007.46 8.556c.248 1.93.666 4.124 1.246 6.277l.264.983v.002l.013.046a56.801 56.801 0 002.134-.849 174.05 174.05 0 002.666-1.147z"></path></svg>',
    onedrive: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.5 6.5a5.5 5.5 0 0 1 4.52 8.4c.01.06.02.12.02.18a4 4 0 0 1-3.1 3.9l-10.2.02A3.5 3.5 0 1 1 5.53 13a5.5 5.5 0 0 1 8.35-6.17A5.5 5.5 0 0 1 15.5 6.5z"/></svg>',
    outlook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.5 2a3.5 3.5 0 0 0-3.5 3.5h.01v5.73L5 10.5V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v.67L11 11.68V20H7.5a2 2 0 0 1-2-2v-1.01l-1.1.56A3.5 3.5 0 0 0 10 20h6.5a3.5 3.5 0 0 0 3.5-3.5V5.5A3.5 3.5 0 0 0 16.5 2H7.5zM7 13.4l-2.62 1.3A1.5 1.5 0 0 1 2 13.4V9.6a1.5 1.5 0 0 1 2.38-1.3L7 9.6v3.8z"/></svg>',
    notion: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path clip-rule="evenodd" d="M15.257.055l-13.31.98C.874 1.128.5 1.83.5 2.667v14.559c0 .654.233 1.213.794 1.96l3.129 4.06c.513.653.98.794 1.962.745l15.457-.932c1.307-.093 1.681-.7 1.681-1.727V4.954c0-.53-.21-.684-.829-1.135l-.106-.078L18.34.755c-1.027-.746-1.45-.84-3.083-.7zm-8.521 4.63c-1.263.086-1.549.105-2.266-.477L2.647 2.76c-.186-.187-.092-.42.375-.466l12.796-.933c1.074-.094 1.634.28 2.054.606l2.195 1.587c.093.047.326.326.047.326l-13.216.794-.162.01zM5.263 21.193V7.287c0-.606.187-.886.748-.933l15.176-.886c.515-.047.748.28.748.886v13.81c0 .609-.093 1.122-.934 1.168l-14.523.84c-.842.047-1.215-.232-1.215-.98zm14.338-13.16c.093.422 0 .842-.422.89l-.699.139v10.264c-.608.327-1.168.513-1.635.513-.747 0-.934-.232-1.495-.932l-4.576-7.185v6.952l1.448.327s0 .84-1.169.84l-3.221.186c-.094-.187 0-.654.327-.747l.84-.232V9.853L7.832 9.76c-.093-.42.14-1.026.794-1.073l3.456-.232 4.763 7.279v-6.44l-1.214-.14c-.094-.513.28-.887.747-.933l3.223-.187z"></path></svg>',
    zotero: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.231 2.462 7.18 20.923h14.564V24H2.256v-2.462L16.308 3.076H2.975V0h18.256v2.462z"/></svg>',
    arxiv: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.842 0a1.004 1.004 0 0 0-.922.608c-.154.368-.044.627.294 1.111l6.918 8.36-1.022 1.106a1.04 1.04 0 0 0 .003 1.423l1.23 1.313-5.44 6.445c-.28.299-.453.823-.297 1.199a1.025 1.025 0 0 0 .959.635.913.913 0 0 0 .689-.34l5.783-6.127 7.49 8.005a.853.853 0 0 0 .684.26.958.958 0 0 0 .878-.614c.157-.377-.017-.75-.306-1.14l-7.052-8.343 1.063-1.13a.963.963 0 0 0 .01-1.316L4.634.464S4.26.01 3.866 0h-.024z"/></svg>',
    'qq-mail': '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.976 1L24 9.8l-10.587.015L10.723 23H5.489L8.18 9.8H3.244L1 5.4h8.077L9.976 1z"/></svg>'
  };
  return icons[provider] || icon("app");
}
function formatTime(value) {
  if (!value) return "No next run";
  var date = new Date(value);
  if (isNaN(date.getTime())) return String(value);
  var diff = date.getTime() - Date.now();
  if (diff > 0 && diff < 86400000) return "Today " + date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diff > 0 && diff < 172800000) return "Tomorrow " + date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
function fileMeta(item) {
  var size = Number(item.size || 0);
  var sizeLabel = size ? (size < 1024 * 1024 ? Math.max(1, Math.round(size / 1024)) + " KB" : (size / (1024 * 1024)).toFixed(1) + " MB") : "Created";
  return sizeLabel + (item.uploadedAt || item.updatedAt ? " · " + formatTime(item.uploadedAt || item.updatedAt) : "");
}

export function setActiveNav(name) {
  NAV_NAMES.forEach(function (nav) {
    var button = document.querySelector('.sidebar-nav-btn[data-nav="' + nav + '"]');
    if (button) button.classList.toggle("active", nav === name);
  });
}

/* Hide sidebar-only panels (knowledge, mistakes). Does NOT touch
   the recents panel (always visible) or main-content pages. */
export function closeAllPanels() {
  ["knowledgePanel", "mistakesPanel"].forEach(function (id) { var p = byId(id); if (p) p.classList.add("hidden"); });
  ["tabKnowledge", "tabRecents", "tabMistakes"].forEach(function (id) { var b = byId(id); if (b) b.classList.remove("active"); });
}

/* Hide all main-content pages (library, projects, scheduled, plugins). */
function hideMainPages() {
  ["libraryPanel", "spacesPanel", "scheduledPanel", "pluginsPanel"].forEach(function (id) { var p = byId(id); if (p) p.classList.add("hidden"); });
}
window.hideMainPages = hideMainPages;

/* Show a single main-content page and hide the others. */
function showMainPage(pageId) {
  hideMainPages();
  var page = byId(pageId);
  if (page) page.classList.remove("hidden");
}

export function openNav(name) {
  var openers = { library: openLibrary, projects: openProjects, scheduled: openScheduled, plugins: openPlugins, more: openMoreNav };
  if (!openers[name]) return;
  setActiveNav(name);
  if (name !== "more") closeAllPanels();
  openers[name]();
}

function hideChatAndTopic() {
  var ts = byId("topicSetup"); if (ts) ts.classList.add("hidden");
  var cv = byId("chatView"); if (cv) cv.classList.add("hidden");
  var dv = byId("diagnosticView"); if (dv) dv.classList.add("hidden");
  if (typeof window.toggleChatTopBarEls === "function") window.toggleChatTopBarEls(false);
}

export function openLibrary() { hideChatAndTopic(); showMainPage("libraryPanel"); renderLibrary(); }
async function renderLibrary() {
  var list = byId("libraryList");
  if (!list) return;
  list.innerHTML = '<div class="workspace-loading">Loading library…</div>';
  try {
    var results = await Promise.all([api("/api/files?limit=100"), api("/api/artifacts?limit=100")]);
    workspaceCache.library.files = results[0].files || [];
    workspaceCache.library.artifacts = results[1].artifacts || [];
    paintLibrary();
  } catch (_) { list.innerHTML = '<div class="library-empty">Your library could not be loaded. Try again.</div>'; }
}
function paintLibrary() {
  var list = byId("libraryList");
  var tab = document.querySelector(".library-tab.active");
  var key = tab && tab.dataset.libraryTab === "artifacts" ? "artifacts" : "files";
  var query = workspaceCache.library.query.toLowerCase();
  var items = workspaceCache.library[key].filter(function (item) { return !query || String(item.name || item.title || "").toLowerCase().indexOf(query) >= 0; });
  var count = byId("libraryCount");
  if (count) count.textContent = items.length ? items.length + " item" + (items.length === 1 ? "" : "s") : "";
  if (!items.length) {
    list.innerHTML = '<div class="workspace-empty"><strong>' + (query ? "No matching items" : key === "files" ? "Your library is ready" : "No created items yet") + '</strong><span>' + (query ? "Try a different search." : key === "files" ? "Upload a file or attach one in a chat." : "Generated documents and artifacts will appear here.") + "</span></div>";
    return;
  }
  var renaming = workspaceCache.library.renameItem;
  var sel = workspaceCache.library.selection;
  var anySelected = false;
  items.forEach(function (item) { if (sel[item.id]) anySelected = true; });
  var allSelected = items.length > 0 && items.every(function (item) { return sel[item.id]; });
  list.innerHTML =
    '<div class="library-selection-bar' + (anySelected ? ' visible' : '') + '" id="librarySelectionBar">' +
      '<label class="library-select-all">' +
        '<input type="checkbox" class="library-checkbox" onchange="toggleSelectAllLibrary(this.checked)" ' + (allSelected ? 'checked' : '') + ' aria-label="Select all">' +
        '<span>' + (anySelected ? Object.keys(sel).length + ' selected' : 'Select all') + '</span>' +
      '</label>' +
      '<button class="workspace-row-action library-bulk-delete" onclick="deleteSelectedLibrary()" ' + (anySelected ? '' : 'disabled') + '>Delete selected</button>' +
    '</div>' +
    items.map(function (item) {
    var name = item.name || item.title || "Untitled";
    var kind = item.kind === "image" ? "image" : "file";
    var checked = sel[item.id] ? 'checked' : '';
    var deleting = sel[item.id] ? ' library-row-selected' : '';
    var nameHtml;
    if (renaming === item.id) {
      nameHtml = '<input class="library-rename-input" type="text" value="' + esc(name) + '" maxlength="255" data-rename-id="' + esc(item.id) + '" data-rename-key="' + key + '" onkeydown="if(event.key===\'Enter\')saveLibraryRename(this);if(event.key===\'Escape\')cancelLibraryRename();" autofocus>';
    } else {
      nameHtml = '<strong class="library-name" onclick="event.stopPropagation();startLibraryRename(\'' + esc(item.id) + '\',\'' + key + '\')" title="Click to rename">' + esc(name) + '</strong>';
    }
    var actions = key === "files"
      ? '<button class="workspace-row-action" onclick="event.stopPropagation();deleteLibraryFile(\'' + esc(item.id) + '\')" aria-label="Delete ' + esc(name) + '">Delete</button>'
      : '<button class="workspace-row-action" onclick="event.stopPropagation();renameArtifact(\'' + esc(item.id) + '\')">Rename</button>';
    return '<div class="workspace-row library-row' + deleting + '">' +
      '<label class="library-checkbox-label" onclick="event.stopPropagation()">' +
        '<input type="checkbox" class="library-checkbox" onchange="toggleLibrarySelect(\'' + esc(item.id) + '\',this.checked)" ' + checked + ' aria-label="Select ' + esc(name) + '">' +
      '</label>' +
      '<span class="workspace-row-icon" onclick="openLibraryItem(\'' + esc(item.id) + '\',\'' + key + '\')">' + icon(kind) + '</span>' +
      '<div class="workspace-row-copy" onclick="openLibraryItem(\'' + esc(item.id) + '\',\'' + key + '\')">' + nameHtml + '<span>' + esc(fileMeta(item)) + '</span></div>' +
      actions +
    '</div>';
  }).join("");
  if (renaming) {
    var inp = list.querySelector('.library-rename-input');
    if (inp) { inp.focus(); inp.select(); }
  }
}

function getLibraryKey() {
  var tab = document.querySelector(".library-tab.active");
  return tab && tab.dataset.libraryTab === "artifacts" ? "artifacts" : "files";
}

window.toggleLibrarySelect = function (id, checked) {
  var sel = workspaceCache.library.selection;
  if (checked) sel[id] = true; else delete sel[id];
  paintLibrary();
};

window.toggleSelectAllLibrary = function (checked) {
  var key = getLibraryKey();
  var items = workspaceCache.library[key];
  var sel = workspaceCache.library.selection;
  items.forEach(function (item) {
    if (checked) sel[item.id] = true; else delete sel[item.id];
  });
  paintLibrary();
};

window.deleteSelectedLibrary = async function () {
  var sel = workspaceCache.library.selection;
  var ids = Object.keys(sel);
  if (!ids.length) return;
  var key = getLibraryKey();
  var label = key === "files" ? "files" : "artifacts";
  if (!(await confirmAction("Delete " + ids.length + " " + label + "?", "This cannot be undone."))) return;
  try {
    await Promise.all(ids.map(function (id) {
      return api("/api/" + label + "/" + encodeURIComponent(id), { method: "DELETE" });
    }));
    workspaceCache.library.selection = {};
    toast(ids.length + " " + label + " deleted");
    renderLibrary();
  } catch (_) { toast("Could not delete some items"); }
};

window.startLibraryRename = function (id, key) {
  workspaceCache.library.renameItem = id;
  paintLibrary();
};

window.cancelLibraryRename = function () {
  workspaceCache.library.renameItem = null;
  paintLibrary();
};

window.saveLibraryRename = async function (input) {
  var id = input.dataset.renameId;
  var key = input.dataset.renameKey;
  var newName = input.value.trim();
  workspaceCache.library.renameItem = null;
  if (!newName) { paintLibrary(); return; }
  var oldItem = workspaceCache.library[key].filter(function (i) { return i.id === id; })[0];
  var oldName = oldItem ? (oldItem.name || oldItem.title) : "";
  if (newName === oldName) { paintLibrary(); return; }
  try {
    if (key === "files") {
      await api("/api/files/" + encodeURIComponent(id), { method: "PATCH", body: { name: newName } });
      if (oldItem) oldItem.name = newName;
    } else {
      await api("/api/artifacts/" + encodeURIComponent(id), { method: "PATCH", body: { title: newName } });
      if (oldItem) oldItem.title = newName;
    }
    toast("Renamed");
    paintLibrary();
  } catch (_) { toast("Could not rename"); paintLibrary(); }
};

window.renameArtifact = async function (id) {
  /* Reuse the rename flow by starting rename on the artifact */
  window.startLibraryRename(id, "artifacts");
};

export function openProjects() { hideChatAndTopic(); showMainPage("spacesPanel"); renderProjects(); }
async function renderProjects() {
  var list = byId("spacesList");
  if (!list) return;
  list.innerHTML = '<div class="workspace-loading">Loading projects…</div>';
  try { workspaceCache.projects = (await api("/api/projects")).projects || []; paintProjects(); }
  catch (_) { list.innerHTML = '<div class="spaces-empty">Projects could not be loaded. Try again.</div>'; }
}
function paintProjects() {
  var list = byId("spacesList");
  var sessions = Array.isArray(window.SERVER_SESSIONS) ? window.SERVER_SESSIONS : [];
  if (!workspaceCache.projects.length) {
    list.innerHTML = '<div class="workspace-empty"><strong>Make space for ongoing work</strong><span>Projects keep related chats, files, and instructions together.</span><button class="workspace-primary" onclick="openCreateProject()">Create project</button></div>';
    return;
  }
  list.innerHTML = workspaceCache.projects.map(function (project) {
    var count = sessions.filter(function (session) { return session.projectId === project.id; }).length;
    var color = /^#[0-9a-f]{3,8}$/i.test(project.color || "") ? project.color : "hsl(var(--accent-000))";
    return '<div class="workspace-row project-row"><button class="project-main" onclick="openProjectWorkspace(\'' + esc(project.id) + '\')"><span class="project-swatch" style="background:' + esc(color) + '"></span><span class="workspace-row-copy"><strong>' + esc(project.name) + '</strong><span>' + count + " chat" + (count === 1 ? "" : "s") + (project.description ? " · " + esc(project.description) : "") + '</span></span></button><button class="workspace-row-action" onclick="openEditProject(\'' + esc(project.id) + '\')" aria-label="Edit ' + esc(project.name) + '">Edit</button></div>';
  }).join("");
}

export function openScheduled() { hideChatAndTopic(); showMainPage("scheduledPanel"); renderScheduled(); }
async function renderScheduled() {
  var list = byId("scheduledList");
  if (!list) return;
  list.innerHTML = '<div class="workspace-loading">Loading tasks…</div>';
  try { workspaceCache.tasks = (await api("/api/scheduled-tasks")).tasks || []; paintScheduled(); }
  catch (_) { list.innerHTML = '<div class="scheduled-empty">Scheduled tasks could not be loaded. Try again.</div>'; }
}
function paintScheduled() {
  var list = byId("scheduledList");
  if (!workspaceCache.tasks.length) {
    list.innerHTML = '<div class="workspace-empty"><strong>Let Socrates follow up</strong><span>Create a reminder, recurring briefing, or monitoring task.</span><button class="workspace-primary" onclick="openCreateScheduledTask()">Create task</button></div>';
    return;
  }
  list.innerHTML = workspaceCache.tasks.map(function (task) {
    var active = task.status !== "paused" && task.status !== "completed";
    var state = active ? "Active" : task.status === "paused" ? "Paused" : "Complete";
    return '<div class="workspace-row task-row"><span class="workspace-row-icon">' + icon("calendar") + '</span><button class="task-main" onclick="openEditScheduledTask(\'' + esc(task.id) + '\')"><span class="workspace-row-copy"><strong>' + esc(task.title) + '</strong><span><i class="task-status ' + (active ? "on" : "") + '"></i>' + esc(state + " · " + (task.frequency || "once") + " · " + formatTime(task.nextRunAt)) + '</span></span></button><button class="workspace-row-action" onclick="toggleScheduledTask(\'' + esc(task.id) + '\', ' + active + ')" aria-label="' + (active ? "Pause" : "Resume") + ' task">' + (active ? "Pause" : "Resume") + "</button></div>";
  }).join("");
}

export function openPlugins() { hideChatAndTopic(); showMainPage("pluginsPanel"); renderPlugins(); }
async function renderPlugins() {
  var list = byId("pluginsList");
  if (!list) return;
  list.innerHTML = '<div class="workspace-loading">Loading apps…</div>';
  try { workspaceCache.connectors = (await api("/api/connectors")).connectors || []; paintPlugins(); }
  catch (_) { list.innerHTML = '<div class="plugins-empty">Apps could not be loaded. Try again.</div>'; }
}
function paintPlugins() {
  var list = byId("pluginsList");
  if (!workspaceCache.connectors.length) { list.innerHTML = '<div class="workspace-empty"><strong>Apps are unavailable</strong><span>Refresh and try again.</span></div>'; return; }
  list.innerHTML = workspaceCache.connectors.map(function (connector) {
    var connected = !!connector.connection;
    var comingSoon = connector.availability !== "available";
    var needsInstall = connected && connector.connection.status === "needs_installation";
    var meta = connected
      ? (needsInstall ? "Authorization complete · install the app to choose repositories" : "Connected" + (connector.connection.displayName ? " · " + connector.connection.displayName : ""))
      : (comingSoon ? "Coming soon" : connector.description);
    var action = comingSoon
      ? '<span class="connector-coming-soon">Soon</span>'
      : connector.auth === "public"
        ? '<button class="workspace-secondary connector-connect" onclick="openArxivSearch()">Explore</button>'
      : needsInstall && connector.installUrl
        ? '<button class="workspace-secondary connector-connect" onclick="installConnector(\'' + esc(connector.installUrl) + '\')">Install</button>'
        : connected
        ? (connector.id === "zotero"
          ? '<span class="connector-actions"><button class="workspace-secondary connector-connect" onclick="openZoteroLibrary()">Browse</button><button class="workspace-row-action connector-disconnect" onclick="disconnectConnector(\'zotero\')">Disconnect</button></span>'
          : '<button class="workspace-row-action connector-disconnect" onclick="disconnectConnector(\'' + esc(connector.id) + '\')">Disconnect</button>')
        : connector.configured === false
          ? '<span class="connector-coming-soon">Setup needed</span>'
          : '<button class="workspace-secondary connector-connect" onclick="connectConnector(\'' + esc(connector.id) + '\')">Connect</button>';
    return '<div class="workspace-row connector-row ' + (connected ? "is-connected" : "") + '"><span class="workspace-row-icon connector-icon connector-' + esc(connector.id) + '">' + connectorIcon(connector.id) + '</span><div class="workspace-row-copy"><strong>' + esc(connector.name) + '</strong><span>' + esc(meta) + '</span></div>' + action + '</div>';
  }).join("");
}

function ensureDialog() {
  var dialog = byId("workspaceDialog");
  if (dialog) return dialog;
  dialog = document.createElement("div");
  dialog.id = "workspaceDialog";
  dialog.className = "workspace-dialog hidden";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.addEventListener("click", function (event) { if (event.target === dialog) closeWorkspaceDialog(); });
  document.body.appendChild(dialog);
  return dialog;
}
function showDialog(markup) { var dialog = ensureDialog(); dialog.innerHTML = '<div class="workspace-dialog-card">' + markup + "</div>"; dialog.classList.remove("hidden"); var focus = dialog.querySelector("input, textarea, select"); if (focus) setTimeout(function () { focus.focus(); }, 0); }
function field(label, name, value, type, extra) { return '<label class="workspace-field"><span>' + label + '</span><' + (type || "input") + ' name="' + name + '" ' + (type === "textarea" ? "" : 'type="text"') + ' ' + (extra || "") + ">" + (type === "textarea" ? esc(value || "") + "</textarea>" : "") + "</label>"; }
function closeWorkspaceDialog() { var dialog = byId("workspaceDialog"); if (dialog) { dialog.classList.add("hidden"); dialog.innerHTML = ""; } }

window.openCreateProject = function () { openProjectForm(null); };
window.openEditProject = function (id) { openProjectForm(workspaceCache.projects.filter(function (project) { return project.id === id; })[0] || null); };
function openProjectForm(project) {
  var editing = !!project;
  showDialog('<div class="workspace-dialog-title"><div><h2>' + (editing ? "Edit project" : "New project") + '</h2><p>Give this work a home and a clear instruction.</p></div><button onclick="closeWorkspaceDialog()" aria-label="Close">×</button></div><form id="projectForm" class="workspace-form"><label class="workspace-field"><span>Name</span><input name="name" maxlength="80" required value="' + esc(project && project.name) + '" placeholder="Research, writing, a course…"></label><label class="workspace-field"><span>Description <em>Optional</em></span><input name="description" maxlength="180" value="' + esc(project && project.description) + '" placeholder="What are you working toward?"></label><label class="workspace-field"><span>Instructions <em>Optional</em></span><textarea name="systemPrompt" rows="3" placeholder="How should Socrates approach work in this project?">' + esc(project && project.systemPrompt) + '</textarea></label><label class="workspace-field"><span>Color</span><input name="color" type="color" value="' + esc((project && project.color) || "#c69a2d") + '"></label><div class="workspace-dialog-actions">' + (editing ? '<button type="button" class="workspace-danger" onclick="deleteProject(\'' + esc(project.id) + '\')">Delete</button>' : "") + '<span></span><button type="button" class="workspace-secondary" onclick="closeWorkspaceDialog()">Cancel</button><button class="workspace-primary" type="submit">' + (editing ? "Save changes" : "Create project") + "</button></div></form>");
  byId("projectForm").addEventListener("submit", async function (event) { event.preventDefault(); var data = Object.fromEntries(new FormData(event.currentTarget)); try { if (editing) await api("/api/projects/" + project.id, { method: "PATCH", body: data }); else await api("/api/projects", { method: "POST", body: data }); closeWorkspaceDialog(); renderProjects(); toast(editing ? "Project updated" : "Project created"); } catch (_) { toast("Could not save project"); } });
}
window.deleteProject = async function (id) { if (!(await confirmAction("Delete this project?", "Chats will remain in your inbox."))) return; try { await api("/api/projects/" + id, { method: "DELETE" }); closeWorkspaceDialog(); renderProjects(); toast("Project deleted"); } catch (_) { toast("Could not delete project"); } };
window.openProjectWorkspace = function (id) { var project = workspaceCache.projects.filter(function (item) { return item.id === id; })[0]; if (!project) return; showDialog('<div class="workspace-dialog-title"><div><h2>' + esc(project.name) + '</h2><p>' + esc(project.description || "A focused place for related work.") + '</p></div><button onclick="closeWorkspaceDialog()" aria-label="Close">×</button></div><div class="project-workspace-actions"><button class="workspace-primary" onclick="startProjectChat(\'' + esc(id) + '\')">New chat in project</button><button class="workspace-secondary" onclick="moveCurrentChatToProject(\'' + esc(id) + '\')">Move current chat here</button></div><p class="workspace-note">Project instructions are saved with the project. Files and chats remain available as shared context for future work.</p>'); };
window.startProjectChat = async function (id) { window._nextProjectId = id; window.__activeProject = workspaceCache.projects.filter(function (item) { return item.id === id; })[0] || null; closeWorkspaceDialog(); if (typeof window.resetApp === "function") await window.resetApp(); };
window.moveCurrentChatToProject = async function (id) { var state = window.state; if (!state) return; state.currentProjectId = id; window.__activeProject = workspaceCache.projects.filter(function (item) { return item.id === id; })[0] || null; var sessionId = state.currentSessionId; try { if (sessionId) await api("/api/sessions/" + encodeURIComponent(sessionId), { method: "PATCH", body: { projectId: id } }); closeWorkspaceDialog(); toast("Current chat moved to project"); if (typeof window.refreshServerSessions === "function") window.refreshServerSessions(); } catch (_) { toast("Could not move the current chat"); } };

window.openCreateScheduledTask = function () { openTaskForm(null); };
window.openEditScheduledTask = function (id) { openTaskForm(workspaceCache.tasks.filter(function (task) { return task.id === id; })[0] || null); };
function openTaskForm(task) {
  var editing = !!task;
  var next = task && task.nextRunAt ? new Date(task.nextRunAt).toISOString().slice(0, 16) : "";
  showDialog('<div class="workspace-dialog-title"><div><h2>' + (editing ? "Edit task" : "Schedule a task") + '</h2><p>Choose what should run and when to check back.</p></div><button onclick="closeWorkspaceDialog()" aria-label="Close">×</button></div><form id="taskForm" class="workspace-form"><label class="workspace-field"><span>Task</span><input name="title" maxlength="120" required value="' + esc(task && task.title) + '" placeholder="Send me a weekly study plan"></label><label class="workspace-field"><span>Prompt</span><textarea name="prompt" rows="3" placeholder="What should Socrates do when this task runs?">' + esc(task && task.prompt) + '</textarea></label><div class="workspace-form-grid"><label class="workspace-field"><span>Repeat</span><select name="frequency"><option value="once">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label class="workspace-field"><span>First run</span><input name="nextRunAt" type="datetime-local" value="' + esc(next) + '"></label></div><p class="workspace-note">Tasks run without opening a chat. Voice and connected apps are not used for scheduled runs.</p><div class="workspace-dialog-actions">' + (editing ? '<button type="button" class="workspace-danger" onclick="deleteScheduledTask(\'' + esc(task.id) + '\')">Delete</button>' : "") + '<span></span><button type="button" class="workspace-secondary" onclick="closeWorkspaceDialog()">Cancel</button><button class="workspace-primary" type="submit">' + (editing ? "Save task" : "Create task") + "</button></div></form>");
  var select = byId("taskForm").elements.frequency; select.value = (task && task.frequency) || "once";
  byId("taskForm").addEventListener("submit", async function (event) { event.preventDefault(); var data = Object.fromEntries(new FormData(event.currentTarget)); try { if (editing) await api("/api/scheduled-tasks/" + task.id, { method: "PATCH", body: data }); else await api("/api/scheduled-tasks", { method: "POST", body: data }); closeWorkspaceDialog(); renderScheduled(); toast(editing ? "Task updated" : "Task scheduled"); } catch (_) { toast("Could not save task"); } });
}
window.toggleScheduledTask = async function (id, pause) { try { await api("/api/scheduled-tasks/" + id, { method: "PATCH", body: { status: pause ? "paused" : "active" } }); renderScheduled(); toast(pause ? "Task paused" : "Task resumed"); } catch (_) { toast("Could not update task"); } };
window.deleteScheduledTask = async function (id) { if (!(await confirmAction("Delete this scheduled task?", "This cannot be undone."))) return; try { await api("/api/scheduled-tasks/" + id, { method: "DELETE" }); closeWorkspaceDialog(); renderScheduled(); toast("Task deleted"); } catch (_) { toast("Could not delete task"); } };

window.switchLibraryTab = function (tab) { document.querySelectorAll(".library-tab").forEach(function (button) { button.classList.toggle("active", button.dataset.libraryTab === tab); }); paintLibrary(); };
window.filterLibrary = function (query) { workspaceCache.library.query = query || ""; paintLibrary(); };
window.openLibraryItem = function (id, kind) { if (kind === "files") window.open("/api/files/" + encodeURIComponent(id) + "/raw", "_blank", "noopener"); else toast("Artifacts can be opened from the chat where they were created."); };
window.openLibraryUpload = function () { var input = byId("libraryUploadInput"); if (input) input.click(); };
window.deleteLibraryFile = async function (id) { if (!(await confirmAction("Delete this file?", "It will be removed from your library."))) return; try { await api("/api/files/" + encodeURIComponent(id), { method: "DELETE" }); renderLibrary(); toast("File deleted"); } catch (_) { toast("Could not delete file"); } };
var libraryUpload = byId("libraryUploadInput");
if (libraryUpload && !libraryUpload.dataset.wired) { libraryUpload.dataset.wired = "1"; libraryUpload.addEventListener("change", async function () { var files = Array.prototype.slice.call(libraryUpload.files || []); if (!files.length) return; try { for (var i = 0; i < files.length; i++) { var body = new FormData(); body.append("file", files[i]); await api("/api/files", { method: "POST", body: body }); } toast(files.length === 1 ? "File added to Library" : files.length + " files added to Library"); renderLibrary(); } catch (_) { toast("Some files could not be uploaded"); } finally { libraryUpload.value = ""; } }); }

window.connectConnector = function (id) {
  if (id === "zotero") { openZoteroConnectDialog(); return; }
  if (id !== "github" && id !== "feishu" && id !== "gitee" && id !== "notion") { toast("This app is coming soon."); return; }
  window.location.assign("/api/v2/connectors/" + id + "/start");
};
function arxivPaperMarkup(paper) {
  var meta = [paper.authors && paper.authors.join(", "), paper.publishedAt ? new Date(paper.publishedAt).getFullYear() : "", paper.categories && paper.categories.slice(0, 2).join(", ")].filter(Boolean).join(" · ");
  var links = (paper.abstractUrl ? '<a class="workspace-row-action" href="' + esc(paper.abstractUrl) + '" target="_blank" rel="noopener noreferrer">Abstract</a>' : "") + (paper.pdfUrl ? '<a class="workspace-row-action" href="' + esc(paper.pdfUrl) + '" target="_blank" rel="noopener noreferrer">PDF</a>' : "");
  return '<div class="workspace-row arxiv-paper"><span class="workspace-row-icon connector-icon connector-arxiv">' + connectorIcon('arxiv') + '</span><div class="workspace-row-copy"><strong>' + esc(paper.title || "Untitled paper") + '</strong><span>' + esc(meta || "arXiv preprint") + '</span>' + (paper.summary ? '<p class="arxiv-summary">' + esc(paper.summary) + '</p>' : "") + '</div><span class="connector-actions">' + links + '</span></div>';
}
function paintArxivPapers(papers) {
  var list = byId("arxivPapers");
  if (!list) return;
  list.innerHTML = papers.length ? papers.map(arxivPaperMarkup).join("") : '<div class="workspace-empty"><strong>No matching papers</strong><span>Try another research topic or author.</span></div>';
}
window.openArxivSearch = function () {
  showDialog('<div class="workspace-dialog-title"><div><h2>Search arXiv</h2><p>Explore public research preprints. No account connection is needed.</p></div><button onclick="closeWorkspaceDialog()" aria-label="Close">脳</button></div><form id="arxivSearchForm" class="workspace-form"><div class="workspace-form-grid"><label class="workspace-field"><span>Research topic</span><input name="query" maxlength="200" minlength="2" autocomplete="off" required placeholder="e.g. retrieval augmented generation"></label><div class="workspace-field"><span>&nbsp;</span><button class="workspace-primary" type="submit">Search</button></div></div></form><div id="arxivPapers" class="marketplace-list"><div class="workspace-empty"><strong>Find a paper</strong><span>Search by topic, method, author, or year.</span></div></div>');
  byId("arxivSearchForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    var form = event.currentTarget; var list = byId("arxivPapers"); var query = form.elements.query.value;
    if (list) list.innerHTML = '<div class="workspace-loading">Searching arXiv…</div>';
    try { paintArxivPapers((await api("/api/connectors/arxiv/papers?query=" + encodeURIComponent(query))).papers || []); }
    catch (err) { if (list) list.innerHTML = '<div class="workspace-empty"><strong>arXiv could not be searched</strong><span>' + esc((err && err.message) || "Try again shortly.") + '</span></div>'; }
  });
};
function openZoteroConnectDialog() {
  showDialog('<div class="workspace-dialog-title"><div><h2>Connect Zotero</h2><p>Use a dedicated, read-only API Key from your Zotero account. Your Key is encrypted and never shown again.</p></div><button onclick="closeWorkspaceDialog()" aria-label="Close">脳</button></div><form id="zoteroConnectForm" class="workspace-form"><label class="workspace-field"><span>Zotero API Key</span><input name="apiKey" type="password" minlength="16" maxlength="128" autocomplete="off" spellcheck="false" required placeholder="Paste your dedicated read-only Key"></label><p class="workspace-note">Create one in <a href="https://www.zotero.org/settings/keys" target="_blank" rel="noopener noreferrer">Zotero API Keys</a>. Enable personal library access only, with write access turned off.</p><div class="workspace-dialog-actions"><span></span><button type="button" class="workspace-secondary" onclick="closeWorkspaceDialog()">Cancel</button><button class="workspace-primary" type="submit">Connect</button></div></form>');
  byId("zoteroConnectForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var submit = form.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = "Verifying…";
    try {
      await api("/api/connectors/zotero", { method: "POST", body: { apiKey: form.elements.apiKey.value } });
      closeWorkspaceDialog(); renderPlugins(); toast("Zotero connected");
    } catch (err) {
      toast((err && err.message) || "Zotero could not be connected");
      submit.disabled = false; submit.textContent = "Connect";
    }
  });
}
function zoteroItemMarkup(item) {
  var details = [item.itemType, item.creators && item.creators.join(", "), item.date].filter(Boolean).join(" · ");
  return '<div class="workspace-row zotero-item"><span class="workspace-row-icon connector-icon connector-zotero">' + connectorIcon('zotero') + '</span><div class="workspace-row-copy"><strong>' + esc(item.title || "Untitled item") + '</strong><span>' + esc(details || "Zotero item") + '</span></div></div>';
}
function paintZoteroItems(items) {
  var list = byId("zoteroItems");
  if (!list) return;
  list.innerHTML = items.length ? items.map(zoteroItemMarkup).join("") : '<div class="workspace-empty"><strong>No matching references</strong><span>Try a title, author, or year.</span></div>';
}
window.openZoteroLibrary = async function () {
  showDialog('<div class="workspace-dialog-title"><div><h2>Zotero library</h2><p>Search the references connected to this account.</p></div><button onclick="closeWorkspaceDialog()" aria-label="Close">脳</button></div><form id="zoteroSearchForm" class="workspace-form"><div class="workspace-form-grid"><label class="workspace-field"><span>Search</span><input name="query" maxlength="200" autocomplete="off" placeholder="Title, author, or year"></label><div class="workspace-field"><span>&nbsp;</span><button class="workspace-primary" type="submit">Search</button></div></div></form><div id="zoteroItems" class="marketplace-list"><div class="workspace-loading">Loading references…</div></div>');
  async function load(query) {
    var list = byId("zoteroItems");
    if (list) list.innerHTML = '<div class="workspace-loading">Loading references…</div>';
    try { paintZoteroItems((await api("/api/connectors/zotero/items?query=" + encodeURIComponent(query || ""))).items || []); }
    catch (err) { if (list) list.innerHTML = '<div class="workspace-empty"><strong>References could not be loaded</strong><span>' + esc((err && err.message) || "Try reconnecting Zotero.") + '</span></div>'; }
  }
  byId("zoteroSearchForm").addEventListener("submit", function (event) { event.preventDefault(); load(event.currentTarget.elements.query.value); });
  load("");
};
window.installConnector = function (url) { window.open(url, "_blank", "noopener"); };
window.disconnectConnector = async function (id) {
  if (!(await confirmAction("Disconnect this app?", "Socrates will remove the stored connection."))) return;
  try { await api("/api/connectors/" + encodeURIComponent(id), { method: "DELETE" }); renderPlugins(); toast("App disconnected"); }
  catch (_) { toast("Could not disconnect app"); }
};
window.openPluginMarketplace = function () { renderPlugins(); };

window.closeWorkspaceDialog = closeWorkspaceDialog;
export function openMoreNav() { try { toggleMorePopover(); } catch (_) {} }
