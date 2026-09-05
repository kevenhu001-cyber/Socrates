import { toggleMorePopover } from "./morePopover.js";
import { stateStore } from "../state/store.js";
import { showToast } from "../ui/toast.js";

/* React migration bridge — publishes scheduled task state so the React
   compatibility root can render the page. Installed by
   frontend/src/react/pages/scheduled/scheduledStore.ts under `?react=1`. */
function _publishScheduledState(overrides) {
  try {
    var bridge = window.__socratesScheduledBridge;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({
        tasks: (workspaceCache.tasks || []).map(function (t) {
          return { id: t.id, title: t.title, prompt: t.prompt || "", frequency: t.frequency || "once", nextRunAt: t.nextRunAt || null, status: t.status || "active", lastRunAt: t.lastRunAt || null, runCount: t.runCount || 0, projectId: t.projectId || null, agentKind: t.agentKind || "native", lastRunId: t.lastRunId || null, runPolicy: t.runPolicy || {}, notificationConfig: t.notificationConfig || {} };
        }),
        loading: !!(overrides && overrides.loading),
        error: (overrides && overrides.error) || null,
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
        mcpData: workspaceCache.mcp || [],
        mcpConfigured: !!workspaceCache.mcpConfigured,
        mcpProjectId: workspaceCache.mcpProjectId || null,
        loading: false,
        error: null,
      });
    }
  } catch (_) { /* swallow */ }
}

/* Connector brand marks prefer real brand-asset URLs (SimpleIcons CDN for
   most services, each vendor's own brand URL for the rest) so the user
   sees an actual brand mark, not a hand-drawn approximation. LobeHub
   SVGs are kept as the offline fallback for the six connectors they
   ship. `lobehubIcon` strips Lobehub's inline 1em sizing, inline style,
   xmlns, and <title> so the offline fallback renders with the same
   viewBox + currentColor contract. */
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

const CONNECTOR_OFFLINE_SVG = {
  github: lobehubIcon(githubRaw),
  notion: lobehubIcon(notionRaw),
  gitee: lobehubIcon(giteeRaw),
  baiducloud: lobehubIcon(baiduCloudRaw),
  'baidu-netdisk': lobehubIcon(baiduCloudRaw),
  tencent: lobehubIcon(tencentRaw),
  microsoft: lobehubIcon(microsoftRaw),
};

var NAV_NAMES = ["library", "projects", "scheduled", "plugins", "exam", "admin", "more"];
var workspaceCache = { library: { files: [], artifacts: [], query: "", selection: {}, renameItem: null }, projects: [], tasks: [], connectors: [], mcp: [], mcpConfigured: false, mcpProjectId: null };
var WORKSPACE_ROUTES = { library: "/library", projects: "/projects", scheduled: "/scheduled", plugins: "/plugins", exam: "/exam", admin: "/admin" };
var CONNECTOR_RETURN_CONTEXT_KEY = "socrates-connector-return-v1";
var CONNECTOR_RETURN_CONTEXT_TTL = 10 * 60 * 1000;

function byId(id) { return document.getElementById(id); }
/* window.t returns the KEY itself when a translation is missing — pass
   that miss through to the English fallback instead of leaking raw keys
   like "dialog.task.newTitle" into dialog markup. */
function t(key, fallback) {
  if (typeof window.t !== "function") return fallback;
  var v = window.t(key);
  return v !== key ? v : (fallback !== undefined ? fallback : key);
}
function esc(value) { return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function api(path, options) { return window.apiFetch(path, options); }
function toast(message) { showToast(message); }
function confirmAction(title, message) { return typeof window.showConfirm === "function" ? window.showConfirm(title, message, true) : Promise.resolve(window.confirm(message)); }
function normaliseProviderId(provider) {
  return String(provider || "").toLowerCase().replace(/[_-]/g, "");
}

function connectorIcon(provider) {
  var key = normaliseProviderId(provider);
  /* P_perf-local-icons — connector brand marks used to load from
     icon.horse / simpleicons / raw.githubusercontent.com, which can hang
     on mobile networks (especially in CN) and stall page switches. All
     connectors now render local SVG marks or a monogram fallback. */
  var offline = CONNECTOR_OFFLINE_SVG[key] || CONNECTOR_OFFLINE_SVG[provider];
  if (offline) return offline;
  return '<span class="connector-logo-fallback" style="display:flex" aria-hidden="true">'
    + esc(String(provider || "?").slice(0, 2).toUpperCase()) + '</span>';
}
/* React composer/plugin surfaces reuse the same local brand marks as the
   legacy connector panel. Keep the adapter on window so the React module
   does not duplicate Vite's raw SVG imports or introduce a second icon map. */
window.getConnectorIconMarkup = connectorIcon;

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
    if (button) {
      var active = nav === name;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  });
  _publishSidebarNav(name);
}

/* Hide sidebar-only panels (knowledge, mistakes). Does NOT touch
   the recents panel (always visible) or main-content pages. */
export function closeAllPanels() {
  ["knowledgePanel", "mistakesPanel"].forEach(function (id) { var p = byId(id); if (p) p.classList.add("hidden"); });
  ["tabKnowledge", "tabRecents", "tabMistakes"].forEach(function (id) { var b = byId(id); if (b) b.classList.remove("active"); });
}

