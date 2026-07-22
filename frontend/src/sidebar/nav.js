import { toggleMorePopover } from "./morePopover.js";

/* Connector brand marks come from the maintained @lobehub/icons-static-svg
   set (Vite inlines each file as a raw string via the `?raw` suffix) so the
   icons stay in one source of truth. Lobehub ships github/notion/gitee/baidu
   but not feishu/onedrive/outlook/zotero/arxiv/qq-mail, so those keep their
   hand-drawn SVGs below. `lobehubIcon` strips Lobehub's inline 1em sizing,
   inline style, xmlns, and <title> so every mark renders with the same
   viewBox + `currentColor` contract as the bespoke icons. */
import githubRaw from "@lobehub/icons-static-svg/icons/github.svg?raw";
import notionRaw from "@lobehub/icons-static-svg/icons/notion.svg?raw";
import giteeRaw from "@lobehub/icons-static-svg/icons/giteeai.svg?raw";
import baiduCloudRaw from "@lobehub/icons-static-svg/icons/baiducloud.svg?raw";

function lobehubIcon(raw) {
  return String(raw || "")
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/\s(?:width|height)="1em"/gi, "")
    .replace(/\sstyle="[^"]*"/i, "")
    .replace(/\sxmlns="[^"]*"/i, "")
    .replace(/<svg /i, '<svg aria-hidden="true" ');
}

var NAV_NAMES = ["library", "projects", "scheduled", "plugins", "exam", "more"];
var workspaceCache = { library: { files: [], artifacts: [], query: "", selection: {}, renameItem: null }, projects: [], tasks: [], connectors: [] };
var WORKSPACE_ROUTES = { library: "/library", projects: "/projects", scheduled: "/scheduled", plugins: "/plugins", exam: "/exam" };

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
    github: lobehubIcon(githubRaw),
    feishu: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.944 18.587l-1.704-.445V10.01l1.824-.462c1-.254 1.84-.461 1.88-.453.032 0 .056 2.235.056 4.972v4.973l-.176-.008c-.104 0-.952-.207-1.88-.446z"/><path d="M7 16.542c0-2.736.024-4.98.064-4.98.032-.008.872.2 1.88.454l1.816.461-.016 4.05-.024 4.049-1.632.422c-.896.23-1.736.445-1.856.469L7 21.523v-4.98z"/><path d="M19.24 12.477c0-9.03.008-9.515.144-9.475.072.024.784.207 1.576.406.792.207 1.576.405 1.744.445l.296.08-.016 8.56-.024 8.568-1.624.414c-.888.23-1.728.437-1.856.47l-.24.055v-9.523z"/><path d="M1 12.509c0-4.678.024-8.505.064-8.505.032 0 .872.207 1.872.454l1.824.461v7.582c0 4.16-.016 7.574-.032 7.574-.024 0-.872.215-1.88.47L1 21.013v-8.505z"/></svg>',
    'baidu-netdisk': lobehubIcon(baiduCloudRaw),
    gitee: lobehubIcon(giteeRaw),
    onedrive: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.5 6.5a5.5 5.5 0 0 1 4.52 8.4c.01.06.02.12.02.18a4 4 0 0 1-3.1 3.9l-10.2.02A3.5 3.5 0 1 1 5.53 13a5.5 5.5 0 0 1 8.35-6.17A5.5 5.5 0 0 1 15.5 6.5z"/></svg>',
    outlook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.5 2a3.5 3.5 0 0 0-3.5 3.5h.01v5.73L5 10.5V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v.67L11 11.68V20H7.5a2 2 0 0 1-2-2v-1.01l-1.1.56A3.5 3.5 0 0 0 10 20h6.5a3.5 3.5 0 0 0 3.5-3.5V5.5A3.5 3.5 0 0 0 16.5 2H7.5zM7 13.4l-2.62 1.3A1.5 1.5 0 0 1 2 13.4V9.6a1.5 1.5 0 0 1 2.38-1.3L7 9.6v3.8z"/></svg>',
    notion: lobehubIcon(notionRaw),
    zotero: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.231 2.462 7.18 20.923h14.564V24H2.256v-2.462L16.308 3.076H2.975V0h18.256v2.462z"/></svg>',
    'qq-mail': '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.976 1L24 9.8l-10.587.015L10.723 23H5.489L8.18 9.8H3.244L1 5.4h8.077L9.976 1z"/></svg>'
  };
  return icons[provider] || icon("app");
}

/* Connected-app slash commands. Each connector that has a matching
   server-side function-calling tool (see server/src/services/
   connectorTools.js) gets a slash entry so the user can invoke it
   by name from the composer. Selecting an entry drops a natural-
   language directive into the input; the model then auto-calls the
   tool via tool_choice:'auto'. Connectors without a callable tool
   (feishu/onedrive/outlook/baidu-netdisk/qq-mail/arxiv) are omitted.
   P_slash-no-arxiv — arxiv_search was removed from the slash palette
   per product request. The connector itself, the in-workspace
   "Search arXiv" dialog, and the underlying tool registration stay
   intact — users can still find arxiv via the Connectors panel. */
