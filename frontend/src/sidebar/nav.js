import { toggleMorePopover } from "./morePopover.js";

/* React migration bridge — publishes scheduled task state so the React
   compatibility root can render the page. Installed by
   frontend/src/react/pages/scheduled/scheduledStore.ts under `?react=1`. */
function _publishScheduledState() {
  try {
    var bridge = window.__socratesScheduledBridge;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({
        tasks: (workspaceCache.tasks || []).map(function (t) {
          return { id: t.id, title: t.title, prompt: t.prompt || "", frequency: t.frequency || "once", nextRunAt: t.nextRunAt || null, status: t.status || "active" };
        }),
        loading: false,
        error: null,
      });
    }
  } catch (_) { /* swallow */ }
}

/* React migration bridge — publishes workspace page state (library,
   projects, plugins) so the React compatibility root can render.
   Installed by frontend/src/react/pages/workspace/workspaceStore.ts
   under `?react=1`. */
function _publishWorkspaceState() {
  try {
    var bridge = window.__socratesWorkspaceBridge;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({
        activePage: null,
        libraryData: { files: workspaceCache.library.files || [], artifacts: workspaceCache.library.artifacts || [], tab: (document.querySelector(".library-tab.active") && document.querySelector(".library-tab.active").dataset.libraryTab) || "files", query: workspaceCache.library.query || "", selection: workspaceCache.library.selection || {}, renameItem: workspaceCache.library.renameItem },
        projectsData: workspaceCache.projects || [],
        pluginsData: workspaceCache.connectors || [],
        projectConnectorConfigured: !!workspaceCache.projectConnectorConfigured,
        loading: false,
        error: null,
      });
    }
  } catch (_) { /* swallow */ }
}

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
import tencentRaw from "@lobehub/icons-static-svg/icons/tencent-color.svg?raw";
import microsoftRaw from "@lobehub/icons-static-svg/icons/microsoft-color.svg?raw";

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
  var gmailIcon = '<svg viewBox="0 0 24 18" aria-hidden="true"><path fill="#fff" d="M2.25 0h19.5A2.25 2.25 0 0 1 24 2.25v13.5A2.25 2.25 0 0 1 21.75 18H2.25A2.25 2.25 0 0 1 0 15.75V2.25A2.25 2.25 0 0 1 2.25 0z"/><path fill="#EA4335" d="M2.1 3.36V16.2H5.4V6.1L12 11.05l6.6-4.95v10.1h3.3V3.36L12 10.8z"/><path fill="#FBBC04" d="M0 3.36 5.4 7.4V3.32L0 0z"/><path fill="#34A853" d="M18.6 7.4 24 3.36V0l-5.4 3.32z"/><path fill="#4285F4" d="M18.6 16.2h3.3V3.36l-3.3 2.74z"/><path fill="#C5221F" d="M2.1 16.2h3.3V6.1L2.1 3.36z"/></svg>';
  var googleDriveIcon = '<svg viewBox="0 0 24 21" aria-hidden="true"><path fill="#1A73E8" d="M14.4 0 24 16.63 21.6 20.8 12 4.17z"/><path fill="#34A853" d="M9.6 0 0 16.63 2.4 20.8 12 4.17z"/><path fill="#FBBC04" d="M2.4 20.8 4.8 16.63h19.2l-2.4 4.17z"/></svg>';
  var googleCalendarIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path fill="#4285F4" d="M22 8H2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path fill="#34A853" d="M4 22h16a2 2 0 0 0 2-2v-4H2v4a2 2 0 0 0 2 2z"/><path fill="#FBBC04" d="M2 8h5v8H2z"/><path fill="#EA4335" d="M17 8h5v8h-5z"/><path fill="#1A73E8" d="M9.2 11.3h2.1v6.1H9.8v-4.2l-1.1.7-.7-1.1zM13.2 16.7l.9-.9c.4.4.8.6 1.3.6.6 0 1-.3 1-.8s-.4-.8-1.1-.8h-.7l-.2-.8 1.4-1.5h-2.3v-1.2h4.2v1.1l-1.5 1.5c.9.2 1.7.7 1.7 1.7 0 1.2-.9 2-2.4 2-.9 0-1.7-.3-2.3-.9z"/></svg>';
  var todoistIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#E44332" d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path fill="#fff" d="M7.1 7.35 5.7 6.5l1.4-.85 1.4.85zm2.2-.85h9v1.7h-9zM7.1 12.85 5.7 12l1.4-.85 1.4.85zm2.2-.85h9v1.7h-9zM7.1 18.35l-1.4-.85 1.4-.85 1.4.85zm2.2-.85h7.2v1.7H9.3z"/></svg>';
  var ticktickIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" fill="#4772FA" rx="5"/><path fill="#fff" d="m10.1 15.7-3.6-3.6 1.7-1.7 1.9 1.9 5.8-5.8 1.7 1.7z"/><path fill="#AFC2FF" d="M18.5 16.5a6.5 6.5 0 1 1-1.1-9l-1.6 1.6a4.2 4.2 0 1 0 .9 5.8z"/></svg>';
  var discordIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" fill="#5865F2" rx="6"/><path fill="#fff" d="M17.8 7.1a13.2 13.2 0 0 0-3.1-1l-.4.8a11.3 11.3 0 0 0-4.6 0l-.4-.8a13.2 13.2 0 0 0-3.1 1C4.2 10 3.7 12.8 4 15.6a12.7 12.7 0 0 0 3.8 1.9l.8-1.3c-.4-.2-.8-.4-1.2-.6l.3-.2a9.3 9.3 0 0 0 8.6 0l.3.2c-.4.2-.8.5-1.2.6l.8 1.3a12.7 12.7 0 0 0 3.8-1.9c.4-3.2-.6-5.9-2.2-8.5zM9.3 14.2c-.7 0-1.2-.6-1.2-1.3s.5-1.3 1.2-1.3 1.2.6 1.2 1.3-.5 1.3-1.2 1.3zm5.4 0c-.7 0-1.2-.6-1.2-1.3s.5-1.3 1.2-1.3 1.2.6 1.2 1.3-.5 1.3-1.2 1.3z"/></svg>';
  var oneDriveIcon = '<svg viewBox="0 0 24 16" aria-hidden="true"><path fill="#0364B8" d="M9.3 3.6A5.9 5.9 0 0 1 18 8.8l-4.9 2.1-6.8-2.8z"/><path fill="#0078D4" d="M5.8 6.2a4.7 4.7 0 0 1 7.4 4.7l-8.4.1L0 9a5 5 0 0 1 5.8-2.8z"/><path fill="#1490DF" d="M13.2 10.9 18 8.8a3.8 3.8 0 0 1 .5 7.2H5a5 5 0 0 1-.2-5z"/><path fill="#28A8EA" d="M0 9h4.8l8.4 1.9-3.6 5.1H5A5 5 0 0 1 0 9z"/></svg>';
  var outlookIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#0078D4" d="M9 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9z"/><path fill="#50A7F2" d="M22 7.2 15.6 12 22 16.8z"/><path fill="#0A5DB3" d="m9 8 6.6 4L9 16z"/><rect width="11" height="13" x="2" y="5.5" fill="#106EBE" rx="1.5"/><path fill="#fff" d="M7.5 15.1c-1.8 0-3-1.3-3-3.1s1.2-3.1 3-3.1 3 1.3 3 3.1-1.2 3.1-3 3.1zm0-1.3c.9 0 1.4-.7 1.4-1.8s-.5-1.8-1.4-1.8-1.4.7-1.4 1.8.5 1.8 1.4 1.8z"/></svg>';
  var gitlabIcon = '<svg viewBox="0 0 24 22" aria-hidden="true"><path fill="#E24329" d="m12 21.4 4.4-13.5H7.6z"/><path fill="#FC6D26" d="M12 21.4 7.6 7.9H1.5zM12 21.4l4.4-13.5h6.1z"/><path fill="#FCA326" d="M1.5 7.9.2 11.8a1 1 0 0 0 .36 1.14L12 21.4zM22.5 7.9l1.3 3.9a1 1 0 0 1-.36 1.14L12 21.4z"/><path fill="#E24329" d="M7.6 7.9 9.5 2a.65.65 0 0 1 1.24 0L12 7.9zM16.4 7.9 14.5 2a.65.65 0 0 0-1.24 0L12 7.9z"/></svg>';
  var qqMailIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" fill="#12B76A" rx="5"/><path fill="#fff" d="M4.5 7h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-8A1.5 1.5 0 0 1 4.5 7zm.9 2 6.6 4.6L18.6 9z"/></svg>';
  var tencentDocsIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" fill="#1677FF" rx="5"/><path fill="#fff" d="M7 5h7l3 3v11H7z"/><path fill="#BEDBFF" d="M14 5v4h4z"/><path fill="#1677FF" d="M9 11h6v1.3H9zm0 3h6v1.3H9z"/></svg>';
  var feishuIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#00D6B9" d="M5 4.2 12 2v6.9L5 11z"/><path fill="#3370FF" d="M12 2l7 2.2V11l-7-2.1z"/><path fill="#00A0FF" d="M5 13l7 2.1V22l-7-2.2z"/><path fill="#7B61FF" d="m12 15.1 7-2.1v6.8L12 22z"/></svg>';
  var arxivIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" fill="#B31B1B" rx="5"/><path fill="#fff" d="M5.3 16.8 10.1 6h1.7l4.8 10.8h-2l-1-2.4H8.2l-1 2.4zm3.6-4h4l-2-4.7z"/><path fill="#fff" d="M17.2 16.8v-7h1.6v7zM17 8.2V6.6h1.9v1.6z"/></svg>';
  var icons = {
    github: lobehubIcon(githubRaw),
    feishu: feishuIcon,
    'baidu-netdisk': lobehubIcon(baiduCloudRaw),
    gitee: lobehubIcon(giteeRaw),
    onedrive: oneDriveIcon,
    one_drive: oneDriveIcon,
    outlook: outlookIcon,
    notion: lobehubIcon(notionRaw),
    zotero: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.231 2.462 7.18 20.923h14.564V24H2.256v-2.462L16.308 3.076H2.975V0h18.256v2.462z"/></svg>',
    'qq-mail': qqMailIcon,
    qq_mail: qqMailIcon,
    gmail: gmailIcon,
    googledrive: googleDriveIcon,
    google_drive: googleDriveIcon,
    googlecalendar: googleCalendarIcon,
    google_calendar: googleCalendarIcon,
    todoist: todoistIcon,
    ticktick: ticktickIcon,
    discord: discordIcon,
    tencent_docs: tencentDocsIcon,
    tencent: lobehubIcon(tencentRaw),
    gitlab: gitlabIcon,
    microsoft: lobehubIcon(microsoftRaw),
    arxiv: arxivIcon
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

/* React migration bridge — publishes the active nav name so the React
   compatibility root can mirror the .active class via useSyncExternalStore.
   Installed by frontend/src/react/sidebar/sidebarRuntimeStore.ts under
   `?react=1`; legacy mode never sees a subscriber so the helper is a
   cheap no-op. */
function _publishSidebarNav(name) {
  try {
    var bridge = window.__socratesSidebarNavBridge;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({ activeNav: name == null ? null : String(name) });
    }
  } catch (_) { /* swallow — bridge is best-effort */ }
}

