import { useEffect, useLayoutEffect, useRef } from 'react';
import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import type { Root } from 'react-dom/client';

import {
  getActiveTemplateExtensionKey,
  isDeepResearchOn,
  isExtensiveThinkingOn,
  isWebSearchOn,
} from '../legacy/gateway.ts';
import { useComposerPluginSelectionSnapshot } from './useComposerPluginSelection';
import {
  closeComposerTools,
  useComposerToolsDispatch,
  useComposerToolsSnapshot,
} from './composerTools.store';
import { ComposerToolMenuItems } from './ComposerToolMenuItems';
import { positionComposerToolsMenu } from './composerTools.position';

const MENU_ID = 'composerToolsMenu';

function ComposerToolsMenu() {
  const snapshot = useComposerToolsSnapshot();
  const { pick } = useComposerToolsDispatch();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectionSnapshot = useComposerPluginSelectionSnapshot();
  const selectedPluginCount = snapshot.mode ? selectionSnapshot[snapshot.mode].length : 0;
  const activeKey = getActiveTemplateExtensionKey()
    ?? (isWebSearchOn() ? 'webSearch' : null)
    ?? (isDeepResearchOn() ? 'deepResearch' : null)
    ?? (isExtensiveThinkingOn() ? 'extensiveThinking' : null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const trigger = snapshot.triggerId ? document.getElementById(snapshot.triggerId) : null;
    if (!snapshot.isOpen || !menu || !trigger) return undefined;

    let frame = 0;
    const schedulePosition = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        positionComposerToolsMenu(menu, trigger, snapshot.mode);
      });
    };
    schedulePosition();

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedulePosition) : null;
    observer?.observe(menu);
    window.addEventListener('resize', schedulePosition);
    document.addEventListener('scroll', schedulePosition, true);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', schedulePosition);
    viewport?.addEventListener('scroll', schedulePosition);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedulePosition);
      document.removeEventListener('scroll', schedulePosition, true);
      viewport?.removeEventListener('resize', schedulePosition);
      viewport?.removeEventListener('scroll', schedulePosition);
    };
  }, [snapshot.isOpen, snapshot.mode, snapshot.triggerId, selectedPluginCount]);

  useEffect(() => {
    document.body.classList.toggle('composer-tools-open', snapshot.isOpen);
    return () => document.body.classList.remove('composer-tools-open');
  }, [snapshot.isOpen]);

  useEffect(() => {
    if (!snapshot.isOpen) return undefined;
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target
        : event.target instanceof Node ? event.target.parentElement : null;
      const trigger = snapshot.triggerId ? document.getElementById(snapshot.triggerId) : null;
      if (target && (menuRef.current?.contains(target) || trigger?.contains(target))) return;
      closeComposerTools();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const trigger = snapshot.triggerId ? document.getElementById(snapshot.triggerId) : null;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeComposerTools();
        trigger?.focus({ preventScroll: true });
        return;
      }
      const menu = menuRef.current;
      if (!menu || !(event.target instanceof Node) || (!menu.contains(event.target) && !trigger?.contains(event.target))) return;
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        .filter((item) => item.getClientRects().length > 0);
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : event.key === 'ArrowDown' ? (index + 1) % items.length : (index <= 0 ? items.length : index) - 1;
      items[next].focus();
    };
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleDocumentClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [snapshot.isOpen, snapshot.triggerId]);

  return (
    <div
      id={MENU_ID}
      ref={menuRef}
      className={`composer-tools-menu${snapshot.isOpen ? '' : ' hidden'}`}
      role="menu"
      aria-label="Composer tools"
      aria-hidden={!snapshot.isOpen}
      data-mode={snapshot.mode ?? undefined}
    >
      <ComposerToolMenuItems
        activeKey={activeKey}
        onPick={pick}
        isOpen={snapshot.isOpen}
        mode={snapshot.mode}
      />
    </div>
  );
}

export interface ComposerToolsHandle {
  root: Root;
  destroy: () => void;
}

export function hydrateComposerToolsMenu(host: HTMLElement): ComposerToolsHandle {
  return mountOwnedRoot(host, 'composer-tools-menu', <ComposerToolsMenu />);
}