var APP_SLASH_HINTS = {
  zotero: { insert: "Search my Zotero library for ", description: "Search your connected Zotero references" },
  notion: { insert: "Search my Notion workspace for ", description: "Search pages in your connected Notion" },
  github: { insert: "List my GitHub repositories matching ", description: "List repos from your connected GitHub" },
  gitee: { insert: "List my Gitee repositories matching ", description: "List repos from your connected Gitee" }
};
var _slashConnectorsLoaded = false;
/* Fetch the connector list once so the slash palette can show which
   apps are actually callable. Fire-and-forget; safe to call repeatedly. */
function ensureSlashApps() {
  if (_slashConnectorsLoaded && workspaceCache.connectors.length) return Promise.resolve();
  return api("/api/connectors").then(function (res) {
    workspaceCache.connectors = (res && res.connectors) || [];
    _slashConnectorsLoaded = true;
  }).catch(function () { /* offline / not signed in — palette just shows templates */ });
}
window.ensureSlashApps = ensureSlashApps;
/* Return the slash-command entries for apps that are callable right
   now: any connector with a live connection (arxiv_search is exposed
   only via the Connectors panel, never via the slash palette). Shape
   mirrors what the palette renderer expects. */
window.getSlashApps = function () {
  return (workspaceCache.connectors || []).filter(function (c) {
    if (!APP_SLASH_HINTS[c.id]) return false;
    return c.auth === "public" || !!c.connection;
  }).map(function (c) {
    var hint = APP_SLASH_HINTS[c.id];
    return { id: c.id, title: c.name, shortcut: "/" + c.id, description: hint.description, icon: connectorIcon(c.id), insert: hint.insert };
  });
};
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

/* Hide all main-content pages (library, projects, scheduled, plugins, exam). */
function hideMainPages() {
  ["libraryPanel", "spacesPanel", "scheduledPanel", "pluginsPanel", "examView"].forEach(function (id) { var p = byId(id); if (p) p.classList.add("hidden"); });
}
window.hideMainPages = hideMainPages;

/* Show a single main-content page and hide the others. */
function showMainPage(pageId) {
  hideMainPages();
  var page = byId(pageId);
  if (page) page.classList.remove("hidden");
  /* Restore .main-inner visibility — exam-view (a sibling of
     .main-inner inside .main-content) may have hidden it. */
  var mi = byId("mainInner");
  if (mi) mi.classList.remove("hidden");
  /* Hide exam-only top bar elements when leaving exam mode. */
  var examEls = document.querySelectorAll("[data-exam-only='true']");
  examEls.forEach(function (el) { el.classList.add("hidden"); });
}

function workspaceForPath(pathname) {
  var clean = String(pathname || "/").replace(/\/+$/, "") || "/";
  return Object.keys(WORKSPACE_ROUTES).find(function (name) { return WORKSPACE_ROUTES[name] === clean; }) || null;
}
function pushWorkspaceRoute(name) {
  var next = WORKSPACE_ROUTES[name];
  if (next && location.pathname !== next) history.pushState({ workspace: name }, "", next);
}
export function openNav(name, options) {
  var openers = { library: openLibrary, projects: openProjects, scheduled: openScheduled, plugins: openPlugins, exam: openExam, more: openMoreNav };
  if (!openers[name]) return;
  if (name !== "more" && !(options && options.fromRoute)) pushWorkspaceRoute(name);
  setActiveNav(name);
  if (name !== "more") closeAllPanels();
  openers[name]();
}
export function syncWorkspaceRoute() {
  var page = workspaceForPath(location.pathname);
  if (page) openNav(page, { fromRoute: true });
}
window.addEventListener("popstate", function () { syncWorkspaceRoute(); });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncWorkspaceRoute, { once: true });
else setTimeout(syncWorkspaceRoute, 0);

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
  } catch (err) {
    if (err && err.status === 401) {
      list.innerHTML = '<div class="library-empty">Sign in to upload files and create artifacts.</div>';
    } else {
      list.innerHTML = '<div class="library-empty">Your library could not be loaded. Try again.</div>';
    }
  }
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
  try {
    var res = await api("/api/projects");
    workspaceCache.projects = (res && res.projects) || [];
    paintProjects();
  } catch (err) {
    if (err && err.status === 401) {
      list.innerHTML = '<div class="workspace-empty"><strong>Sign in to create projects</strong><span>Projects keep related chats, files, and instructions together.</span></div>';
    } else {
      list.innerHTML = '<div class="spaces-empty">Projects could not be loaded. Try again.</div>';
    }
  }
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
    return '<div class="workspace-row project-row" ondragover="event.preventDefault()" ondrop="onProjectDrop(event,\'' + esc(project.id) + '\')"><button class="project-main" onclick="openProjectWorkspace(\'' + esc(project.id) + '\')"><span class="project-swatch" style="background:' + esc(color) + '"></span><span class="workspace-row-copy"><strong>' + esc(project.name) + '</strong><span>' + count + " chat" + (count === 1 ? "" : "s") + (project.description ? " · " + esc(project.description) : "") + '</span></span></button><button class="workspace-row-action" onclick="openEditProject(\'' + esc(project.id) + '\')" aria-label="Edit ' + esc(project.name) + '">Edit</button></div>';
  }).join("");
}

