/* app/router.js — path helpers and view-scoped history writes.
   Route and host metadata lives in sidebar/navigation.destinations.ts.

   Boundaries:
   - View paths (/library, /projects, …, /exam, /admin) use that metadata.
   - Session-id query params (?chat= / ?exam=) stay in session/store.js —
     those key off sessions, not views.
   - Auth redirect params (?next= / ?redirect=) stay in auth/boot.js.
   Navigation orchestration (openNav, syncWorkspaceRoute) lives in the
   typed sidebar/navigation.service.ts owner. */

import { DESTINATIONS } from '../sidebar/navigation.destinations.ts';

export var WORKSPACE_ROUTES = /* @__PURE__ */ (() => Object.fromEntries(
  Object.entries(DESTINATIONS).map(([name, { path }]) => [name, path]),
))();

export function workspaceForPath(pathname) {
  var clean = String(pathname || "/").replace(/\/+$/, "") || "/";
  return Object.keys(DESTINATIONS).find(function (name) { return DESTINATIONS[name].path === clean; }) || null;
}

export function pushWorkspaceRoute(name) {
  var next = DESTINATIONS[name]?.path;
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
