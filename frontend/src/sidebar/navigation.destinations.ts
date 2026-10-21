/** Route and host metadata only; importing this table never loads a page. */
export const DESTINATIONS = {
  library: { path: '/library', host: 'libraryPanel' },
  projects: { path: '/projects', host: 'spacesPanel' },
  scheduled: { path: '/scheduled', host: 'scheduledPanel' },
  plugins: { path: '/plugins', host: 'pluginsPanel' },
  images: { path: '/images', host: 'imagesPanel' },
  assistants: { path: '/assistants', host: 'assistantsPanel' },
  sites: { path: '/sites', host: 'sitesPanel' },
  exam: { path: '/exam', host: 'examView' },
  admin: { path: '/admin', host: 'adminPanel' },
} as const;

export type PageDestination = keyof typeof DESTINATIONS;
export type WorkspacePage = Extract<PageDestination, 'library' | 'projects' | 'plugins'>;

export function isPageDestination(name: string): name is PageDestination {
  return Object.prototype.hasOwnProperty.call(DESTINATIONS, name);
}

export function isWorkspacePage(name: string): name is WorkspacePage {
  return name === 'library' || name === 'projects' || name === 'plugins';
}

export const CORE_VIEW_IDS = ['topicSetup', 'diagnosticView', 'chatView'];
export const MAIN_PAGE_IDS = Object.values(DESTINATIONS).map(({ host }) => host);
