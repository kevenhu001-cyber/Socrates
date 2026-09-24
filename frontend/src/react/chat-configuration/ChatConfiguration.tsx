import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { saveChatPreferences, type ReasoningEffort, type ResponseSpeed } from '../../config/chatPreferences';
import { pickActiveProviderById } from '../../pickers.js';
import { i18n } from '../legacy/gateway';
import { hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import {
  closeChatConfiguration,
  installChatConfigurationBridge,
  useChatConfigurationSnapshot,
} from './chatConfiguration.bridge';
import type { ChatConfigurationAnchor } from './types';

type View = 'main' | 'effort' | 'speed';

const EFFORT_STOPS: ReasoningEffort[] = ['low', 'medium', 'high'];

function effortLabel(value: ReasoningEffort): string {
  return i18n(`effort.${value}`, value);
}

function speedLabel(value: ResponseSpeed): string {
  return i18n(`chatconfig.speed.${value}`, value === 'fast' ? 'Fast' : 'Standard');
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}

function ChevronIcon({ back = false }: { back?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={back ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} /></svg>;
}

function providerName(provider: { label?: string; model?: string }): string {
  return provider.label && provider.label !== 'Default'
    ? provider.label
    : provider.model || provider.label || i18n('chatconfig.model', 'Model');
}

/* Anchored like the ChatGPT composer popover: a compact card floating above
   the trigger pill, centred on it and clamped into the visual viewport. */
function popoverStyle(anchor: ChatConfigurationAnchor | null): React.CSSProperties {
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
  /* Prefer opening above the pill; fall below only when the trigger sits in
     the top quarter of the viewport. */
  if (anchor.top - viewportTop > 200) {
    return { left, bottom: Math.max(8, viewportBottom - anchor.top + 8), width };
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
      if (target?.closest?.('.effort-trigger')) return;
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
      window.syncEffortUI?.();
    }
    closeChatConfiguration();
  };

  const openSettings = () => {
    closeChatConfiguration(false);
    window.openSettings?.();
  };

  const sliderIndex = EFFORT_STOPS.indexOf(effort);

  return (
    <div ref={popRef} className="chat-config-pop" role="dialog" aria-label={i18n('chatconfig.title', 'Chat settings')} style={popoverStyle(snapshot.anchorRect)}>
      {view === 'main' ? (
        <>
          <div role="listbox" aria-label={i18n('chatconfig.models', 'Models')}>
            {snapshot.providers.length ? snapshot.providers.map((provider, index) => (
              <button key={provider.id} type="button" className="chat-config-row" role="option" aria-selected={snapshot.activeId === provider.id} data-initial-focus={index === 0 ? 'true' : undefined} onClick={() => pickModel(provider.id)}>
                <span>
                  <strong>{providerName(provider)}</strong>
                  {provider.model && provider.model !== providerName(provider) ? <small>{provider.model}</small> : null}
                </span>
                {snapshot.activeId === provider.id ? <CheckIcon /> : null}
              </button>
            )) : <div className="chat-config-empty">{i18n('chatconfig.noModels', 'No models yet.')}</div>}
          </div>
          <div className="chat-config-divider" />
          <button type="button" className="chat-config-row" onClick={() => setView('effort')}>
            <span><strong>{i18n('chatconfig.effort', 'Reasoning effort')}</strong></span>
            <span className="chat-config-value">{effortLabel(effort)}<ChevronIcon /></span>
          </button>
          <button type="button" className="chat-config-row" onClick={() => setView('speed')}>
            <span><strong>{i18n('chatconfig.speed', 'Speed')}</strong></span>
            <span className="chat-config-value">{speedLabel(speed)}<ChevronIcon /></span>
          </button>
          <button type="button" className="chat-config-row" onClick={openSettings}>
            <span><strong>{i18n('chatconfig.manageModels', 'Manage models')}</strong></span>
          </button>
        </>
      ) : null}

      {view === 'effort' ? (
        <>
          <button type="button" className="chat-config-row" data-initial-focus="true" onClick={() => setView('main')}>
            <span><strong>{effortLabel(effort)}</strong></span>
            <span className="chat-config-value"><ChevronIcon /></span>
          </button>
          <div className="chat-config-slider">
            <input
              type="range"
              min={0}
              max={EFFORT_STOPS.length - 1}
              step={1}
              value={sliderIndex < 0 ? 1 : sliderIndex}
              aria-label={i18n('chatconfig.effort', 'Reasoning effort')}
              onChange={(event) => commitPreferences(EFFORT_STOPS[Number(event.target.value)], speed)}
            />
            <div className="chat-config-slider-dots" aria-hidden="true"><span /><span /><span /></div>
          </div>
        </>
      ) : null}

      {view === 'speed' ? (
        <div role="listbox" aria-label={i18n('chatconfig.speed', 'Speed')}>
          <button type="button" className="chat-config-row" role="option" aria-selected={speed === 'standard'} data-initial-focus="true" onClick={() => { commitPreferences(effort, 'standard'); setView('main'); }}>
            <span>
              <strong>{speedLabel('standard')}</strong>
              <small>{i18n('chatconfig.speed.standardHint', 'Works with every configured model')}</small>
            </span>
            {speed === 'standard' ? <CheckIcon /> : null}
          </button>
          <button type="button" className="chat-config-row" role="option" aria-selected={speed === 'fast'} onClick={() => { commitPreferences(effort, 'fast'); setView('main'); }}>
            <span>
              <strong>{speedLabel('fast')}</strong>
              <small>{i18n('chatconfig.speed.fastHint', 'Prefers low-latency service; falls back automatically')}</small>
            </span>
            {speed === 'fast' ? <CheckIcon /> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function mountChatConfiguration(): void {
  let host = document.getElementById('chatConfigurationReactRoot');
  if (!host) {
    host = document.createElement('div');
    host.id = 'chatConfigurationReactRoot';
    document.body.appendChild(host);
  }
  if (hostIsMountedBy(host, 'chat-configuration')) return;
  markHostMountedBy(host, 'chat-configuration');
  installChatConfigurationBridge();
  createRoot(host).render(<ChatConfiguration />);
}
