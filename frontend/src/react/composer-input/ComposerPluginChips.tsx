import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Icon } from '../../ui/Icon';
import { useEffect, useLayoutEffect, useState } from 'react';
import type { ComposerSurface } from '../../composer/types.ts';
import { syncComposerShellFlags } from '../../ui/composerShape.js';
import { getLegacyActions, i18n, isWebSearchOn } from '../legacy/gateway.ts';
import { removeComposerPlugin } from '../../composer/pluginSelection.ts';
import { useComposerPluginSelectionSnapshot } from '../composer/useComposerPluginSelection';

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
    <Button
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
        <Icon name="globe" className="composer-tool-chip-glyph" />
        <Icon name="close" className="composer-tool-chip-close" />
      </span>
      <span className="composer-tool-chip-label">{label}</span>
    </Button>
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
    <div className="composer-plugin-chips" aria-label="Selected plugins" data-i18n-aria="composer.selectedPlugins">
      {webSearchOn ? <WebSearchChip /> : null}
      {visiblePlugins.map((plugin) => (
        <span className="composer-plugin-chip" key={plugin.id} title={plugin.description || plugin.name}>
          {plugin.iconMarkup ? (
            <span className="composer-plugin-chip-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: plugin.iconMarkup }} />
          ) : (
            <span className="composer-plugin-chip-icon composer-plugin-chip-fallback" aria-hidden="true">{plugin.name.slice(0, 1).toUpperCase()}</span>
          )}
          <span className="composer-plugin-chip-label">{plugin.name}</span>
          <IconButton
            className="composer-plugin-chip-remove"
            label={i18n('composer.plugin.remove', 'Remove {name}').replace('{name}', plugin.name)}
            icon="close"
            title={i18n('composer.plugin.remove', 'Remove {name}').replace('{name}', plugin.name)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              removeComposerPlugin(surface, plugin.id);
            }}
          />
        </span>
      ))}
      {hiddenCount > 0 ? (
        <Button type="button" className="composer-plugin-chip composer-plugin-chip-more" onClick={openTools}>
          {i18n('composer.plugin.more', '+{count} more').replace('{count}', String(hiddenCount))}
        </Button>
      ) : null}
    </div>
  );
}

export { ComposerPluginChips, useWebSearchOn };
