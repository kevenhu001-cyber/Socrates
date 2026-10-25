import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from 'react';
import { Check, Ellipsis, Maximize2, X } from 'lucide-react';
import { i18n } from '../legacy/gateway';
import { DeferredMenu } from '../menu/DeferredMenu';
import { INTERFACE_ICON_STROKE } from '../../ui/icons/interfaceIcons';
import { useExpandedSurface } from './useExpandedSurface';

export type IntelligentDisplayMode = 'inline' | 'compact' | 'carousel' | 'fullscreen' | 'pip';
const ExpandedSurface = createContext(false);
export const useExpandedSurfaceState = () => useContext(ExpandedSurface);

/** The document stays mounted while its shell changes presentation. */
export function IntelligentSurface({ children, title, description, displayMode = 'inline' }: {
  children: ReactNode;
  title?: string;
  description?: string;
  displayMode?: IntelligentDisplayMode;
}) {
  const [choice, setChoice] = useState<IntelligentDisplayMode | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const mode = choice || displayMode;
  const dialog = useRef<HTMLDialogElement>(null);
  const previousMode = useRef<IntelligentDisplayMode>('inline');
  const titleId = useId();
  const exit = useCallback(() => setChoice(previousMode.current), []);
  const expanded = mode === 'fullscreen';
  useExpandedSurface(dialog, expanded, exit);
  const toggleExpanded = () => {
    setMenuOpen(false);
    if (expanded) exit();
    else { previousMode.current = mode; setChoice('fullscreen'); }
  };
  const expandLabel = expanded ? i18n('dialog.close', 'Close') : i18n('chrome.fullscreen', 'Fullscreen');

  return <dialog ref={dialog} open
    className="intui-surface-shell" data-display-mode={mode} data-has-title={Boolean(title)}
    role={expanded ? 'dialog' : 'region'} aria-modal={expanded ? false : undefined}
    aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : i18n('intui.surface', 'Interactive result')}
    onCancel={(event) => { event.preventDefault(); exit(); }}>
    <header className="intui-surface-header">
    <div className="intui-surface-heading">
      {title ? <h3 id={titleId} className="intui-panel-title intui-surface-title">{title}</h3>
        : <span className="intui-surface-label">{i18n('intui.surface', 'Interactive result')}</span>}
      {description ? <div className="intui-panel-description intui-surface-description">{description}</div> : null}
    </div>
    <div className="intui-surface-toolbar">
      <button type="button" className="intui-surface-expand" aria-label={expandLabel} title={expandLabel}
        aria-expanded={expanded} onClick={toggleExpanded}>
        {expanded ? <X size={18} strokeWidth={INTERFACE_ICON_STROKE} aria-hidden /> : <Maximize2 size={16} strokeWidth={INTERFACE_ICON_STROKE} aria-hidden />}
      </button>
      {!expanded ? <DeferredMenu open={menuOpen} onOpenChange={setMenuOpen}
        className="intui-surface-menu" label={i18n('intui.displayMode', 'Display mode')}
        trigger={<button type="button" className="intui-surface-options" aria-label={i18n('intui.displayMode', 'Display mode')} title={i18n('intui.displayMode', 'Display mode')}><Ellipsis size={16} aria-hidden /></button>}>
        {({ FoundationMenuRadioGroup, FoundationMenuRadioItem }) => <FoundationMenuRadioGroup value={mode} onValueChange={(value) => setChoice(value as IntelligentDisplayMode)}>
          {(['inline', 'compact', 'carousel', 'pip'] as const).map((value) => <FoundationMenuRadioItem key={value} value={value}>
            <span>{i18n(`intui.${value}`, { inline: 'Inline', compact: 'Compact', carousel: 'Carousel', pip: 'Floating' }[value])}</span>
            <Check size={16} aria-hidden className="intui-surface-selected" />
          </FoundationMenuRadioItem>)}
        </FoundationMenuRadioGroup>}
      </DeferredMenu> : null}
      {mode === 'pip' ? <button type="button" className="intui-surface-return" aria-label={i18n('intui.inline', 'Inline')} title={i18n('intui.inline', 'Inline')} onClick={() => setChoice('inline')}><X size={16} aria-hidden /></button> : null}
    </div>
    </header>
    <ExpandedSurface.Provider value={expanded}>
      <div className="intui-surface-document">{children}</div>
    </ExpandedSurface.Provider>
  </dialog>;
}