export function setActiveNav(name) {
  NAV_NAMES.forEach(function (nav) {
    var button = document.querySelector('.sidebar-nav-btn[data-nav="' + nav + '"]');
    if (button) button.classList.toggle("active", nav === name);
  });
  _publishSidebarNav(name);
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
  document.body.classList.remove("workspace-active");
}
window.hideMainPages = hideMainPages;

/* Show a single main-content page and hide the others. */
function showMainPage(pageId) {
  hideMainPages();
  var page = byId(pageId);
  if (page) page.classList.remove("hidden");
  if (pageId !== "examView") document.body.classList.add("workspace-active");
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

export function openLibrary() {
  hideChatAndTopic();
  showMainPage("libraryPanel");
  if (typeof window.__socratesMountWorkspace === "function") {
    window.__socratesMountWorkspace("library");
  }
  renderLibrary();
}
async function renderLibrary() {
  /* #libraryList is React-owned (WorkspacePage) — never write its DOM
     here; fetch, update the cache, and publish through the bridge. */
  try {
    var results = await Promise.all([api("/api/files?limit=100"), api("/api/artifacts?limit=100")]);
    workspaceCache.library.files = results[0].files || [];
    workspaceCache.library.artifacts = results[1].artifacts || [];
    paintLibrary();
    _publishWorkspaceState();
  } catch (err) {
    workspaceCache.library.files = [];
    workspaceCache.library.artifacts = [];
    _publishWorkspaceState();
    toast(err && err.status === 401
      ? "Sign in to upload files and create artifacts."
      : "Your library could not be loaded. Try again.");
  }
}
function paintLibrary() {
  return;
}

function getLibraryKey() {
  var tab = document.querySelector(".library-tab.active");
  return tab && tab.dataset.libraryTab === "artifacts" ? "artifacts" : "files";
}

window.toggleLibrarySelect = function (id, checked) {
  var sel = workspaceCache.library.selection;
  if (checked) sel[id] = true; else delete sel[id];
  paintLibrary();
  _publishWorkspaceState();
};

window.toggleSelectAllLibrary = function (checked) {
  var key = getLibraryKey();
  var items = workspaceCache.library[key];
  var sel = workspaceCache.library.selection;
  items.forEach(function (item) {
    if (checked) sel[item.id] = true; else delete sel[item.id];
  });
  paintLibrary();
  _publishWorkspaceState();
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
  _publishWorkspaceState();
};

window.cancelLibraryRename = function () {
  workspaceCache.library.renameItem = null;
  paintLibrary();
  _publishWorkspaceState();
};

window.saveLibraryRename = async function (input) {
  var id = input.dataset.renameId;
  var key = input.dataset.renameKey;
  var newName = input.value.trim();
  workspaceCache.library.renameItem = null;
  if (!newName) { paintLibrary(); _publishWorkspaceState(); return; }
  var oldItem = workspaceCache.library[key].filter(function (i) { return i.id === id; })[0];
  var oldName = oldItem ? (oldItem.name || oldItem.title) : "";
  if (newName === oldName) { paintLibrary(); _publishWorkspaceState(); return; }
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
    _publishWorkspaceState();
  } catch (_) { toast("Could not rename"); paintLibrary(); _publishWorkspaceState(); }
};

