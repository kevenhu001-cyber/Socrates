import type { CreationName } from '../react/creation/creationModel.ts';
import { getActiveDestination } from '../sidebar/navigation.store.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

function isCreationName(value: unknown): value is CreationName {
  return value === 'images' || value === 'assistants' || value === 'sites';
}

/** Keep the directory feature out of the initial bundle until a route opens. */
export async function openCreationSurface(name: string | null): Promise<void> {
  if (!isCreationName(name)) return;
  try {
    const { mountCreationSurface } = await import('../react/creation/creationSurfaceHost.tsx');
    if (getActiveDestination() !== name) return;
    mountCreationSurface(name);
  } catch (error) {
    reportSwallow(error, 'ui/creationSurfaces.mountReactSurface');
  }
}
