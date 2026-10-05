export interface CachedProject {
  id: string;
  name: string;
  [key: string]: unknown;
}

type ProjectList = ReadonlyArray<CachedProject>;
type ProjectFetcher = () => Promise<unknown>;

const EMPTY_PROJECTS: ProjectList = Object.freeze([]);
const listeners = new Set<() => void>();
let projects: ProjectList | null = null;
let projectsRequest: Promise<ProjectList> | null = null;

function normalizeProjects(value: unknown): ProjectList {
  if (!Array.isArray(value)) return EMPTY_PROJECTS;
  return value.filter((item: unknown): item is CachedProject => {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as { id?: unknown; name?: unknown };
    return typeof candidate.id === 'string' && typeof candidate.name === 'string';
  });
}

export function getProjectCacheSnapshot(): ProjectList | null {
  return projects;
}

export function getCachedProjects(): ProjectList {
  return projects ?? EMPTY_PROJECTS;
}

export function hasCachedProjects(): boolean {
  return projects !== null;
}

export function setCachedProjects(value: unknown): ProjectList {
  projects = value == null ? null : normalizeProjects(value);
  listeners.forEach((listener) => listener());
  return projects ?? EMPTY_PROJECTS;
}

export function subscribeToProjectCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function requestProjects(fetcher: ProjectFetcher): Promise<ProjectList> {
  if (projectsRequest) return projectsRequest;

  projectsRequest = Promise.resolve()
    .then(fetcher)
    .then((result) => {
      const rows = result && typeof result === 'object' && 'projects' in result
        ? (result as { projects?: unknown }).projects
        : undefined;
      return setCachedProjects(rows ?? []);
    })
    .finally(() => {
      projectsRequest = null;
    });

  return projectsRequest;
}

/** Share one initial lookup across recents and session loading. */
export function loadCachedProjects(fetcher: ProjectFetcher): Promise<ProjectList> {
  if (projects !== null) return Promise.resolve(projects);
  return requestProjects(fetcher);
}

/** Refresh the cache when a user explicitly opens a project picker or page. */
export function refreshCachedProjects(fetcher: ProjectFetcher): Promise<ProjectList> {
  return requestProjects(fetcher);
}

if (typeof window !== 'undefined') {
  const descriptor = Object.getOwnPropertyDescriptor(window, '__projectsCache');
  const initialValue = (window as any).__projectsCache;
  if (Array.isArray(initialValue)) projects = normalizeProjects(initialValue);
  if (!descriptor || descriptor.configurable) {
    Object.defineProperty(window, '__projectsCache', {
      configurable: true,
      get: () => projects ?? undefined,
      set: (value: unknown) => { setCachedProjects(value); },
    });
  }
}