export function openScheduled() { hideChatAndTopic(); showMainPage("scheduledPanel"); renderScheduled(); }

/* P_exam-nav — Exam is a main-content panel (not a sidebar nav into
   a workspace). We delegate the heavy lifting to exam.openExamPanel(),
   which renders the form, hydrates state.exam.*, and shows/hides the
   top-bar exam-only elements (#examBackBtn / #examTitleBar). hideChatAndTopic()
   is intentionally NOT called here — exam.openExamPanel() performs the
   equivalent DOM swap internally so the chat/topic setup panes stay
   hidden without forcing the top-bar elements to disappear (the user
   still needs the back-button to leave the exam). */
export function openExam() {
  if (typeof window.openExamPanel !== "function") return;
  window.openExamPanel();
}
async function renderScheduled() {
  var list = byId("scheduledList");
  if (!list) return;
  list.innerHTML = '<div class="workspace-loading">Loading tasks…</div>';
  try {
    var res = await api("/api/scheduled-tasks");
    workspaceCache.tasks = (res && res.tasks) || [];
    paintScheduled();
  } catch (err) {
    if (err && err.status === 401) {
      list.innerHTML = '<div class="workspace-empty"><strong>Sign in to schedule tasks</strong><span>Reminders, briefings, and monitoring tasks appear once you sign in.</span></div>';
    } else {
      list.innerHTML = '<div class="scheduled-empty">Scheduled tasks could not be loaded. Try again.</div>';
    }
  }
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
  list.innerHTML = '<div class="workspace-loading">Loading connector catalog...</div>';
  try {
    var res = await api("/api/project-connectors");
    workspaceCache.connectors = (res && res.connectors) || [];
    workspaceCache.projectConnectorConfigured = !!(res && res.configured);
    paintPlugins();
  } catch (err) {
    list.innerHTML = err && err.status === 401
      ? '<div class="workspace-empty"><strong>Sign in to connect apps</strong><span>Your app connections are isolated to your Socrates account.</span></div>'
      : '<div class="plugins-empty">Apps could not be loaded. Try again.</div>';
  }
}
function paintPlugins() {
  var list = byId("pluginsList");
  if (!workspaceCache.connectors.length) { list.innerHTML = '<div class="workspace-empty"><strong>Apps are unavailable</strong><span>Refresh and try again.</span></div>'; return; }
  var setup = workspaceCache.projectConnectorConfigured
    ? '<div class="workspace-note">OAuth tokens stay in the OOMOL gateway. Neither the browser nor the model receives a provider token.</div>'
    : '<div class="workspace-empty"><strong>Connector service needs setup</strong><span>Add OOMOL_PROJECT_API_KEY to the server environment. Authorization remains disabled until then.</span></div>';
  list.innerHTML = workspaceCache.connectors.map(function (connector) {
    var connection = connector.connection || null;
    var connected = connection && connection.status === "connected";
    var pending = connection && connection.status === "initiated";
    var meta = connected ? "Connected" + (connection.displayName ? " · " + connection.displayName : "")
      : pending ? "Waiting for authorization to finish" : connector.description;
    var action = connected ? '<span class="connector-coming-soon">Connected</span>'
      : pending ? '<button class="workspace-secondary connector-connect" onclick="refreshProjectConnector(\'' + esc(connector.id) + '\')">Refresh status</button>'
      : workspaceCache.projectConnectorConfigured ? '<button class="workspace-secondary connector-connect" onclick="connectProjectConnector(\'' + esc(connector.id) + '\')">Connect</button>'
      : '<span class="connector-coming-soon">Server setup needed</span>';
    return '<div class="workspace-row connector-row ' + (connected ? "is-connected" : "") + '"><span class="workspace-row-icon connector-icon connector-' + esc(connector.id) + '">' + connectorIcon(connector.id) + '</span><div class="workspace-row-copy"><strong>' + esc(connector.name) + '</strong><span>' + esc(meta) + '</span><small class="workspace-note">' + esc((connector.capabilities || []).join(" · ")) + '</small></div>' + action + '</div>';
  }).join("") + setup;
}
window.connectProjectConnector = async function (id) {
  try {
    var result = await api("/api/project-connectors/" + encodeURIComponent(id) + "/connect", { method: "POST" });
    if (!result || !result.authorizationUrl) throw new Error("No authorization URL was returned");
    window.location.assign(result.authorizationUrl);
  } catch (error) { toast((error && error.message) || "Could not start authorization"); }
};
window.refreshProjectConnector = async function (id) {
  try { await api("/api/project-connectors/" + encodeURIComponent(id) + "/status"); await renderPlugins(); }
  catch (error) { toast((error && error.message) || "Could not refresh authorization status"); }
};

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
