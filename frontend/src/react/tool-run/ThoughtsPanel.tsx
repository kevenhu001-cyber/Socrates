import { useEffect, useRef, useState } from 'react';
import { createRootSlot } from '../lib/boot/ownedRoot';
import { Button } from '../ui/Button';
import { Icon } from '../../legacy/Icon';
import { i18n } from '../../ui/legacyI18n.ts';
import { WebUiTheme } from '../rn/WebUiTheme';
import { ToolRunDisclosureProvider } from './ToolRunDisclosure';
import { closeThoughts, useThoughtsPanel } from './thoughtsStore';

const rootSlot = createRootSlot('thoughts-panel');
let mounted = false;

function ensureThoughtsHost(): HTMLElement | null {
  let host = document.getElementById('thoughtsPanel');
  let backdrop = document.getElementById('thoughtsBackdrop');
  const parent = document.querySelector('main.main') || document.body;
  if (!parent) return null;
  if (!host) {
    host = document.createElement('aside');
    host.className = 'thoughts-panel hidden';
    host.id = 'thoughtsPanel';
    host.setAttribute('aria-label', i18n('think.thoughtsTitle', 'Thoughts'));
    parent.appendChild(host);
  }
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'thoughts-backdrop hidden';
    backdrop.id = 'thoughtsBackdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    parent.appendChild(backdrop);
  }
  return host;
}

export function mountThoughtsPanel(): void {
  if (mounted) return;
  const container = ensureThoughtsHost();
  if (!container) return;
  rootSlot.mount(container, <ThoughtsPanel />);
  mounted = true;
}

function trapFocusOnMobileSheet(
  event: KeyboardEvent,
  media: MediaQueryList,
  host: HTMLElement | null,
) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeThoughts();
    return;
  }
  if (event.key !== 'Tab' || !media.matches || !host) return;
  const focusable = Array.from(
    host.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'),
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !host.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !host.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function useThoughtsDialogLifecycle(
  isOpen: boolean,
  closeRef: { current: HTMLButtonElement | null },
  resetDrag: () => void,
) {
  const wasOpen = useRef(false);

  useEffect(() => {
    const host = document.getElementById('thoughtsPanel');
    const backdrop = document.getElementById('thoughtsBackdrop');
    const shell = document.getElementById('appShell');
    host?.classList.toggle('hidden', !isOpen);
    host?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    backdrop?.classList.toggle('hidden', !isOpen);
    backdrop?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    shell?.classList.toggle('has-thoughts-open', isOpen);
    if (!isOpen) resetDrag();
    if (isOpen && !wasOpen.current) closeRef.current?.focus({ preventScroll: true });
    wasOpen.current = isOpen;
  }, [isOpen, closeRef, resetDrag]);

  useEffect(() => {
    if (!isOpen) return;
    const host = document.getElementById('thoughtsPanel');
    const media = window.matchMedia('(max-width: 768px)');
    const syncRole = () => {
      host?.setAttribute('role', 'dialog');
      host?.setAttribute('aria-labelledby', 'thoughtsPanelTitle');
      if (media.matches) host?.setAttribute('aria-modal', 'true');
      else host?.removeAttribute('aria-modal');
    };
    syncRole();
    media.addEventListener('change', syncRole);
    const dismiss = (event: KeyboardEvent) => trapFocusOnMobileSheet(event, media, host);
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('keydown', dismiss);
      media.removeEventListener('change', syncRole);
      host?.removeAttribute('aria-modal');
      host?.removeAttribute('role');
      host?.removeAttribute('aria-labelledby');
    };
  }, [isOpen]);

  useEffect(() => {
    const backdrop = document.getElementById('thoughtsBackdrop');
    if (!backdrop) return;
    const dismiss = () => closeThoughts();
    backdrop.addEventListener('pointerdown', dismiss);
    return () => backdrop.removeEventListener('pointerdown', dismiss);
  }, []);
}

export function ThoughtsPanel() {
  const { isOpen, entry } = useThoughtsPanel();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [, setLanguageRevision] = useState(0);

  useThoughtsDialogLifecycle(isOpen, closeRef, () => setDragOffsetY(0));

  useEffect(() => {
    const refresh = () => setLanguageRevision((revision) => revision + 1);
    document.addEventListener('socrates:langchange', refresh);
    return () => document.removeEventListener('socrates:langchange', refresh);
  }, []);

  if (!isOpen || !entry) return null;

  const panelStyle =
    dragOffsetY > 0 ? { transform: `translateY(${dragOffsetY}px)`, transition: 'none' } : undefined;

  return (
    <div className="thoughts-panel-inner" style={panelStyle}>
      <header
        className="thoughts-panel-header"
        onTouchStart={(event) => {
          dragStartY.current = event.touches[0]?.clientY ?? null;
        }}
        onTouchMove={(event) => {
          if (dragStartY.current === null) return;
          const delta = (event.touches[0]?.clientY ?? dragStartY.current) - dragStartY.current;
          if (delta > 0) setDragOffsetY(delta);
        }}
        onTouchEnd={() => {
          if (dragOffsetY > 72) {
            setDragOffsetY(0);
            dragStartY.current = null;
            closeThoughts();
            return;
          }
          setDragOffsetY(0);
          dragStartY.current = null;
        }}
      >
        <span className="thoughts-sheet-handle" aria-hidden="true" />
        <div className="thoughts-panel-heading">
          <Icon name="thinking" size={16} className="thoughts-panel-icon" />
          <h2 id="thoughtsPanelTitle" className="thoughts-panel-title">
            {entry.title}
          </h2>
          {entry.durationLabel ? (
            <span className="thoughts-panel-duration">{entry.durationLabel}</span>
          ) : null}
        </div>
        <Button
          ref={closeRef}
          type="button"
          className="thoughts-panel-close"
          onClick={closeThoughts}
          aria-label={i18n('think.closeThoughts', 'Close thoughts')}
          title={i18n('think.closeThoughts', 'Close thoughts')}
        >
          <Icon name="close" size={16} />
        </Button>
      </header>
      <div className="thoughts-panel-body">
        <WebUiTheme>
          <ToolRunDisclosureProvider key={entry.key}>
            <div className="thoughts-timeline" data-testid="thinking-timeline">
              {entry.content}
            </div>
          </ToolRunDisclosureProvider>
        </WebUiTheme>
      </div>
    </div>
  );
}
