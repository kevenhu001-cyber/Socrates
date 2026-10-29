import { createElement } from 'react';
import { createObservedRootGroup } from '../lib/boot/observedRootGroup';
import { ArtifactControl, type ArtifactControlProps } from './ArtifactControl';

/* These controls are inserted into legacy-owned artifact DOM. Preserve the
   synchronous mount contract so callers can inspect or interact with them
   immediately after rendering. */
const roots = createObservedRootGroup('artifact-control', { synchronous: true });

export function renderArtifactControl(host: HTMLElement, props: ArtifactControlProps): void {
  roots.render(host, createElement(ArtifactControl, props));
}
