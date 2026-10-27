import { Button as UiButton } from '../ui/Button';
import { useTranslation } from './useTranslation';

export type CanvasMode = 'view-original' | 'view-edited' | 'edit';

interface CanvasToolbarProps {
  mode: CanvasMode;
  extensionIcon: string;
  extensionLabel: string;
  hasEdited: boolean;
  isFullscreen?: boolean;
  onToggleEdit: () => void;
  onCopy: () => void;
  onIterate: () => void;
  onFullscreen: () => void;
  onToggleOriginal: () => void;
  onOpenWorkbench?: () => void;
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
  isFullscreen,
  onToggleEdit,
  onCopy,
  onIterate,
  onFullscreen,
  onToggleOriginal,
  onOpenWorkbench,
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
        {onOpenWorkbench && (
          <UiButton
            type="button"
            className="canvas-btn canvas-workbench-btn"
            data-action="canvas-workbench"
            onClick={onOpenWorkbench}
          >
            {t('workbench.title')}
          </UiButton>
        )}
        <UiButton
          type="button"
          className="canvas-btn"
          aria-pressed={mode === 'view-original'}
            data-action="canvas-original"
          onClick={onToggleOriginal}
        >
          {mode === 'view-original'
            ? t('composer.canvas.editedView')
            : t('composer.canvas.original')}
        </UiButton>
        <UiButton
          type="button"
          className="canvas-btn"
          aria-pressed={mode === 'edit'}
            data-action="canvas-edit"
          onClick={onToggleEdit}
        >
          {editLabel}
        </UiButton>
        <UiButton
          type="button"
          className="canvas-btn"
          onClick={onCopy}
            data-action="canvas-copy"
        >
          {t('composer.canvas.copy')}
        </UiButton>
        <UiButton
          type="button"
          className="canvas-btn"
          onClick={onIterate}
            data-action="canvas-iterate"
        >
          {t('composer.canvas.iterate')}
        </UiButton>
        <UiButton
          type="button"
          className="canvas-btn"
          aria-pressed={isFullscreen}
            data-action="canvas-fullscreen"
          onClick={onFullscreen}
        >
          {isFullscreen ? t('composer.canvas.exitFullscreen') : t('composer.canvas.fullscreen')}
        </UiButton>
      </div>
      {hasEdited ? (
        <span className="canvas-block-edited-badge">{t('composer.canvas.edited')}</span>
      ) : null}
    </div>
  );
}