window.renameArtifact = async function (id) {
  /* Reuse the rename flow by starting rename on the artifact */
  window.startLibraryRename(id, "artifacts");
};

export function openProjects() {
  hideChatAndTopic();
  showMainPage("spacesPanel");
  if (typeof window.__socratesMountWorkspace === "function") {
    window.__socratesMountWorkspace("projects");
  }
  renderProjects();
}
async function renderProjects() {
  /* #spacesList is React-owned (WorkspacePage) — never write its DOM
     here; fetch, update the cache, and publish through the bridge. */
  try {
    var res = await api("/api/projects");
    workspaceCache.projects = (res && res.projects) || [];
    paintProjects();
    _publishWorkspaceState();
  } catch (err) {
    workspaceCache.projects = [];
    _publishWorkspaceState();
    toast(err && err.status === 401
      ? "Sign in to create projects."
      : "Projects could not be loaded. Try again.");
  }
}
function paintProjects() {
  return;
}

export function openScheduled() {
  hideChatAndTopic();
  showMainPage("scheduledPanel");
  if (typeof window.__socratesMountScheduled === "function") {
    window.__socratesMountScheduled();
  }
}

/* Expose renderScheduled on window so the React mount can trigger the
   fetch/bridge flow. */
window.__socratesNavRenderScheduled = function () { renderScheduled(); };

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
  _publishScheduledState();
}
function paintScheduled() {
  return;
}