/* Hide all main-content pages (library, projects, scheduled, plugins, exam, admin). */
function hideMainPages() {
  ["libraryPanel", "spacesPanel", "scheduledPanel", "pluginsPanel", "adminPanel", "examView"].forEach(function (id) { var p = byId(id); if (p) p.classList.add("hidden"); });
  document.body.classList.remove("workspace-active");
  document.body.classList.remove("admin-active");
  /* Leaving exam via sidebar nav must also drop the exam-active body
     class, otherwise CSS keeps hiding the mode switcher and other
     chat top-bar elements (exam.js only removes it in closeExamView). */
  document.body.classList.remove("exam-active");
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

function safeConnectorReturnPath(value) {
  var path = String(value || "");
  if (!path || path.length > 512 || path.charAt(0) !== "/" || path.indexOf("//") === 0 || path.indexOf("\\") >= 0) return "/";
  return path;
}

function composerReturnSnapshot() {
  var bridge = window.__socratesComposerPluginSelectionBridge;
  var snapshot = bridge && typeof bridge.getSnapshot === "function" ? bridge.getSnapshot() : { topic: [], chat: [] };
  var controller = window.__socratesComposerController;
  var draft = function (surface) {
    try {
      return controller && typeof controller.getMarkdown === "function" ? controller.getMarkdown(surface) : "";
    } catch (_) { return ""; }
  };
  var serialisePlugins = function (plugins) {
    return (Array.isArray(plugins) ? plugins : []).slice(0, 8).map(function (plugin) {
      var id = String(plugin && plugin.id || "").trim();
      if (!id) return null;
      var icon = typeof window.getConnectorIconMarkup === "function" ? window.getConnectorIconMarkup(id) : "";
      return {
        id: id,
        name: String(plugin.name || id).slice(0, 120),
        description: String(plugin.description || "").slice(0, 240),
        capabilities: Array.isArray(plugin.capabilities) ? plugin.capabilities.slice(0, 8).map(function (item) { return String(item).slice(0, 80); }) : [],
        directiveTemplate: plugin.directiveTemplate ? String(plugin.directiveTemplate).slice(0, 300) : undefined,
        iconMarkup: icon || "",
      };
    }).filter(Boolean);
  };
  var activeTrigger = document.querySelector(".composer-tools-trigger[aria-expanded='true']");
  return {
    topic: serialisePlugins(snapshot.topic),
    chat: serialisePlugins(snapshot.chat),
    drafts: { topic: draft("topic"), chat: draft("chat") },
    surface: activeTrigger && activeTrigger.dataset ? activeTrigger.dataset.composerMode || null : null,
  };
}

function rememberConnectorReturnContext(connectorId) {
  try {
    sessionStorage.setItem(CONNECTOR_RETURN_CONTEXT_KEY, JSON.stringify({
      connectorId: String(connectorId || ""),
      returnPath: location.pathname + location.search + location.hash,
      createdAt: Date.now(),
      composer: composerReturnSnapshot(),
    }));
  } catch (_) { /* storage can be unavailable in private/embedded contexts */ }
}

function readConnectorReturnContext() {
  try {
    var raw = sessionStorage.getItem(CONNECTOR_RETURN_CONTEXT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(CONNECTOR_RETURN_CONTEXT_KEY);
    var context = JSON.parse(raw);
    if (!context || Date.now() - Number(context.createdAt || 0) > CONNECTOR_RETURN_CONTEXT_TTL) return null;
    return context;
  } catch (_) { return null; }
}

function restoreComposerReturnState(composer) {
  if (!composer) return;
  var controller = window.__socratesComposerController;
  if (controller && typeof controller.setMarkdown === "function" && composer.drafts) {
    ["topic", "chat"].forEach(function (surface) {
      if (typeof composer.drafts[surface] === "string") {
        try { controller.setMarkdown(surface, composer.drafts[surface]); } catch (_) {}
      }
    });
  }
  var bridge = window.__socratesComposerPluginSelectionBridge;
  if (!bridge || typeof bridge.dispatch !== "function") return;
  ["topic", "chat"].forEach(function (surface) {
    var plugins = composer[surface];
    if (!Array.isArray(plugins)) return;
    try {
      bridge.dispatch({ type: "replace", surface: surface, plugins: plugins.map(function (plugin) {
        var id = String(plugin && plugin.id || "").trim();
        return {
          id: id,
          name: String(plugin && plugin.name || id),
          description: String(plugin && plugin.description || ""),
          capabilities: Array.isArray(plugin && plugin.capabilities) ? plugin.capabilities.map(String) : [],
          directiveTemplate: plugin && plugin.directiveTemplate ? String(plugin.directiveTemplate) : undefined,
          iconMarkup: typeof window.getConnectorIconMarkup === "function" ? window.getConnectorIconMarkup(id) : "",
        };
      }).filter(function (plugin) { return plugin.id; }) });
    } catch (_) {}
  });
}

function restoreConnectorReturnContext() {
  var params = new URLSearchParams(location.search);
  if (!params.get("connector")) return false;
  var context = readConnectorReturnContext();
  if (!context) return false;
  var returnPath = safeConnectorReturnPath(context.returnPath);
  restoreComposerReturnState(context.composer);
  history.replaceState(null, "", returnPath);

  var workspace = workspaceForPath(new URL(returnPath, location.origin).pathname);
  if (workspace && workspace !== "plugins") {
    openNav(workspace, { fromRoute: true });
    return true;
  }
  if (workspace === "plugins") return false;

  hideMainPages();
  var query = new URLSearchParams(new URL(returnPath, location.origin).search);
  var chatId = query.get("chat");
  var topic = byId("topicSetup");
  var chat = byId("chatView");
  var diagnostic = byId("diagnosticView");
  if (chatId && typeof window.loadSession === "function") {
    if (topic) topic.classList.add("hidden");
    if (diagnostic) diagnostic.classList.add("hidden");
    if (chat) chat.classList.remove("hidden");
    if (typeof window.toggleChatTopBarEls === "function") window.toggleChatTopBarEls(true);
    Promise.resolve(window.loadSession(chatId)).catch(function () {});
  } else {
    if (topic) topic.classList.remove("hidden");
    if (chat) chat.classList.add("hidden");
    if (diagnostic) diagnostic.classList.add("hidden");
    if (typeof window.toggleChatTopBarEls === "function") window.toggleChatTopBarEls(false);
  }
  if (context.connectorId && typeof window.refreshProjectConnector === "function") {
    setTimeout(function () { window.refreshProjectConnector(context.connectorId); }, 0);
  }
  return true;
}

window.rememberConnectorReturnContext = rememberConnectorReturnContext;
function pushWorkspaceRoute(name) {
  var next = WORKSPACE_ROUTES[name];
  if (next && location.pathname !== next) history.pushState({ workspace: name }, "", next);
}
export function openNav(name, options) {
  var openers = { library: openLibrary, projects: openProjects, scheduled: openScheduled, plugins: openPlugins, exam: openExam, admin: openAdmin, more: openMoreNav };
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
  var labelText = t("confirm.label." + label, label);
  var title = t("confirm.deleteItems.title", "Delete {n} {label}?").replace("{n}", ids.length).replace("{label}", labelText);
  if (!(await confirmAction(title, t("confirm.cannotUndo", "This cannot be undone.")))) return;
  try {
    await Promise.all(ids.map(function (id) {
      return api("/api/" + label + "/" + encodeURIComponent(id), { method: "DELETE" });
    }));
    workspaceCache.library.selection = {};
    toast(ids.length + " " + label + " deleted");
    renderLibrary();
  } catch (_) { toast(t("toast.deleteSomeFailed", "Could not delete some items")); }
};

window.startLibraryRename = function (id) {
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
    toast(t("toast.renamed", "Renamed"));
    paintLibrary();
    _publishWorkspaceState();
  } catch (_) { toast(t("toast.renameFailed", "Could not rename")); paintLibrary(); _publishWorkspaceState(); }
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
  /* #scheduledList is React-owned (ScheduledPage) — fetch, update the
     cache, and publish through the bridge. */
  if (!workspaceCache.tasks.length) _publishScheduledState({ loading: true });
  try {
    var res = await api("/api/scheduled-tasks");
    workspaceCache.tasks = (res && res.tasks) || [];
    _publishScheduledState();
  } catch (err) {
    workspaceCache.tasks = [];
    _publishScheduledState({
      error: err && err.status === 401
        ? t("scheduled.signIn", "Sign in to schedule tasks.")
        : t("scheduled.loadFailed", "Tasks could not be loaded. Try again.")
    });
  }
}

/* The view (topic / chat / diagnostic) that was visible before the
   plugin center took over the main pane. The in-page back button
   restores exactly this view so "back" never drops the user on a
   blank shell. Defaults to the topic setup on a direct /plugins load. */
var PLUGINS_RETURN_VIEW = "topicSetup";
function currentMainView() {
  var chat = byId("chatView");
  if (chat && !chat.classList.contains("hidden")) return "chatView";
  var diagnostic = byId("diagnosticView");
  if (diagnostic && !diagnostic.classList.contains("hidden")) return "diagnosticView";
  return "topicSetup";
}
export function openPlugins() {
  PLUGINS_RETURN_VIEW = currentMainView();
  hideChatAndTopic();
  showMainPage("pluginsPanel");
  if (typeof window.__socratesMountWorkspace === "function") {
    window.__socratesMountWorkspace("plugins");
  }
  restoreConnectorReturnContext();
  renderPlugins();
}
/* In-page back button on the plugin center. History-back is unreliable
   here: the previous entry may be a bare "/" which no workspace route
   owns, leaving the panel stuck open. Exit explicitly instead. */
window.exitPluginsView = function () {
  hideMainPages();
  setActiveNav(null);
  var view = PLUGINS_RETURN_VIEW || "topicSetup";
  var topic = byId("topicSetup");
  var chat = byId("chatView");
  var diagnostic = byId("diagnosticView");
  if (topic) topic.classList.add("hidden");
  if (chat) chat.classList.add("hidden");
  if (diagnostic) diagnostic.classList.add("hidden");
  var target = byId(view) || topic;
  if (target) target.classList.remove("hidden");
  if (typeof window.toggleChatTopBarEls === "function") window.toggleChatTopBarEls(view === "chatView");
  try { history.pushState({}, "", "/"); } catch (_) { /* non-critical */ }
  PLUGINS_RETURN_VIEW = "topicSetup";
};
export function openAdmin() {
  hideChatAndTopic();
  showMainPage("adminPanel");
  /* Standalone operator page: drop the chat top-bar chrome (mode
     switch, model picker, find, share) via body.admin-active.
     hideMainPages() removes it on every exit path. */
  document.body.classList.add("admin-active");
  if (typeof window.__socratesMountAdmin === "function") {
    window.__socratesMountAdmin();
  }
}
async function renderPlugins() {
  /* #pluginsList is React-owned (WorkspacePage) — never write its DOM
     here; fetch, update the cache, and publish through the bridge. */
  try {
    var projectId = window.stateStore.read("currentProjectId") || null;
    var res = await api("/api/project-connectors").catch(function () { return {}; });
    var mcp = await api("/api/agent-mcp" + (projectId ? "?projectId=" + encodeURIComponent(projectId) : "")).catch(function () { return { enabled: false, configured: false, servers: [] }; });
    workspaceCache.connectors = (res && res.connectors) || [];
    workspaceCache.projectConnectorConfigured = !!(res && res.configured);
    workspaceCache.mcp = (mcp && mcp.servers) || [];
    workspaceCache.mcpConfigured = !!(mcp && mcp.configured);
    workspaceCache.mcpProjectId = (mcp && mcp.projectId) || projectId || null;
    paintPlugins();
    _publishWorkspaceState();
  } catch (err) {
    workspaceCache.connectors = [];
    workspaceCache.mcp = [];
    workspaceCache.mcpConfigured = false;
    _publishWorkspaceState();
    toast(err && err.status === 401
      ? "Sign in to connect apps."
      : "Apps could not be loaded. Try again.");
  }
}
function paintPlugins() {
  return;
}

window.toggleCodexMcp = async function (key, enabled) {
  try {
    var projectId = workspaceCache.mcpProjectId || window.stateStore.read("currentProjectId") || null;
    await api("/api/agent-mcp/" + encodeURIComponent(key), { method: "PATCH", body: { enabled: !!enabled, projectId: projectId || null } });
    await renderPlugins();
    toast(enabled ? "Codex tool enabled" : "Codex tool disabled");
  } catch (error) { toast((error && error.message) || "Could not update Codex tool"); }
};

window.checkCodexMcpHealth = async function (key) {
  try {
    var projectId = workspaceCache.mcpProjectId || window.stateStore.read("currentProjectId") || null;
    await api("/api/agent-mcp/" + encodeURIComponent(key) + "/health", { method: "POST", body: { projectId: projectId || null } });
    await renderPlugins();
  } catch (error) { toast((error && error.message) || "Could not check MCP server"); }
};
window.connectProjectConnector = async function (id) {
  try {
    var result = await api("/api/project-connectors/" + encodeURIComponent(id) + "/connect", { method: "POST" });
    if (!result || !result.authorizationUrl) throw new Error("No authorization URL was returned");
    rememberConnectorReturnContext(id);
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
    toast(t("toast.connectorNoForm", "This connector is missing a credential form.")); return;
  }
  var fieldsHtml = connector.credentialInput.fields.map(function (f) {
    var help = f.help ? '<p class="workspace-note">' + esc(f.help) + '</p>' : "";
    var required = f.required ? " required" : "";
    return '<label class="workspace-field"><span>' + esc(f.label) + '</span><input name="' + esc(f.key) + '" type="' + esc(f.type || "text") + '"' + required + ' autocomplete="off" spellcheck="false"></label>' + help;
  }).join("");
  showDialog('<div class="workspace-dialog-title"><div><h2>Connect ' + esc(connector.name) + '</h2><p>' + esc(connector.description) + '</p></div><button onclick="closeWorkspaceDialog()" aria-label="' + t("dialog.close", "Close") + '">×</button></div><form id="projectConnectorForm" class="workspace-form">' + fieldsHtml + '<div class="workspace-dialog-actions"><span></span><button type="button" class="workspace-secondary" onclick="closeWorkspaceDialog()">' + t("common.cancel", "Cancel") + '</button><button class="workspace-primary" type="submit">Connect</button></div></form>');
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
function showDialog(markup, cardClass) { var dialog = ensureDialog(); var extraClass = cardClass === "library-file-preview-card" ? " " + cardClass : ""; dialog.innerHTML = '<div class="workspace-dialog-card' + extraClass + '">' + markup + "</div>"; dialog.classList.remove("hidden"); var focus = dialog.querySelector("input, textarea, select"); if (focus) setTimeout(function () { focus.focus(); }, 0); }
function closeWorkspaceDialog() { var dialog = byId("workspaceDialog"); if (dialog) { dialog.classList.add("hidden"); dialog.innerHTML = ""; } }

window.openCreateProject = function () { openProjectForm(null); };
window.openEditProject = function (id) { openProjectForm(workspaceCache.projects.filter(function (project) { return project.id === id; })[0] || null); };
function openProjectForm(project) {
  var editing = !!project;
  showDialog('<div class="workspace-dialog-title"><div><h2>' + (editing ? t("dialog.project.editTitle", "Edit project") : t("dialog.project.newTitle", "New project")) + '</h2><p>' + t("dialog.project.subtitle", "Give this work a home and a clear instruction.") + '</p></div><button onclick="closeWorkspaceDialog()" aria-label="' + t("dialog.close", "Close") + '">×</button></div><form id="projectForm" class="workspace-form"><label class="workspace-field"><span>' + t("dialog.field.name", "Name") + '</span><input name="name" maxlength="80" required value="' + esc(project && project.name) + '" placeholder="' + t("dialog.project.namePh", "Research, writing, a course…") + '"></label><label class="workspace-field"><span>' + t("dialog.field.description", "Description") + ' <em>' + t("dialog.optional", "Optional") + '</em></span><input name="description" maxlength="180" value="' + esc(project && project.description) + '" placeholder="' + t("dialog.project.descPh", "What are you working toward?") + '"></label><label class="workspace-field"><span>' + t("dialog.field.instructions", "Instructions") + ' <em>' + t("dialog.optional", "Optional") + '</em></span><textarea name="systemPrompt" rows="3" placeholder="' + t("dialog.project.instrPh", "How should Socrates approach work in this project?") + '">' + esc(project && project.systemPrompt) + '</textarea></label><label class="workspace-field"><span>' + t("dialog.field.color", "Color") + '</span><input name="color" type="color" value="' + esc((project && project.color) || "#c69a2d") + '"></label><div class="workspace-dialog-actions">' + (editing ? '<button type="button" class="workspace-danger" onclick="deleteProject(\'' + esc(project.id) + '\')">' + t("common.delete", "Delete") + '</button>' : "") + '<span></span><button type="button" class="workspace-secondary" onclick="closeWorkspaceDialog()">' + t("common.cancel", "Cancel") + '</button><button class="workspace-primary" type="submit">' + (editing ? t("dialog.project.save", "Save changes") : t("projects.create", "Create project")) + "</button></div></form>");
  byId("projectForm").addEventListener("submit", async function (event) { event.preventDefault(); var data = Object.fromEntries(new FormData(event.currentTarget)); try { if (editing) await api("/api/projects/" + project.id, { method: "PATCH", body: data }); else await api("/api/projects", { method: "POST", body: data }); closeWorkspaceDialog(); renderProjects(); toast(editing ? t("toast.projectUpdated", "Project updated") : t("toast.projectCreated", "Project created")); } catch (_) { toast(t("toast.projectSaveFailed", "Could not save project")); } });
}
window.deleteProject = async function (id) { if (!(await confirmAction(t("confirm.deleteProject.title", "Delete this project?"), t("confirm.deleteProject.msg", "This permanently deletes the project's chats, files, artifacts, and memories. This cannot be undone.")))) return; try { await api("/api/projects/" + id, { method: "DELETE" }); workspaceCache.projects = (workspaceCache.projects || []).filter(function (project) { return project.id !== id; }); if (Array.isArray(window.__projectsCache)) window.__projectsCache = window.__projectsCache.filter(function (project) { return project.id !== id; }); closeWorkspaceDialog(); renderProjects(); if (typeof window.refreshServerSessions === "function") window.refreshServerSessions(); toast(t("toast.projectDeleted", "Project deleted")); } catch (_) { toast(t("toast.projectDeleteFailed", "Could not delete project")); } };
function agentRunStatusLabel(status) {
  var labels = { completed: "Completed", running: "Running", starting: "Starting", planning: "Planning", awaiting_approval: "Needs approval", disconnected: "Ready to resume", failed: "Failed", interrupted: "Stopped" };
  return labels[String(status || "")] || String(status || "Unknown");
}
function agentRunTime(value) {
  if (!value) return "";
  var date = new Date(value);
  return isNaN(date.getTime()) ? "" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function renderProjectRunHistory(projectId) {
  var host = byId("projectRunHistory");
  if (!host) return;
  host.innerHTML = '<div class="workspace-loading">' + esc(t("dialog.project.runsLoading", "Loading Codex runs…")) + '</div>';
  api("/api/agent-runs?projectId=" + encodeURIComponent(projectId) + "&limit=8").then(function (result) {
    var runs = result && Array.isArray(result.runs) ? result.runs : [];
    var current = byId("projectRunHistory");
    if (!current) return;
    current.innerHTML = "";
    var heading = document.createElement("div");
    heading.className = "project-runtime-heading";
    heading.textContent = t("dialog.project.runsTitle", "Codex workspace runs");
    current.appendChild(heading);
    if (!runs.length) {
      var empty = document.createElement("p");
      empty.className = "workspace-note";
      empty.textContent = t("dialog.project.runsEmpty", "Runs, approvals, and generated artifacts will appear here.");
      current.appendChild(empty);
      return;
    }
    runs.forEach(function (run) {
      var row = document.createElement("div");
      row.className = "project-run-row";
      var copy = document.createElement("div");
      copy.className = "project-run-copy";
      var task = document.createElement("strong");
      task.textContent = run.task || t("dialog.project.untitledRun", "Untitled Codex task");
      var meta = document.createElement("span");
      meta.textContent = agentRunStatusLabel(run.status) + (agentRunTime(run.startedAt) ? " · " + agentRunTime(run.startedAt) : "");
      copy.appendChild(task);
      copy.appendChild(meta);
      var open = document.createElement("button");
      open.type = "button";
      open.className = "workspace-row-action project-run-open";
      open.textContent = t("dialog.project.viewRun", "View run");
      open.addEventListener("click", function () { window.openAgentRunDetails(run.id); });
      row.appendChild(copy);
      row.appendChild(open);
      current.appendChild(row);
    });
  }).catch(function () {
    var current = byId("projectRunHistory");
    if (current) current.innerHTML = '<p class="workspace-note">' + esc(t("dialog.project.runsFailed", "Run history is unavailable right now.")) + '</p>';
  });
}
window.openAgentRunDetails = async function (runId) {
  showDialog('<div class="workspace-dialog-title"><div><h2>' + t("dialog.project.runDetails", "Codex run") + '</h2><p>' + t("dialog.project.runDetailsLoading", "Loading the execution record…") + '</p></div><button onclick="closeWorkspaceDialog()" aria-label="' + t("dialog.close", "Close") + '">×</button></div><div id="agentRunDetails" class="agent-run-details"><div class="workspace-loading">' + esc(t("dialog.project.runsLoading", "Loading Codex runs…")) + '</div></div>');
  try {
    var result = await api("/api/agent-runs/" + encodeURIComponent(runId));
    var host = byId("agentRunDetails");
    if (!host) return;
    host.innerHTML = "";
    var run = result && result.run || {};
    var summary = document.createElement("p");
    summary.className = "agent-run-details-summary";
    summary.textContent = (run.summary || run.error || t("dialog.project.noRunSummary", "No summary was saved."));
    host.appendChild(summary);
    var status = document.createElement("div");
    status.className = "agent-run-details-status";
    status.textContent = agentRunStatusLabel(run.status) + (agentRunTime(run.startedAt) ? " · " + agentRunTime(run.startedAt) : "");
    host.appendChild(status);
    var artifacts = result && Array.isArray(result.artifacts) ? result.artifacts : [];
    if (artifacts.length) {
      var artifactTitle = document.createElement("strong");
      artifactTitle.className = "agent-run-details-section-title";
      artifactTitle.textContent = t("dialog.project.artifacts", "Created artifacts");
      host.appendChild(artifactTitle);
      var artifactList = document.createElement("ul");
      artifactList.className = "agent-run-artifacts";
      artifacts.forEach(function (artifact) { var item = document.createElement("li"); item.textContent = artifact.name || artifact.id; artifactList.appendChild(item); });
      host.appendChild(artifactList);
    }
    var events = result && Array.isArray(result.events) ? result.events : [];
    if (events.length) {
      var activity = document.createElement("details");
      activity.className = "agent-run-details-activity";
      var activityTitle = document.createElement("summary");
      activityTitle.textContent = t("dialog.project.activity", "Activity");
      activity.appendChild(activityTitle);
      var list = document.createElement("ol");
      events.slice(-40).forEach(function (event) { var item = document.createElement("li"); var payload = event.data || {}; item.textContent = String(event.event || "event") + (payload.command ? ": " + payload.command : payload.delta ? ": " + String(payload.delta).slice(0, 160) : ""); list.appendChild(item); });
      activity.appendChild(list);
      host.appendChild(activity);
    }
  } catch (error) {
    var failed = byId("agentRunDetails");
    if (failed) failed.textContent = (error && error.message) || t("dialog.project.runsFailed", "Run history is unavailable right now.");
  }
};
window.openProjectWorkspace = function (id) { var project = workspaceCache.projects.filter(function (item) { return item.id === id; })[0]; if (!project) return; showDialog('<div class="workspace-dialog-title"><div><h2>' + esc(project.name) + '</h2><p>' + esc(project.description || t("dialog.project.defaultDesc", "A focused place for related work.")) + '</p></div><button onclick="closeWorkspaceDialog()" aria-label="' + t("dialog.close", "Close") + '">×</button></div><div class="project-workspace-actions"><button class="workspace-primary" onclick="startProjectChat(\'' + esc(id) + '\')">' + t("dialog.project.newChat", "New chat in project") + '</button><button class="workspace-secondary" onclick="moveCurrentChatToProject(\'' + esc(id) + '\')">' + t("dialog.project.moveCurrent", "Move current chat here") + '</button></div><p class="workspace-note">' + t("dialog.project.note", "Project instructions are saved with the project. Files and chats remain available as shared context for future work.") + '</p><div id="projectRunHistory" class="project-run-history"></div>'); renderProjectRunHistory(id); };
window.startProjectChat = async function (id) { window._nextProjectId = id; window.__activeProject = workspaceCache.projects.filter(function (item) { return item.id === id; })[0] || null; closeWorkspaceDialog(); if (typeof window.resetApp === "function") await window.resetApp(); };
window.moveCurrentChatToProject = async function (id) { stateStore.dispatch({ type: "state/set", key: "currentProjectId", value: id }); window.__activeProject = workspaceCache.projects.filter(function (item) { return item.id === id; })[0] || null; var sessionId = stateStore.read("currentSessionId"); try { if (sessionId) await api("/api/sessions/" + encodeURIComponent(sessionId), { method: "PATCH", body: { projectId: id } }); closeWorkspaceDialog(); toast(t("toast.chatMoved", "Current chat moved to project")); if (typeof window.refreshServerSessions === "function") window.refreshServerSessions(); } catch (_) { toast(t("toast.chatMoveFailed", "Could not move the current chat")); } };

window.openCreateScheduledTask = function (initialPrompt) { openAgentTaskForm(null, initialPrompt || ""); };
window.openEditScheduledTask = function (id) { openAgentTaskForm(workspaceCache.tasks.filter(function (task) { return task.id === id; })[0] || null); };
/* datetime-local inputs expect wall-clock LOCAL time; toISOString()
   would render the stored timestamp shifted by the UTC offset. */
function toLocalDateTimeValue(value) {
  var d = new Date(value);
  if (isNaN(d.getTime())) return "";
  var p = function (n) { return String(n).length < 2 ? "0" + n : String(n); };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
}
/* Codex-aware scheduled task editor — the Scheduled page's first-class
   runtime form. */
function openAgentTaskForm(task, initialPrompt) {
  var editing = !!task;
  initialPrompt = String(initialPrompt || "");
  var next = task && task.nextRunAt ? toLocalDateTimeValue(task.nextRunAt) : "";
  var activeProjectId = (task && task.projectId) || window.stateStore.read("currentProjectId") || "";
  var projectOptions = '<option value="">' + esc(t("dialog.task.noProject", "No project")) + '</option>';
  (workspaceCache.projects || []).forEach(function (project) { projectOptions += '<option value="' + esc(project.id) + '">' + esc(project.name) + '</option>'; });
  showDialog('<div class="workspace-dialog-title"><div><h2>' + (editing ? t("dialog.task.editTitle", "Edit task") : t("dialog.task.newTitle", "Schedule a task")) + '</h2><p>' + t("dialog.task.subtitle", "Choose what should run and when to check back.") + '</p></div><button onclick="closeWorkspaceDialog()" aria-label="' + t("dialog.close", "Close") + '">×</button></div><form id="taskForm" class="workspace-form"><label class="workspace-field"><span>' + t("dialog.task.field", "Task") + '</span><input name="title" maxlength="120" required value="' + esc(task && task.title) + '" placeholder="' + t("dialog.task.titlePh", "Send me a weekly study plan") + '"></label><label class="workspace-field"><span>' + t("dialog.task.prompt", "Prompt") + '</span><textarea name="prompt" rows="3" placeholder="' + t("dialog.task.promptPh", "What should Socrates do when this task runs?") + '">' + esc(task && task.prompt) + '</textarea></label><div class="workspace-form-grid"><label class="workspace-field"><span>' + t("dialog.task.agent", "Agent") + '</span><select name="agentKind"><option value="native">' + t("dialog.task.nativeAgent", "Socrates · native tools") + '</option><option value="codex">' + t("dialog.task.codexAgent", "Codex · project workspace") + '</option></select></label><label class="workspace-field"><span>' + t("dialog.task.project", "Project") + '</span><select name="projectId">' + projectOptions + '</select></label></div><div class="workspace-form-grid"><label class="workspace-field"><span>' + t("dialog.task.repeat", "Repeat") + '</span><select name="frequency"><option value="once">' + t("scheduled.freq.once", "Once") + '</option><option value="daily">' + t("scheduled.freq.daily", "Daily") + '</option><option value="weekly">' + t("scheduled.freq.weekly", "Weekly") + '</option><option value="monthly">' + t("scheduled.freq.monthly", "Monthly") + '</option></select></label><label class="workspace-field"><span>' + t("dialog.task.firstRun", "First run") + '</span><input name="nextRunAt" type="datetime-local" value="' + esc(next) + '"></label></div><p class="workspace-note">' + t("dialog.task.codexNote", "Codex scheduled runs share the selected project workspace. Read-only work runs unattended; file changes, commands, and network side effects pause for approval.") + '</p><div class="workspace-dialog-actions">' + (editing ? '<button type="button" class="workspace-danger" onclick="deleteScheduledTask(\'' + esc(task.id) + '\')">' + t("common.delete", "Delete") + '</button>' : '') + '<span></span><button type="button" class="workspace-secondary" onclick="closeWorkspaceDialog()">' + t("common.cancel", "Cancel") + '</button><button class="workspace-primary" type="submit">' + (editing ? t("dialog.task.save", "Save task") : t("scheduled.createTask", "Create task")) + '</button></div></form>');
  var form = byId("taskForm");
  if (!editing && initialPrompt && form) {
    form.elements.title.value = initialPrompt.slice(0, 120);
    form.elements.prompt.value = initialPrompt;
  }
  form.elements.frequency.value = (task && task.frequency) || "once";
  form.elements.agentKind.value = (task && task.agentKind) || "native";
  form.elements.projectId.value = activeProjectId;
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var data = Object.fromEntries(new FormData(event.currentTarget));
    if (data.nextRunAt) { var when = new Date(data.nextRunAt); data.nextRunAt = isNaN(when.getTime()) ? null : when.toISOString(); }
    else if (editing) data.nextRunAt = null;
    else delete data.nextRunAt;
    if (!data.projectId) data.projectId = null;
    try {
      if (editing) await api("/api/scheduled-tasks/" + task.id, { method: "PATCH", body: data });
      else await api("/api/scheduled-tasks", { method: "POST", body: data });
      closeWorkspaceDialog(); renderScheduled(); toast(editing ? t("toast.taskUpdated", "Task updated") : t("toast.taskScheduled", "Task scheduled"));
    } catch (_) { toast(t("toast.taskSaveFailed", "Could not save task")); }
  });
}
window.toggleScheduledTask = async function (id, pause) { try { await api("/api/scheduled-tasks/" + id, { method: "PATCH", body: { status: pause ? "paused" : "active" } }); renderScheduled(); toast(pause ? t("toast.taskPaused", "Task paused") : t("toast.taskResumed", "Task resumed")); } catch (_) { toast(t("toast.taskUpdateFailed", "Could not update task")); } };
window.runScheduledTask = async function (id) { toast(t("toast.taskRunStarted", "Running task…")); try { await api("/api/scheduled-tasks/" + id + "/run", { method: "POST" }); renderScheduled(); if (typeof window.refreshServerSessions === "function") try { window.refreshServerSessions(); } catch (_) {} toast(t("toast.taskRunDone", "Task ran — see Recents for the result")); } catch (_) { renderScheduled(); toast(t("toast.taskRunFailed", "Could not run task")); } };
window.deleteScheduledTask = async function (id) { if (!(await confirmAction(t("confirm.deleteScheduled.title", "Delete this scheduled task?"), t("confirm.cannotUndo", "This cannot be undone.")))) return; try { await api("/api/scheduled-tasks/" + id, { method: "DELETE" }); closeWorkspaceDialog(); renderScheduled(); toast(t("toast.taskDeleted", "Task deleted")); } catch (_) { toast(t("toast.taskDeleteFailed", "Could not delete task")); } };

window.switchLibraryTab = function (tab) { document.querySelectorAll(".library-tab").forEach(function (button) { button.classList.toggle("active", button.dataset.libraryTab === tab); }); paintLibrary(); _publishWorkspaceState(); };
window.filterLibrary = function (query) { workspaceCache.library.query = query || ""; paintLibrary(); _publishWorkspaceState(); };
function libraryFileRawUrl(id) {
  return "/api/v2/files/" + encodeURIComponent(id) + "/raw?inline=1";
}

function libraryPreviewHeader(title, subtitle) {
  return '<div class="workspace-dialog-title"><div><h2>' + esc(title) + '</h2><p>' + esc(subtitle || "") + '</p></div><button onclick="closeWorkspaceDialog()" aria-label="' + t("dialog.close", "Close") + '">×</button></div>';
}

function openLibraryArtifactPreview(item) {
  var title = item && (item.title || item.name) || t("library.untitled", "Untitled");
  var source = item && item.source || "";
  showDialog(libraryPreviewHeader(title, t("library.preview.artifactSource", "Created item source")) + '<pre class="library-file-preview-text library-artifact-source">' + esc(source) + '</pre>', "library-file-preview-card");
}

async function loadLibraryFileContent(id) {
  var body = byId("libraryFilePreviewBody");
  if (!body) return;
  try {
    var result = await api("/api/files/" + encodeURIComponent(id) + "/content");
    var currentBody = byId("libraryFilePreviewBody");
    if (!currentBody) return;
    if (!result || result.ok === false) throw new Error(result && result.error || t("library.preview.failed", "Could not load this file."));
    currentBody.innerHTML = '<pre class="library-file-preview-text">' + esc(result.text || "") + '</pre>' + (result.truncated ? '<p class="workspace-note library-file-preview-note">' + t("library.preview.truncated", "Only the first part of this file is shown.") + '</p>' : '');
  } catch (error) {
    var failedBody = byId("libraryFilePreviewBody");
    if (!failedBody) return;
    failedBody.innerHTML = '<div class="workspace-empty library-file-preview-error"><strong>' + t("library.preview.failed", "Could not load this file.") + '</strong><span>' + esc(error && error.message || "") + '</span></div>';
  }
}

window.openLibraryItem = function (id, kind, collection) {
  var files = workspaceCache.library.files || [];
  var artifacts = workspaceCache.library.artifacts || [];
  var file = files.filter(function (item) { return item.id === id; })[0] || null;
  var artifact = artifacts.filter(function (item) { return item.id === id; })[0] || null;

  /* The collection is passed by the React row so a file kind such as
     "pdf" is never confused with the files tab. Keep the old two-argument
     call shape working for any legacy caller by falling back to the cached
     item type. */
  if (collection === "artifacts" || (!collection && !file && artifact)) {
    if (artifact) openLibraryArtifactPreview(artifact);
    return;
  }
  if (collection !== "files" && !file) {
    toast(t("toast.fileOpenFailed", "Could not open this file."));
    return;
  }
  if (!file) return;

  var name = file.name || t("library.untitled", "Untitled");
  var mime = String(file.mimeType || "").toLowerCase();
  var rawUrl = libraryFileRawUrl(file.id);
  var isMedia = mime.indexOf("image/") === 0 || mime === "application/pdf" || mime.indexOf("video/") === 0 || mime.indexOf("audio/") === 0;
  var body;
  if (mime.indexOf("image/") === 0) {
    body = '<div class="library-file-preview-media"><img src="' + esc(rawUrl) + '" alt="' + esc(name) + '" /></div>';
  } else if (mime === "application/pdf") {
    body = '<iframe class="library-file-preview-frame" src="' + esc(rawUrl) + '" title="' + esc(name) + '"></iframe>';
  } else if (mime.indexOf("video/") === 0) {
    body = '<div class="library-file-preview-media"><video controls preload="metadata" src="' + esc(rawUrl) + '"></video></div>';
  } else if (mime.indexOf("audio/") === 0) {
    body = '<div class="library-file-preview-audio"><audio controls preload="metadata" src="' + esc(rawUrl) + '"></audio></div>';
  } else {
    body = '<div id="libraryFilePreviewBody" class="library-file-preview-loading">' + t("library.preview.loading", "Loading file content…") + '</div>';
  }

  showDialog(libraryPreviewHeader(name, mime || t("library.preview.file", "File")) + body, "library-file-preview-card");
  if (!isMedia) loadLibraryFileContent(file.id);
};
window.openLibraryUpload = function () { var input = byId("libraryUploadInput"); if (input) input.click(); };
window.deleteLibraryFile = async function (id) { if (!(await confirmAction(t("confirm.deleteFile.title", "Delete this file?"), t("confirm.deleteFile.msg", "It will be removed from your library.")))) return; try { await api("/api/files/" + encodeURIComponent(id), { method: "DELETE" }); renderLibrary(); toast(t("toast.fileDeleted", "File deleted")); } catch (_) { toast(t("toast.fileDeleteFailed", "Could not delete file")); } };
var libraryUpload = byId("libraryUploadInput");
if (libraryUpload && !libraryUpload.dataset.wired) { libraryUpload.dataset.wired = "1"; libraryUpload.addEventListener("change", async function () { var files = Array.prototype.slice.call(libraryUpload.files || []); if (!files.length) return; try { for (var i = 0; i < files.length; i++) { var body = new FormData(); body.append("file", files[i]); await api("/api/files", { method: "POST", body: body }); } toast(files.length === 1 ? t("toast.fileAdded", "File added to Library") : t("toast.filesAdded", "{n} files added to Library").replace("{n}", files.length)); renderLibrary(); } catch (_) { toast(t("toast.uploadFailed", "Some files could not be uploaded")); } finally { libraryUpload.value = ""; } }); }

window.connectConnector = function (id) {
  if (id === "zotero") { openZoteroConnectDialog(); return; }
  if (id !== "github" && id !== "feishu" && id !== "gitee" && id !== "notion") { toast(t("toast.appComingSoon", "This app is coming soon.")); return; }
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
  showDialog('<div class="workspace-dialog-title"><div><h2>Search arXiv</h2><p>Explore public research preprints. No account connection is needed.</p></div><button onclick="closeWorkspaceDialog()" aria-label="' + t("dialog.close", "Close") + '">脳</button></div><form id="arxivSearchForm" class="workspace-form"><div class="workspace-form-grid"><label class="workspace-field"><span>Research topic</span><input name="query" maxlength="200" minlength="2" autocomplete="off" required placeholder="e.g. retrieval augmented generation"></label><div class="workspace-field"><span>&nbsp;</span><button class="workspace-primary" type="submit">Search</button></div></div></form><div id="arxivPapers" class="marketplace-list"><div class="workspace-empty"><strong>Find a paper</strong><span>Search by topic, method, author, or year.</span></div></div>');
  byId("arxivSearchForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    var form = event.currentTarget; var list = byId("arxivPapers"); var query = form.elements.query.value;
    if (list) list.innerHTML = '<div class="workspace-loading">Searching arXiv…</div>';
    try { paintArxivPapers((await api("/api/connectors/arxiv/papers?query=" + encodeURIComponent(query))).papers || []); }
    catch (err) { if (list) list.innerHTML = '<div class="workspace-empty"><strong>arXiv could not be searched</strong><span>' + esc((err && err.message) || "Try again shortly.") + '</span></div>'; }
  });
};
function openZoteroConnectDialog() {
  showDialog('<div class="workspace-dialog-title"><div><h2>Connect Zotero</h2><p>Use a dedicated, read-only API Key from your Zotero account. Your Key is encrypted and never shown again.</p></div><button onclick="closeWorkspaceDialog()" aria-label="' + t("dialog.close", "Close") + '">脳</button></div><form id="zoteroConnectForm" class="workspace-form"><label class="workspace-field"><span>Zotero API Key</span><input name="apiKey" type="password" minlength="16" maxlength="128" autocomplete="off" spellcheck="false" required placeholder="Paste your dedicated read-only Key"></label><p class="workspace-note">Create one in <a href="https://www.zotero.org/settings/keys" target="_blank" rel="noopener noreferrer">Zotero API Keys</a>. Enable personal library access only, with write access turned off.</p><div class="workspace-dialog-actions"><span></span><button type="button" class="workspace-secondary" onclick="closeWorkspaceDialog()">' + t("common.cancel", "Cancel") + '</button><button class="workspace-primary" type="submit">Connect</button></div></form>');
  byId("zoteroConnectForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var submit = form.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = "Verifying…";
    try {
      await api("/api/connectors/zotero", { method: "POST", body: { apiKey: form.elements.apiKey.value } });
      closeWorkspaceDialog(); renderPlugins(); toast(t("toast.zoteroConnected", "Zotero connected"));
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
  showDialog('<div class="workspace-dialog-title"><div><h2>Zotero library</h2><p>Search the references connected to this account.</p></div><button onclick="closeWorkspaceDialog()" aria-label="' + t("dialog.close", "Close") + '">脳</button></div><form id="zoteroSearchForm" class="workspace-form"><div class="workspace-form-grid"><label class="workspace-field"><span>Search</span><input name="query" maxlength="200" autocomplete="off" placeholder="Title, author, or year"></label><div class="workspace-field"><span>&nbsp;</span><button class="workspace-primary" type="submit">Search</button></div></div></form><div id="zoteroItems" class="marketplace-list"><div class="workspace-loading">Loading references…</div></div>');
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
  if (!(await confirmAction(t("confirm.disconnectApp.title", "Disconnect this app?"), t("confirm.disconnectApp.msg", "Socrates will remove the stored connection.")))) return;
  try { await api("/api/connectors/" + encodeURIComponent(id), { method: "DELETE" }); renderPlugins(); toast(t("toast.appDisconnected", "App disconnected")); }
  catch (_) { toast(t("toast.appDisconnectFailed", "Could not disconnect app")); }
};
window.openPluginMarketplace = function () { renderPlugins(); };

window.closeWorkspaceDialog = closeWorkspaceDialog;
export function openMoreNav() { try { toggleMorePopover(); } catch (_) {} }
