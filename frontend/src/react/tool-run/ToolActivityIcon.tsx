import { useEffect, useState } from 'react';
import { monogramOf } from '@socrates/ui/turn';
import { faviconProxyUrl } from '../../legacy/faviconProxy';
import { isInlineSearchTool, toolCategory } from '../../render/toolCategory';
import { toolIcon } from '../../legacy/icons/toolIcons.ts';
import { connectorActivityOf, connectorToolIdOf } from '../../legacy/toolActivity.ts';
import { hostOf, urlOf } from '../../legacy/toolPresentationModel';
import { normalizeSources, type ToolCallRecord } from './toolRunModel';

// Reuse local vendor marks, loaded only for connector activity.
const marks = new Map<string, string>();
let catalog: Promise<typeof import('../../connector-icons')> | undefined;

function isConnector(name: string): boolean {
  return name.startsWith('oc_') || Boolean(connectorActivityOf(name, undefined));
}

export function toolActivitySites(call?: ToolCallRecord): string[] {
  if (!call || isConnector(call.name)) return [];
  if (toolCategory(call.name) === 'fetch') {
    const url = urlOf(call.input);
    return faviconProxyUrl(url) ? [url] : [];
  }
  if (!isInlineSearchTool(call.name)) return [];
  const urls = new Map<string, string>();
  for (const source of normalizeSources(call.results)) {
    if (source.host && !urls.has(source.host) && faviconProxyUrl(source.url)) {
      urls.set(source.host, source.url);
      if (urls.size === 2) break;
    }
  }
  return [...urls.values()];
}

/** Deduplicate actual returned origins across the turn, not guessed websites. */
export function turnActivitySites(calls: ReadonlyArray<ToolCallRecord>): string[] {
  const urls = new Map<string, string>();
  for (const call of calls) {
    for (const url of toolActivitySites(call)) {
      const key = faviconProxyUrl(url);
      if (key && !urls.has(key)) urls.set(key, url);
      if (urls.size === 3) return [...urls.values()];
    }
  }
  return [...urls.values()];
}

function SiteMark({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = faviconProxyUrl(url);
  return (
    <span className="tool-site-mark" data-testid="tool-site-mark" title={hostOf(url)}>
      {!loaded ? <span>{monogramOf(hostOf(url))}</span> : null}
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}

export function ToolSiteMarks({ sites }: { sites: readonly string[] }) {
  return (
    <span className="tool-site-marks" aria-hidden="true">
      {sites.map((url) => (
        <SiteMark key={faviconProxyUrl(url)} url={url} />
      ))}
    </span>
  );
}

export function ToolActivityIcon({ name, sites = [] }: { name: string; sites?: string[] }) {
  const [resolved, setResolved] = useState({ name, markup: marks.get(name) || '' });
  useEffect(() => {
    if (marks.has(name) || !isConnector(name)) return;
    let current = true;
    catalog ??= import('../../connector-icons');
    void catalog
      .then((icons) => {
        const id = connectorToolIdOf(name, icons.connectorIconIds());
        const markup = icons.getConnectorActivityIconMarkup(id);
        marks.set(name, markup);
        if (current) setResolved({ name, markup });
      })
      .catch(() => {
        // Keep the category icon if the optional vendor chunk cannot load.
        catalog = undefined;
      });
    return () => {
      current = false;
    };
  }, [name]);

  if (sites.length) {
    return <ToolSiteMarks sites={sites} />;
  }
  const brand = marks.get(name) || (resolved.name === name ? resolved.markup : '');
  return (
    <span
      className={`tool-inline-tool-icon${brand ? ' is-connector-brand' : ''}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: brand || toolIcon(name) }}
    />
  );
}
