import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';

import { saveChatPreferences, type ReasoningEffort, type ResponseSpeed } from '../../config/chatPreferences';
import { pickActiveProviderById } from '../../pickers.js';
import { getLegacyActions, i18n } from '../legacy/gateway.ts';
import { markHostMountedBy } from '../lib/boot/ownership';
import {
  closeChatConfiguration,
  installChatConfigurationBridge,
  useChatConfigurationSnapshot,
} from './chatConfiguration.bridge';
import { EffortPanel, ModelPickerPanel, SpeedPanel } from './ChatConfigurationPanels';
import type { ChatConfigurationAnchor } from './types';

type View = 'main' | 'effort' | 'speed';

/* Anchored like the ChatGPT composer popover: a compact card floating above
   the trigger pill, centred on it and clamped into the visual viewport. */
function popoverStyle(anchor: ChatConfigurationAnchor | null): CSSProperties {
  const viewport = window.visualViewport;
  const viewportTop = viewport ? Math.max(0, viewport.offsetTop || 0) : 0;
  const viewportHeight = viewport ? viewport.height : window.innerHeight;
  const viewportBottom = viewportTop + viewportHeight;
  const viewportWidth = viewport ? viewport.width : window.innerWidth;
  const width = Math.min(264, viewportWidth - 32);
  if (!anchor) {
    return { left: Math.max(16, (viewportWidth - width) / 2), bottom: 96, width };
  }
  const center = anchor.left + anchor.width / 2;
  const left = Math.max(8, Math.min(center - width / 2, viewportWidth - width - 8));
  if (anchor.top - viewportTop > 200) {
    return { left, bottom: Math.max(8, viewportBottom - anchor.top + 8), width };
  }
  if (anchor.left < viewportWidth / 2 && anchor.top - viewportTop < 80) {
    return { left: Math.max(8, Math.min(anchor.left, viewportWidth - width - 8)), top: anchor.bottom + 6, width };
  }
  return { left, top: anchor.bottom + 8, width };
}

export function ChatConfiguration() {
  const snapshot = useChatConfigurationSnapshot();
  const popRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>('main');
  /* Selections commit immediately (menu semantics), so the rendered state is
     local — the bridge snapshot only refreshes on the next open. */
  const [effort, setEffort] = useState<ReasoningEffort>(snapshot.effort);
  const [speed, setSpeed] = useState<ResponseSpeed>(snapshot.speed);

  useEffect(() => {
    if (!snapshot.open) return;
    setView('main');
    setEffort(snapshot.effort);
    setSpeed(snapshot.speed);
  }, [snapshot.open, snapshot.revision, snapshot.effort, snapshot.speed]);

  useEffect(() => {
    if (!snapshot.open) return;
    const frame = window.requestAnimationFrame(() => {
      popRef.current?.querySelector<HTMLElement>('[data-initial-focus]')?.focus({ preventScroll: true });
    });
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (popRef.current?.contains(target)) return;
      if (target?.closest?.('.effort-trigger, [data-chat-config-trigger]')) return;
      closeChatConfiguration();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setView((current) => {
        if (current === 'main') closeChatConfiguration();
        return 'main';
      });
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [snapshot.open]);

  if (!snapshot.open) return null;

  const commitPreferences = (nextEffort: ReasoningEffort, nextSpeed: ResponseSpeed) => {
    setEffort(nextEffort);
    setSpeed(nextSpeed);
    saveChatPreferences(nextEffort, nextSpeed);
  };

  const pickModel = (id: string) => {
    if (id && id !== snapshot.activeId) {
      pickActiveProviderById(id);
      /* The pill's tooltip/aria copy carries the active model name. */
      getLegacyActions().composer.syncEffortUI();
    }
    closeChatConfiguration();
  };

  const openSettings = () => {
    closeChatConfiguration(false);
    getLegacyActions().navigation.openSettings();
  };

  return (
    <div ref={popRef} className="chat-config-pop" role="dialog" aria-label={i18n('chatconfig.title', 'Chat settings')} style={popoverStyle(snapshot.anchorRect)}>
      {view === 'main' ? (
        <ModelPickerPanel
          providers={snapshot.providers}
          activeId={snapshot.activeId}
          effort={effort}
          speed={speed}
          onPickModel={pickModel}
          onOpenEffort={() => setView('effort')}
          onOpenSpeed={() => setView('speed')}
          onOpenSettings={openSettings}
        />
      ) : null}
      {view === 'effort' ? (
        <EffortPanel effort={effort} speed={speed} onBack={() => setView('main')} onCommit={commitPreferences} />
      ) : null}
      {view === 'speed' ? (
        <SpeedPanel
          effort={effort}
          speed={speed}
          onCommit={(nextEffort, nextSpeed) => {
            commitPreferences(nextEffort, nextSpeed);
            setView('main');
          }}
        />
      ) : null}
    </div>
  );
}

let chatConfigurationMounted = false;

export function mountChatConfiguration(): void {
  /* See mountConfirmDialog — the mount registry marks this host at
     dispatch time, before the lazy import resolves, so the ownership
     flag can't double as the re-entry guard here. */
  if (chatConfigurationMounted) return;
  let host = document.getElementById('chatConfigurationReactRoot');
  if (!host) {
    host = document.createElement('div');
    host.id = 'chatConfigurationReactRoot';
    document.body.appendChild(host);
  }
  chatConfigurationMounted = true;
  markHostMountedBy(host, 'chat-configuration');
  installChatConfigurationBridge();
  createRoot(host).render(<ChatConfiguration />);
}
