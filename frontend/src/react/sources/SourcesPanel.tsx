import { useEffect, useRef, useState } from 'react';
import { createRootSlot } from '../lib/boot/ownedRoot';
import { Button } from '../ui/Button';
import { i18n } from '../legacy/gateway';
import { faviconProxyUrl } from '../../ui/faviconProxy';
import { closeSources, useSourcesPanel, type SourcesPanelItem } from './sourcesStore';

const rootSlot = createRootSlot('sources-panel');
let mounted = false;

export function mountSourcesPanel(): void {
  if (mounted) return;
  const container = document.getElementById('sourcesPanel');
  if (!container) return;
  rootSlot.mount(container, <SourcesPanel />);
  mounted = true;
}

function hostOf(item: SourcesPanelItem): string {
  if (item.host) return item.host;
  try {
    return new URL(item.url).hostname;
  } catch {
    return item.source || item.url;
  }
}

function monogramOf(host: string): string {
  const first = host.replace(/^www\./i, '').charAt(0);
  return /[a-z0-9]/i.test(first) ? first.toUpperCase() : '?';
}

function SourceCard({ item, index }: { item: SourcesPanelItem; index: number }) {
  const host = hostOf(item);
  const [iconFailed, setIconFailed] = useState(false);
  const favicon = faviconProxyUrl(item.url);
  return (
    <li className="sources-list-item">
      <a
        className="source-card"
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${item.title} · ${host}`}
      >
        <span className="source-card-mark" aria-hidden="true">
          {favicon && !iconFailed ? (
            <img
              className="source-card-favicon"
              src={favicon}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setIconFailed(true)}
            />
          ) : (
            <span>{monogramOf(host)}</span>
          )}
          <span className="source-card-index">{index + 1}</span>
        </span>
        <span className="source-card-copy">
          <span className="source-card-site">
            {item.source || host}
            {item.date ? <span className="source-card-date"> · {item.date}</span> : null}
          </span>
          <span className="source-card-title">{item.title}</span>
          {item.snippet ? <span className="source-card-snippet">{item.snippet}</span> : null}
        </span>
        <svg
          className="source-card-arrow"
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 3h7v7M13 3 5.5 10.5M12 9v4H3V4h4" />
        </svg>
      </a>
    </li>
  );
}

export function SourcesPanel() {
  const { isOpen, entry } = useSourcesPanel();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);
  const [, setLanguageRevision] = useState(0);

  /* The host is static markup outside React so the panel can occupy the
     transcript's second grid column without remounting the app shell. */
  useEffect(() => {
    const host = document.getElementById('sourcesPanel');
    const backdrop = document.getElementById('sourcesBackdrop');
    const shell = document.getElementById('appShell');
    host?.classList.toggle('hidden', !isOpen);
    host?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    backdrop?.classList.toggle('hidden', !isOpen);
    backdrop?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    shell?.classList.toggle('has-sources-open', isOpen);
    if (isOpen && !wasOpen.current) closeRef.current?.focus();
    wasOpen.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    const refresh = () => setLanguageRevision((revision) => revision + 1);
    document.addEventListener('socrates:langchange', refresh);
    return () => document.removeEventListener('socrates:langchange', refresh);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeSources();
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [isOpen]);

  useEffect(() => {
    const backdrop = document.getElementById('sourcesBackdrop');
    if (!backdrop) return;
    const dismiss = () => closeSources();
    backdrop.addEventListener('pointerdown', dismiss);
    return () => backdrop.removeEventListener('pointerdown', dismiss);
  }, []);

  if (!isOpen || !entry) return null;

  return (
    <div className="sources-panel-inner">
      <header className="sources-panel-header">
        <div className="sources-panel-heading">
          <svg
            className="sources-panel-icon"
            viewBox="0 0 16 16"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 2.5h5.5L12 5v8.5H4z" />
            <path d="M9.5 2.5V5H12M6 8h4M6 10.5h4" />
          </svg>
          <h2 className="sources-panel-title">{entry.title}</h2>
          <span className="sources-panel-count" aria-hidden="true">
            {entry.items.length}
          </span>
        </div>
        <Button
          ref={closeRef}
          type="button"
          className="sources-panel-close"
          onClick={closeSources}
          aria-label={i18n('sources.close', 'Close sources')}
          title={i18n('sources.close', 'Close sources')}
        >
          <svg
            viewBox="0 0 16 16"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </Button>
      </header>
      <div className="sources-panel-body">
        <ol className="sources-list" aria-label={entry.title}>
          {entry.items.map((item, index) => (
            <SourceCard key={item.id} item={item} index={index} />
          ))}
        </ol>
      </div>
    </div>
  );
}
