import { createRootSlot } from '../lib/boot/ownedRoot';
import { CreationSurfaceView } from './CreationSurface';
import type { CreationName } from './creationModel';

const roots = new Map<CreationName, ReturnType<typeof createRootSlot>>();
const openRevisions = new Map<CreationName, number>();

export function mountCreationSurface(name: CreationName) {
  const host = document.getElementById(`${name}Panel`);
  if (!host) throw new Error(`Missing React creation host #${name}Panel.`);
  let root = roots.get(name);
  if (!root) {
    root = createRootSlot(`creation-surface-${name}`);
    roots.set(name, root);
  }
  const revision = (openRevisions.get(name) || 0) + 1;
  openRevisions.set(name, revision);
  return root.mount(host, <CreationSurfaceView name={name} openRevision={revision} />);
}
