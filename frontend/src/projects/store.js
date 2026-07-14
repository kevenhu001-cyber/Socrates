export var PROJECTS_KEY = "socrates-projects";
export var INBOX_PROJECT_ID = "inbox";
export var INBOX_PROJECT = {
  id: INBOX_PROJECT_ID,
  name: "Inbox",
  description: "All sessions without a project",
  color: "#7d7468",
  icon: "in",
  systemPrompt: "",
  createdAt: 0,
  archivedAt: null,
  isSystem: true,
};
export var PROJECT_COLOR_PALETTE = ["#d8a85b", "#7da9d8", "#a0c46c", "#c47ed1", "#e07b5b", "#5bc0be", "#d6a4d1", "#b8b54a"];

export function normalizeProjects(arr) {
  if (Array.isArray(arr) && arr.length) {
    return [INBOX_PROJECT].concat(arr.filter(function (p) { return p && p.id !== INBOX_PROJECT_ID; }));
  }
  return [INBOX_PROJECT];
}

export function loadProjectsFromStorage() {
  try {
    var raw = localStorage.getItem(PROJECTS_KEY);
    var arr = raw ? JSON.parse(raw) : null;
    return normalizeProjects(arr);
  } catch (_) {
    return [INBOX_PROJECT];
  }
}

export function saveProjectsToStorage(projects) {
  try {
    var persistable = (projects || []).filter(function (p) { return p && !p.isSystem; });
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(persistable));
  } catch (_) {}
}

export function getProjectByIdFrom(projects, id) {
  if (!id) return INBOX_PROJECT;
  for (var i = 0; i < (projects || []).length; i++) {
    if (projects[i] && projects[i].id === id) return projects[i];
  }
  return INBOX_PROJECT;
}

export function randomProjectColor() {
  return PROJECT_COLOR_PALETTE[Math.floor(Math.random() * PROJECT_COLOR_PALETTE.length)];
}

export function createProjectRecord(opts, idFactory) {
  opts = opts || {};
  return {
    id: idFactory(),
    name: (opts.name || "New project").trim().slice(0, 80),
    description: (opts.description || "").trim().slice(0, 500),
    color: opts.color || randomProjectColor(),
    icon: opts.icon || "fl",
    systemPrompt: (opts.systemPrompt || "").slice(0, 8000),
    createdAt: Date.now(),
    archivedAt: null,
  };
}

export function updateProjectRecord(project, patch) {
  patch = patch || {};
  if (!project || project.isSystem) return project;
  if (patch.name !== undefined) project.name = String(patch.name).trim().slice(0, 80);
  if (patch.description !== undefined) project.description = String(patch.description).trim().slice(0, 500);
  if (patch.color !== undefined) project.color = patch.color;
  if (patch.icon !== undefined) project.icon = String(patch.icon).slice(0, 4);
  if (patch.systemPrompt !== undefined) project.systemPrompt = String(patch.systemPrompt).slice(0, 8000);
  return project;
}

export function deleteProjectFromList(projects, id) {
  if (id === INBOX_PROJECT_ID) return projects || [INBOX_PROJECT];
  return (projects || []).filter(function (p) { return p && p.id !== id; });
}
