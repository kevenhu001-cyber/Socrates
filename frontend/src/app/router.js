/* app/router.js — single owner of the path↔view route table and the
   view-scoped history writes.

   Boundaries:
   - View paths (/library, /projects, …, /exam, /admin) live here.
   - Session-id query params (?chat= / ?exam=) stay in session/store.js —
     those key off sessions, not views.
   - Auth redirect params (?next= / ?redirect=) stay in auth/boot.js.
   Navigation orchestration (openNav, syncWorkspaceRoute) lives in the
   typed sidebar/navigation.service.ts owner. */

export var WORKSPACE_ROUTES = {
  library: "/library",
  projects: "/projects",
  scheduled: "/scheduled",
  plugins: "/plugins",
  images: "/images",
  assistants: "/assistants",
  sites: "/sites",
  exam: "/exam",
  admin: "/admin",
};

export function workspaceForPath(pathname) {
  var clean = String(pathname || "/").replace(/\/+$/, "") || "/";
  return Object.keys(WORKSPACE_ROUTES).find(function (name) { return WORKSPACE_ROUTES[name] === clean; }) || null;
}

export function pushWorkspaceRoute(name) {
  var next = WORKSPACE_ROUTES[name];
  if (next && location.pathname !== next) history.pushState({ workspace: name }, "", next);
}

/* The plugin center's in-page back button exits explicitly to home —
   history-back is unreliable there because the previous entry may be a
   bare "/" no workspace route owns. */
export function pushHomeRoute() {
  try { history.pushState({}, "", "/"); } catch (_) { /* non-critical */ }
}

export function replaceRoute(url) {
  history.replaceState(null, "", url);
}
