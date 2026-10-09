import { useEffect, useLayoutEffect, useState } from 'react';
import type { ComposerSurface } from '../../composer/types.ts';
import { syncComposerShellFlags } from '../../ui/composerShape.js';
import { getLegacyActions, i18n, isWebSearchOn } from '../legacy/gateway.ts';
import { removeComposerPlugin, useComposerPluginSelectionSnapshot } from '../composer/pluginSelection';

/* Web search is picked from the "+" menu and then shown as a removable chip,
   the same affordance chatgpt.com uses. State lives in config/providers.js;
   setWebSearchOn() broadcasts `socrates:websearchchange`.
   Desktop only for now: the phone composer's chip row (restore/ mobile
   layer) still overlaps the "+" button, so phones keep the active dot in
   the tools menu until that layout moves to parity/. */
const DESKTOP_COMPOSER_QUERY = '(min-width: 769px)';

function useWebSearchOn(): boolean {
  const read = () => isWebSearchOn()
    && window.matchMedia(DESKTOP_COMPOSER_QUERY).matches;
  const [on, setOn] = useState(read);
  useEffect(() => {
    const sync = () => setOn(read());
    const media = window.matchMedia(DESKTOP_COMPOSER_QUERY);
    document.addEventListener('socrates:websearchchange', sync);
    media.addEventListener('change', sync);
    sync();
    return () => {
      document.removeEventListener('socrates:websearchchange', sync);
      media.removeEventListener('change', sync);
    };
  }, []);
  return on;
}

function WebSearchChip() {
  const label = i18n('composer.tools.webSearch', 'Web search');
  const removeLabel = i18n('composer.webSearch.remove', 'Web search, click to remove');
  return (
    <button
      type="button"
      className="composer-tool-chip"
      data-tool="webSearch"
      aria-label={removeLabel}
      title={removeLabel}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        getLegacyActions().composer.toggleWebSearch?.();
      }}
    >
      <span className="composer-tool-chip-icon" aria-hidden="true">
        <svg className="composer-tool-chip-glyph" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="7.25" />
          <path d="M2.75 10h14.5M10 2.75c2 2 3 4.4 3 7.25s-1 5.25-3 7.25c-2-2-3-4.4-3-7.25s1-5.25 3-7.25Z" />
        </svg>
        <svg className="composer-tool-chip-close" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="m6 6 8 8M14 6l-8 8" />
        </svg>
      </span>
      <span className="composer-tool-chip-label">{label}</span>
    </button>
  );
}

function ComposerPluginChips({ surface }: { surface: ComposerSurface }) {
  const snapshot = useComposerPluginSelectionSnapshot();
  const webSearchOn = useWebSearchOn();
  const plugins = snapshot[surface];
  useLayoutEffect(() => {
    try {
      const host = document.getElementById('composerInputWrap');
      if (host) syncComposerShellFlags(host);
    } catch (_) { /* detached shell */ }
  }, [plugins.length, webSearchOn, surface]);
  if (!plugins.length && !webSearchOn) return null;

  const visiblePlugins = plugins.slice(0, 4);
  const hiddenCount = Math.max(0, plugins.length - visiblePlugins.length);
  const openTools = () => {
    const trigger = document.getElementById('composerToolsBtn');
    if (trigger) {
      getLegacyActions().composer.toggleTools?.(trigger, surface);
    }
  };

  return (
    <div className="composer-plugin-chips" aria-label="Selected plugins">
      {webSearchOn ? <WebSearchChip /> : null}
      {visiblePlugins.map((plugin) => (
        <span className="composer-plugin-chip" key={plugin.id} title={plugin.description || plugin.name}>
          {plugin.iconMarkup ? (
            <span className="composer-plugin-chip-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: plugin.iconMarkup }} />
          ) : (
            <span className="composer-plugin-chip-icon composer-plugin-chip-fallback" aria-hidden="true">{plugin.name.slice(0, 1).toUpperCase()}</span>
          )}
          <span className="composer-plugin-chip-label">{plugin.name}</span>
          <button
            type="button"
            className="composer-plugin-chip-remove"
            aria-label={`Remove ${plugin.name}`}
            title={`Remove ${plugin.name}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              removeComposerPlugin(surface, plugin.id);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
          </button>
        </span>
      ))}
      {hiddenCount > 0 ? (
        <button type="button" className="composer-plugin-chip composer-plugin-chip-more" onClick={openTools}>
          +{hiddenCount} more
        </button>
      ) : null}
    </div>
  );
}

export { ComposerPluginChips, useWebSearchOn };
