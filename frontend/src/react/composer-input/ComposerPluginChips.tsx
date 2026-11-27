import { Badge } from '../ui/shadcn/badge';
import { Button } from '../ui/shadcn/button';
import { Icon } from '../../legacy/Icon';
import { useEffect, useState } from 'react';
import type { ComposerSurface } from '../../composer/types.ts';
import { getLegacyActions, isWebSearchOn } from '../legacy/gateway.ts';
import { i18n } from '../../ui/legacyI18n.ts';
import { removeComposerPlugin } from '../../composer/pluginSelection.ts';
import { useComposerPluginSelectionSnapshot } from '../composer/useComposerPluginSelection';
import { toggleComposerTools } from '../composer/composerTools.store';

/* Web search is picked from the "+" menu and then shown as a removable chip,
   the same affordance chatgpt.com uses. State lives in config/providers.js;
   setWebSearchOn() broadcasts `socrates:websearchchange`. */

/* Chips are shadcn `Badge` / `Button` (secondary): the component owns the
 * box and the skin, the stylesheet keeps the composer grid slot, the phone
 * overrides and the glyph/× cross-fade. The classes stay on the nodes because
 * the e2e specs and `composerShapeGeometry.ts` read them. */
const CHIP_BOX = [
  'inline-flex items-center justify-start gap-1.5 grow-0 shrink basis-auto min-w-0 max-w-[220px]',
  'h-(--composer-control) rounded-full border border-border/80 bg-secondary px-2.5 py-0 pr-1',
  'text-sm font-normal leading-5 text-secondary-foreground whitespace-normal transition-all duration-150 hover:border-border',
].join(' ');
const TOOL_CHIP_BOX = [
  'inline-flex items-center gap-1 grow-0 shrink-0 basis-auto',
  'h-(--composer-control) rounded-full border border-border/80 px-3 py-0 font-medium leading-none transition-colors duration-150 hover:border-border',
].join(' ');
const CHIP_ICON_BOX =
  'grid shrink-0 grow-0 basis-4 place-items-center w-4 h-4 overflow-hidden rounded-sm';
const CHIP_LABEL_BOX = 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap';
const CHIP_REMOVE_BOX = [
  'grid shrink-0 grow-0 basis-(--ui-control-xs) place-items-center size-(--ui-control-xs)',
  'rounded-sm p-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-150 [&_svg]:size-3.5',
].join(' ');

const MOBILE_COMPOSER_QUERY = '(max-width: 768px)';

function useIsMobileComposer(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_COMPOSER_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_COMPOSER_QUERY);
    const sync = () => setMobile(mq.matches);
    mq.addEventListener('change', sync);
    sync();
    return () => mq.removeEventListener('change', sync);
  }, []);
  return mobile;
}

function useWebSearchOn(): boolean {
  const [on, setOn] = useState(isWebSearchOn);
  useEffect(() => {
    const sync = () => setOn(isWebSearchOn());
    document.addEventListener('socrates:websearchchange', sync);
    sync();
    return () => {
      document.removeEventListener('socrates:websearchchange', sync);
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
      variant="secondary"
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
  const isMobile = useIsMobileComposer();
  const showWebSearchChip = useWebSearchOn() && !isMobile;
  const plugins = snapshot[surface];
  if (!plugins.length && !showWebSearchChip) return null;

  const visiblePlugins = plugins.slice(0, 4);
  const hiddenCount = Math.max(0, plugins.length - visiblePlugins.length);
  const openTools = () => {
    const trigger = document.getElementById('composerToolsBtn');
    if (trigger) toggleComposerTools(trigger, surface);
  };

  return (
    <div
      className="composer-plugin-chips"
      aria-label={i18n('composer.selectedPlugins', 'Selected plugins')}
    >
      {showWebSearchChip ? <WebSearchChip /> : null}
      {visiblePlugins.map((plugin) => (
        <Badge
          variant="secondary"
          className={`composer-plugin-chip ${CHIP_BOX}`}
          key={plugin.id}
          title={plugin.description || plugin.name}
        >
          {plugin.iconMarkup ? (
            <span
              className={`composer-plugin-chip-icon ${CHIP_ICON_BOX}`}
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: plugin.iconMarkup }}
            />
          ) : (
            <span
              className={`composer-plugin-chip-icon composer-plugin-chip-fallback ${CHIP_ICON_BOX}`}
              aria-hidden="true"
            >
              {plugin.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className={`composer-plugin-chip-label ${CHIP_LABEL_BOX}`}>{plugin.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={`composer-plugin-chip-remove ${CHIP_REMOVE_BOX}`}
            aria-label={i18n('composer.plugin.remove', 'Remove {name}').replace(
              '{name}',
              plugin.name,
            )}
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
        </Badge>
      ))}
      {hiddenCount > 0 ? (
        <Button
          type="button"
          variant="secondary"
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
