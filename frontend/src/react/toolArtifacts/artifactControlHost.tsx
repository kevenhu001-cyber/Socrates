import { createElement } from 'react';
import { createObservedRootGroup } from '../lib/boot/observedRootGroup';
import { ArtifactControl, type ArtifactControlProps } from './ArtifactControl';

const roots = createObservedRootGroup('artifact-control');

export function renderArtifactControl(host: HTMLElement, props: ArtifactControlProps): void {
  roots.render(host, createElement(ArtifactControl, props));
}
