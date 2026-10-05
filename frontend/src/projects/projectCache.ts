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
let projectsRevision = 0;

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
  projectsRevision += 1;
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
  const requestRevision = projectsRevision;

  projectsRequest = Promise.resolve()
    .then(fetcher)
    .then((result) => {
      /* A local create/edit/delete may finish while this fetch is in flight.
         Keep that newer typed cache value instead of replacing it with the
         stale response that started before the mutation. */
      if (projectsRevision !== requestRevision) return getCachedProjects();
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
