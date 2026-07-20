import { toggleMorePopover } from "./morePopover.js";

var NAV_NAMES = ["library", "projects", "scheduled", "plugins", "more"];
var PANEL_IDS = ["knowledgePanel", "recentsPanel", "mistakesPanel", "libraryPanel", "spacesPanel", "scheduledPanel", "pluginsPanel"];
var workspaceCache = { library: { files: [], artifacts: [], query: "" }, projects: [], tasks: [], connectors: [] };

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
    github: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.14.68-3.8-1.33-3.8-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.51-.29-5.15-1.26-5.15-5.6 0-1.24.44-2.25 1.16-3.04-.12-.28-.5-1.44.11-3 0 0 .95-.3 3.1 1.16A10.76 10.76 0 0 1 12 5.6c.96 0 1.92.13 2.82.38 2.15-1.46 3.1-1.16 3.1-1.16.61 1.56.23 2.72.11 3 .72.79 1.16 1.8 1.16 3.04 0 4.35-2.65 5.3-5.17 5.59.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.77.54A11.25 11.25 0 0 0 12 .75Z"/></svg>',
    feishu: '<span>F</span>', 'baidu-netdisk': '<span>网</span>', gitee: '<span>G</span>', onedrive: '<span>1</span>', outlook: '<span>O</span>', notion: '<span>N</span>', zotero: '<span>Z</span>', arxiv: '<span>arχ</span>', 'qq-mail': '<span>Q</span>'
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

export function closeAllPanels() {
  PANEL_IDS.forEach(function (id) { var panel = byId(id); if (panel) panel.classList.add("hidden"); });
  ["tabKnowledge", "tabRecents", "tabMistakes"].forEach(function (id) { var button = byId(id); if (button) button.classList.remove("active"); });
}

export function openNav(name) {
  var openers = { library: openLibrary, projects: openProjects, scheduled: openScheduled, plugins: openPlugins, more: openMoreNav };
  if (!openers[name]) return;
  setActiveNav(name);
  if (name !== "more") closeAllPanels();
  openers[name]();
}

export function openLibrary() { var panel = byId("libraryPanel"); if (panel) { panel.classList.remove("hidden"); renderLibrary(); } }
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
  list.innerHTML = items.map(function (item) {
    var name = item.name || item.title || "Untitled";
    var kind = item.kind === "image" ? "image" : "file";
    var action = key === "files" ? '<button class="workspace-row-action" onclick="event.stopPropagation();deleteLibraryFile(\'' + esc(item.id) + '\')" aria-label="Delete ' + esc(name) + '">Delete</button>' : "";
    return '<div class="workspace-row library-row" onclick="openLibraryItem(\'' + esc(item.id) + '\',\'' + key + '\')"><span class="workspace-row-icon">' + icon(kind) + '</span><div class="workspace-row-copy"><strong>' + esc(name) + '</strong><span>' + esc(fileMeta(item)) + '</span></div>' + action + "</div>";
  }).join("");
}

export function openProjects() { var panel = byId("spacesPanel"); if (panel) { panel.classList.remove("hidden"); renderProjects(); } }
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

export function openScheduled() { var panel = byId("scheduledPanel"); if (panel) { panel.classList.remove("hidden"); renderScheduled(); } }
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

export function openPlugins() { var panel = byId("pluginsPanel"); if (panel) { panel.classList.remove("hidden"); renderPlugins(); } }
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
  return '<div class="workspace-row arxiv-paper"><span class="workspace-row-icon connector-icon connector-arxiv">arχ</span><div class="workspace-row-copy"><strong>' + esc(paper.title || "Untitled paper") + '</strong><span>' + esc(meta || "arXiv preprint") + '</span>' + (paper.summary ? '<p class="arxiv-summary">' + esc(paper.summary) + '</p>' : "") + '</div><span class="connector-actions">' + links + '</span></div>';
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
  return '<div class="workspace-row zotero-item"><span class="workspace-row-icon connector-icon connector-zotero">Z</span><div class="workspace-row-copy"><strong>' + esc(item.title || "Untitled item") + '</strong><span>' + esc(details || "Zotero item") + '</span></div></div>';
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
