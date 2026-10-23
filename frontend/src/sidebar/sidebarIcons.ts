/** Sidebar glyphs share the interface collection with menus and chat controls.
 * Keep the pre-paint SVGs in index.html synchronized with these exports.
 */
import { interfaceIcon } from '../ui/icons/interfaceIcons';

export const NEW_CHAT_ICON = interfaceIcon('newChat');
export const LIBRARY_ICON = interfaceIcon('library');
export const PROJECTS_ICON = interfaceIcon('folder');
export const SCHEDULED_ICON = interfaceIcon('clock');
export const PLUGINS_ICON = interfaceIcon('puzzle');
export const IMAGES_ICON = interfaceIcon('image');
export const ASSISTANTS_ICON = interfaceIcon('assistant');
export const SITES_ICON = interfaceIcon('site');
export const EXAM_ICON = interfaceIcon('exam');
export const SKILLS_ICON = interfaceIcon('skills');
export const MORE_ICON = interfaceIcon('more');
export const SEARCH_ICON = interfaceIcon('search');
export const PANEL_ICON = interfaceIcon('panel');
export const CLOSE_ICON = interfaceIcon('close');
export const KNOWLEDGE_ICON = interfaceIcon('knowledge');
export const MISTAKES_ICON = interfaceIcon('bookmark');
export const CHEVRON_RIGHT_ICON = interfaceIcon('chevronRight');
export const SHARE_ICON = interfaceIcon('share');
export const RENAME_ICON = interfaceIcon('edit');
export const ARCHIVE_ICON = interfaceIcon('archive');
export const DELETE_ICON = interfaceIcon('trash');
export const SUN_ICON = interfaceIcon('sun');
export const MOON_ICON = interfaceIcon('moon');
export const SLIDERS_ICON = interfaceIcon('sliders');
export const GEAR_ICON = interfaceIcon('gear');

export const sidebarIcons = {
  newChat: NEW_CHAT_ICON,
  library: LIBRARY_ICON,
  projects: PROJECTS_ICON,
  scheduled: SCHEDULED_ICON,
  plugins: PLUGINS_ICON,
  images: IMAGES_ICON,
  assistants: ASSISTANTS_ICON,
  sites: SITES_ICON,
  exam: EXAM_ICON,
  skills: SKILLS_ICON,
  more: MORE_ICON,
  search: SEARCH_ICON,
  panel: PANEL_ICON,
  close: CLOSE_ICON,
  knowledge: KNOWLEDGE_ICON,
  mistakes: MISTAKES_ICON,
  chevronRight: CHEVRON_RIGHT_ICON,
  share: SHARE_ICON,
  rename: RENAME_ICON,
  archive: ARCHIVE_ICON,
  delete: DELETE_ICON,
  project: PROJECTS_ICON,
  overflow: MORE_ICON,
  sun: SUN_ICON,
  moon: MOON_ICON,
  sliders: SLIDERS_ICON,
  gear: GEAR_ICON,
} as const;

export type SidebarIconKey = keyof typeof sidebarIcons;
