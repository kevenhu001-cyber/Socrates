import { useTranslation } from './useTranslation';

export type CanvasMode = 'view-original' | 'view-edited' | 'edit';

interface CanvasToolbarProps {
  mode: CanvasMode;
  extensionIcon: string;
  extensionLabel: string;
  hasEdited: boolean;
  onToggleEdit: () => void;
  onCopy: () => void;
  onIterate: () => void;
  onFullscreen: () => void;
  onToggleOriginal: () => void;
}

/**
 * P_canvas-mode — Edit / Done / Copy / Iterate / Fullscreen toolbar for
 * the ChatGPT-style canvas block. Always rendered above the body; the
 * Edit/Done label toggles based on the current mode.
 */
export function CanvasToolbar({
  mode,
  extensionIcon,
  extensionLabel,
  hasEdited,
  onToggleEdit,
  onCopy,
  onIterate,
  onFullscreen,
  onToggleOriginal,
}: CanvasToolbarProps) {
  const t = useTranslation();
  const editLabel = mode === 'edit' ? t('composer.canvas.done') : t('composer.canvas.edit');
  return (
    <div className="canvas-block-header">
      <span className="canvas-block-chip">
        <span
          className="canvas-block-chip-icon"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: extensionIcon }}
        />
        <span className="canvas-block-chip-label">{extensionLabel}</span>
      </span>
      <div className="canvas-block-actions">
        <button
          type="button"
          className="canvas-btn"
          aria-pressed={mode === 'view-original'}
          onClick={onToggleOriginal}
        >
          {mode === 'view-original'
            ? t('composer.canvas.editedView')
            : t('composer.canvas.original')}
        </button>
        <button
          type="button"
          className="canvas-btn"
          aria-pressed={mode === 'edit'}
          onClick={onToggleEdit}
        >
          {editLabel}
        </button>
        <button
          type="button"
          className="canvas-btn"
          onClick={onCopy}
        >
          {t('composer.canvas.copy')}
        </button>
        <button
          type="button"
          className="canvas-btn"
          onClick={onIterate}
        >
          {t('composer.canvas.iterate')}
        </button>
        <button
          type="button"
          className="canvas-btn"
          onClick={onFullscreen}
        >
          {t('composer.canvas.fullscreen')}
        </button>
      </div>
      {hasEdited ? (
        <span className="canvas-block-edited-badge">{t('composer.canvas.edited')}</span>
      ) : null}
    </div>
  );
}