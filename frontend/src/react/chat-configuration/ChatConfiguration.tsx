import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import {
  saveChatPreferences,
  type ReasoningEffort,
  type ResponseSpeed,
} from '../../config/chatPreferences';
import { resolveEffectiveEffort } from '../../config/effectiveEffort';
import { setActiveProvider } from '../../config/providerConfig.service.ts';
import { i18n } from '../../ui/legacyI18n.ts';
import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import { ensureBodyContainer } from '../lib/boot/mountContainer';
import { openSettings } from '../settings/settings.service.ts';
import {
  closeChatConfiguration,
  installChatConfigurationBridge,
  useChatConfigurationSnapshot,
} from './chatConfiguration.bridge';
import { EffortPanel, ModelPickerPanel, SpeedPanel } from './ChatConfigurationPanels';
import type { ChatConfigurationAnchor } from './types';
import { hasMobileComposerFocus } from '../../legacy/keyboard/geometry';
import { restingRect } from '../../legacy/pressFeedback.ts';

type View = 'main' | 'effort' | 'speed';

/* Measure the live trigger and the current panel in the same layout pass.
 * Fixed positioning uses layout-viewport coordinates, including the visual
 * viewport offset on mobile when the keyboard or browser chrome moves. */
function popoverStyle(
  anchor: ChatConfigurationAnchor,
  triggerId: string | null,
  menu: HTMLElement,
): CSSProperties {
  const viewport = window.visualViewport;
  const x = viewport?.offsetLeft ?? 0;
  const y = viewport?.offsetTop ?? 0;
  const w = viewport?.width ?? window.innerWidth;
  const h = viewport?.height ?? window.innerHeight;
  const gap = 8;
  const width = Math.max(0, Math.min(264, w - 2 * gap));
  const above = Math.max(0, anchor.top - y - 2 * gap);
  const below = Math.max(0, y + h - anchor.bottom - 2 * gap);
  const composer = triggerId === 'composerToolsBtn' || triggerId === 'effortTrigger';
  const naturalHeight = Math.max(
    menu.offsetHeight,
    menu.scrollHeight + menu.offsetHeight - menu.clientHeight,
  );
  const opensAbove = composer
    ? above >= Math.min(naturalHeight, 120) || above >= below
    : below < naturalHeight && above > below;
  const maxHeight = Math.min(420, opensAbove ? above : below);
  const height = Math.min(naturalHeight, maxHeight);
  const left = Math.max(
    x + gap,
    Math.min(composer ? anchor.right - width : anchor.left, x + w - width - gap),
  );
  const top = opensAbove ? anchor.top - gap - height : anchor.bottom + gap;
  return {
    left,
    top: Math.max(y + gap, top),
    bottom: 'auto',
    width,
    maxHeight,
    transformOrigin: opensAbove ? 'bottom right' : 'top left',
  };
}

export function ChatConfiguration() {
  const snapshot = useChatConfigurationSnapshot();
  const popRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>('main');
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    if (!snapshot.open) {
      setPosition({ visibility: 'hidden' });
      return;
    }
    const menu = popRef.current;
    if (!menu) return;
    let frame = 0;
    const update = () => {
      const trigger = snapshot.triggerId ? document.getElementById(snapshot.triggerId) : null;
      const anchor = trigger?.getClientRects().length ? restingRect(trigger) : snapshot.anchorRect;
      if (!anchor) return;
      const next = popoverStyle(anchor, snapshot.triggerId, menu);
      setPosition((previous) =>
        Object.keys(next).every(
          (key) => previous[key as keyof CSSProperties] === next[key as keyof CSSProperties],
        ) && previous.visibility !== 'hidden'
          ? previous
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(menu);
    const trigger = snapshot.triggerId ? document.getElementById(snapshot.triggerId) : null;
    if (trigger) {
      observer.observe(trigger);
      const composer = trigger.closest('#composerInputWrap');
      if (composer) observer.observe(composer);
    }
    update();
    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [snapshot.open, snapshot.triggerId, snapshot.anchorRect, view]);
  /* what the active model supports, as the
     server published it. A stored preference the model cannot satisfy (an
     Instant that the model cannot honour) is shown as the level that is
     actually in effect, so the picker never claims something the request
     will not ask for. */
  const activeCapabilities = useMemo(() => {
    const active = snapshot.providers.find((provider) => provider.id === snapshot.activeId);
    return active?.capabilities ?? null;
  }, [snapshot.providers, snapshot.activeId]);
  const effectiveEffort = resolveEffectiveEffort(snapshot.effort, activeCapabilities);
  /* Selections commit immediately (menu semantics), so the rendered state is
     local — the bridge snapshot only refreshes on the next open. */
  const [effort, setEffort] = useState<ReasoningEffort>(effectiveEffort);
  const [speed, setSpeed] = useState<ResponseSpeed>(snapshot.speed);

  useEffect(() => {
    if (!snapshot.open) return;
    setView(
      snapshot.triggerId === 'composerToolsBtn' || snapshot.triggerId === 'effortTrigger'
        ? 'effort'
        : 'main',
    );
    setEffort(effectiveEffort);
    setSpeed(snapshot.speed);
  }, [snapshot.open, snapshot.revision, snapshot.triggerId, effectiveEffort, snapshot.speed]);

  useEffect(() => {
    if (!snapshot.open) return;
    const frame = window.requestAnimationFrame(() => {
      // A pointer-opened menu must not take focus away from the active IME.
      // Keyboard-opened menus still receive the normal initial focus.
      if (hasMobileComposerFocus()) return;
      popRef.current
        ?.querySelector<HTMLElement>('[data-initial-focus]')
        ?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [snapshot.open, view]);

  useEffect(() => {
    if (!snapshot.open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (popRef.current?.contains(target)) return;
      if (target?.closest?.('.effort-trigger, [data-chat-config-trigger]')) return;
      // The outside target owns focus; do not steal it back to the trigger.
      closeChatConfiguration(false);
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
    if (id && id !== snapshot.activeId) void setActiveProvider(id);
    closeChatConfiguration();
  };

  const openModelSettings = () => {
    const returnFocus = snapshot.triggerId ? document.getElementById(snapshot.triggerId) : null;
    closeChatConfiguration(false);
    void openSettings({ section: 'models', returnFocus });
  };

  return (
    <div
      ref={popRef}
      className="chat-config-pop"
      role="dialog"
      aria-label={i18n('chatconfig.title', 'Chat settings')}
      style={position}
    >
      {view === 'main' ? (
        <ModelPickerPanel
          providers={snapshot.providers}
          activeId={snapshot.activeId}
          effort={effort}
          speed={speed}
          onPickModel={pickModel}
          onOpenEffort={() => setView('effort')}
          onOpenSpeed={() => setView('speed')}
          onOpenSettings={openModelSettings}
        />
      ) : null}
      {view === 'effort' ? (
        <EffortPanel
          effort={effort}
          speed={speed}
          supportsInstant={activeCapabilities?.supportsInstant !== false}
          onBack={() => setView('main')}
          onCommit={commitPreferences}
        />
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

export function mountChatConfiguration(): void {
  const host = ensureBodyContainer('chatConfigurationReactRoot');
  mountOwnedRoot(host, 'chat-configuration', <ChatConfiguration />, installChatConfigurationBridge);
}
