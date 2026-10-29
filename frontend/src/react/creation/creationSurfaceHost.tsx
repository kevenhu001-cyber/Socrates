import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import { CreationSurfaceView, type CreationName, type CreationSnapshot } from './CreationSurface';

export function mountCreationSurface(host: HTMLElement, name: CreationName, initialState: CreationSnapshot) {
  return mountOwnedRoot(host, `creation-surface-${name}`, <CreationSurfaceView host={host} initialState={initialState} />);
}
