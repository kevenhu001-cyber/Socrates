import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { mountOwnedRoot, type OwnedRootHandle } from '../lib/boot/ownedRoot';
import { KnowledgeNodeDetail, type KnowledgeNodeDetailProps } from './KnowledgeNodeDetail';

export function mountKnowledgeNodeDetail(host: HTMLElement, props: KnowledgeNodeDetailProps): OwnedRootHandle {
  let root: OwnedRootHandle | null = null;
  flushSync(() => { root = mountOwnedRoot(host, 'knowledge-node-detail', createElement(KnowledgeNodeDetail, props)); });
  return root!;
}