export function openPlugins() {
  hideChatAndTopic();
  showMainPage("pluginsPanel");
  if (typeof window.__socratesMountWorkspace === "function") {
    window.__socratesMountWorkspace("plugins");
  }
  renderPlugins();
}
async function renderPlugins() {
  /* #pluginsList is React-owned (WorkspacePage) — never write its DOM
     here; fetch, update the cache, and publish through the bridge. */
  try {
    var res = await api("/api/project-connectors");
    workspaceCache.connectors = (res && res.connectors) || [];
    workspaceCache.projectConnectorConfigured = !!(res && res.configured);
    paintPlugins();
    _publishWorkspaceState();
  } catch (err) {
    workspaceCache.connectors = [];
    _publishWorkspaceState();
    toast(err && err.status === 401
      ? "Sign in to connect apps."
      : "Apps could not be loaded. Try again.");
  }
}
function paintPlugins() {
  return;
}
window.connectProjectConnector = async function (id) {
  try {
    var result = await api("/api/project-connectors/" + encodeURIComponent(id) + "/connect", { method: "POST" });
    if (!result || !result.authorizationUrl) throw new Error("No authorization URL was returned");
    window.location.assign(result.authorizationUrl);
  } catch (error) { toast((error && error.message) || "Could not start authorization"); }
};
window.refreshProjectConnector = async function (id) {
  try { await api("/api/project-connectors/" + encodeURIComponent(id) + "/status"); await renderPlugins(); _publishWorkspaceState(); }
  catch (error) { toast((error && error.message) || "Could not refresh authorization status"); }
};
window.openProjectConnectorForm = function (id) {
  var connector = (workspaceCache.connectors || []).filter(function (c) { return c.id === id; })[0];
  if (!connector || !connector.credentialInput || !connector.credentialInput.fields) {
    toast("This connector is missing a credential form."); return;
  }
  var fieldsHtml = connector.credentialInput.fields.map(function (f) {
    var help = f.help ? '<p class="workspace-note">' + esc(f.help) + '</p>' : "";
    var required = f.required ? " required" : "";
    return '<label class="workspace-field"><span>' + esc(f.label) + '</span><input name="' + esc(f.key) + '" type="' + esc(f.type || "text") + '"' + required + ' autocomplete="off" spellcheck="false"></label>' + help;
  }).join("");
  showDialog('<div class="workspace-dialog-title"><div><h2>Connect ' + esc(connector.name) + '</h2><p>' + esc(connector.description) + '</p></div><button onclick="closeWorkspaceDialog()" aria-label="Close">×</button></div><form id="projectConnectorForm" class="workspace-form">' + fieldsHtml + '<div class="workspace-dialog-actions"><span></span><button type="button" class="workspace-secondary" onclick="closeWorkspaceDialog()">Cancel</button><button class="workspace-primary" type="submit">Connect</button></div></form>');
  var authType = connector.authType;
  byId("projectConnectorForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var submit = form.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = "Connecting…";
    var body;
    if (authType === "api_key") {
      body = { apiKey: form.elements[connector.credentialInput.fields[0].key].value };
    } else {
      var values = {};
      connector.credentialInput.fields.forEach(function (f) { values[f.key] = form.elements[f.key].value; });
      body = { values: values };
    }
    try {
      var result = await api("/api/project-connectors/" + encodeURIComponent(id) + "/connect", { method: "POST", body: body });
      if (!result || result.status !== "connected") throw new Error((result && result.error) || "Could not connect.");
      closeWorkspaceDialog(); renderPlugins(); toast(connector.name + " connected");
    } catch (err) {
      toast((err && err.message) || (connector.name + " could not be connected"));
      submit.disabled = false; submit.textContent = "Connect";
    }
  });
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

window.switchLibraryTab = function (tab) { document.querySelectorAll(".library-tab").forEach(function (button) { button.classList.toggle("active", button.dataset.libraryTab === tab); }); paintLibrary(); _publishWorkspaceState(); };
window.filterLibrary = function (query) { workspaceCache.library.query = query || ""; paintLibrary(); _publishWorkspaceState(); };
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
