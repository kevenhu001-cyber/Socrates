import { createElement } from 'react';
import { createRootSlot } from '../lib/boot/ownedRoot';
import { TutorSnapshotAction } from './TutorSnapshotAction';

const root = createRootSlot('tutor-snapshot-action');

export function renderTutorSnapshotAction(host: HTMLElement, label: string, onClick: () => void): void {
  root.mount(host, createElement(TutorSnapshotAction, { label, onClick }));
}
