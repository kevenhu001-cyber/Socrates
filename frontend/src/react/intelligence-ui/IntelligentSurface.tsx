import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, PanelsTopLeft, X } from 'lucide-react';
import { i18n } from '../legacy/gateway';

export type IntelligentDisplayMode = 'inline' | 'compact' | 'carousel' | 'fullscreen' | 'pip';

/** The document stays mounted while its shell changes presentation. */
export function IntelligentSurface({ children, displayMode = 'inline' }: { children: ReactNode; displayMode?: IntelligentDisplayMode }) {
  const [choice, setChoice] = useState<IntelligentDisplayMode | null>(null);
  const mode = choice || displayMode;
  const dialog = useRef<HTMLDialogElement>(null);
  const previousMode = useRef<IntelligentDisplayMode>('inline');
  const exit = () => setChoice(previousMode.current);

  useEffect(() => {
    if (mode !== 'fullscreen') return;
    const shell = dialog.current!;
    const focused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    shell.close();
    shell.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      shell.close();
      shell.show();
      document.body.style.overflow = overflow;
      if (focused?.isConnected) focused.focus();
    };
  }, [mode]);

  return <dialog ref={dialog} open className="intui-surface-shell" data-display-mode={mode}
    role={mode === 'fullscreen' ? 'dialog' : 'region'} aria-label={i18n('intui.surface', 'Interactive result')}
    onCancel={(event) => { event.preventDefault(); exit(); }}>
    <div className="intui-surface-toolbar">
      <span className="intui-surface-label"><PanelsTopLeft size={16} aria-hidden />{i18n('intui.surface', 'Interactive result')}</span>
      {mode !== 'fullscreen' ? <label>
        <span className="sr-only">{i18n('intui.displayMode', 'Display mode')}</span>
        <select value={mode} onChange={(event) => setChoice(event.currentTarget.value as IntelligentDisplayMode)}>
          <option value="inline">{i18n('intui.inline', 'Inline')}</option>
          <option value="compact">{i18n('intui.compact', 'Compact')}</option>
          <option value="carousel">{i18n('intui.carousel', 'Carousel')}</option>
          <option value="pip">{i18n('intui.pip', 'Floating')}</option>
        </select>
      </label> : null}
      <button type="button" className="intui-surface-expand" aria-label={mode === 'fullscreen' ? i18n('dialog.close', 'Close') : i18n('chrome.fullscreen', 'Fullscreen')} title={mode === 'fullscreen' ? i18n('dialog.close', 'Close') : i18n('chrome.fullscreen', 'Fullscreen')} onClick={() => {
        if (mode === 'fullscreen') exit();
        else { previousMode.current = mode; setChoice('fullscreen'); }
      }}>{mode === 'fullscreen' ? <X size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}</button>
      {mode === 'pip' ? <button type="button" onClick={() => setChoice('inline')}>{i18n('intui.inline', 'Inline')}</button> : null}
    </div>
    <div className="intui-surface-document">{children}</div>
  </dialog>;
}
