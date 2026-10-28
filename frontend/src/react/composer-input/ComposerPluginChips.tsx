import { Button } from '../ui/shadcn/button';
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

/* Chip geometry lives here, on the primitives (ADR 0024): the box comes from
 * `--composer-control` and the `--ui-*` rungs, while the stylesheet keeps the
 * skins (resting colours, hover swap, the glyph/× cross-fade) and the phone
 * overrides. The classes stay on the nodes because the e2e specs and
 * `composerShapeGeometry.ts` read them. */
const CHIP_BOX = [
  'inline-flex items-center gap-1.5 grow-0 shrink basis-auto min-w-0 max-w-[220px]',
  'h-(--composer-control) p-0 pr-1.5 pl-2.5 border-0 border-none border-current rounded-[var(--ui-radius-pill)] overflow-hidden',
  'text-sm font-normal leading-5 whitespace-normal justify-normal select-auto bg-clip-border',
].join(' ');
const TOOL_CHIP_BOX = [
  'inline-flex items-center gap-1 grow-0 shrink-0 basis-auto',
  'h-(--composer-control) p-0 pr-3 pl-2 border-0 border-none border-current rounded-[var(--ui-radius-pill)]',
  'text-sm font-normal leading-5 whitespace-nowrap justify-normal select-auto bg-clip-border',
].join(' ');
const CHIP_ICON_BOX = 'grid place-items-center grow-0 shrink-0 basis-4 w-4 h-4 overflow-hidden rounded-[var(--ui-radius-xs)]';
const CHIP_LABEL_BOX = 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap';
const CHIP_REMOVE_BOX = [
  'grid place-items-center grow-0 shrink-0 basis-(--ui-control-xs) size-(--ui-control-xs)',
  'p-0 border-0 border-none border-current rounded-[50%] bg-transparent font-normal leading-[normal] whitespace-normal justify-normal bg-clip-border [&_svg]:size-3.5',
].join(' ');


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
      variant="ghost"
      size="sm"
      className={`composer-tool-chip ${TOOL_CHIP_BOX}`}
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
        <span className={`composer-plugin-chip ${CHIP_BOX}`} key={plugin.id} title={plugin.description || plugin.name}>
          {plugin.iconMarkup ? (
            <span className={`composer-plugin-chip-icon ${CHIP_ICON_BOX}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: plugin.iconMarkup }} />
          ) : (
            <span className={`composer-plugin-chip-icon composer-plugin-chip-fallback ${CHIP_ICON_BOX}`} aria-hidden="true">{plugin.name.slice(0, 1).toUpperCase()}</span>
          )}
          <span className={`composer-plugin-chip-label ${CHIP_LABEL_BOX}`}>{plugin.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={`composer-plugin-chip-remove ${CHIP_REMOVE_BOX}`}
            aria-label={i18n('composer.plugin.remove', 'Remove {name}').replace('{name}', plugin.name)}
            title={i18n('composer.plugin.remove', 'Remove {name}').replace('{name}', plugin.name)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              removeComposerPlugin(surface, plugin.id);
            }}
          >
            <Icon name="close" />
          </Button>
        </span>
      ))}
      {hiddenCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`composer-plugin-chip composer-plugin-chip-more ${CHIP_BOX} pr-2.5`}
          onClick={openTools}
        >
          {i18n('composer.plugin.more', '+{count} more').replace('{count}', String(hiddenCount))}
        </Button>
      ) : null}
    </div>
  );
}

export { ComposerPluginChips, useWebSearchOn };
