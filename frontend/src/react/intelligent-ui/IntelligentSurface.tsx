import { useEffect, useId, useState, type ReactNode } from 'react';
import { MathText } from '../rn/useInlineMath';
import { Icon } from '../../legacy/Icon';
import { DeferredMenu } from '../menu/DeferredMenu';
import { Button as BaseButton } from '../ui/Button';
import { copyText } from '../tool-run/copyText';
import { i18n } from '../../ui/legacyI18n.ts';

export type IntelligentDisplayMode = 'inline' | 'compact' | 'carousel' | 'fullscreen' | 'pip';

/** Interactive results stay embedded in the answer. */
export function IntelligentSurface({
  children,
  title,
  description,
  eyebrow,
  copyValue,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  eyebrow?: string;
  copyValue?: string;
  displayMode?: IntelligentDisplayMode;
}) {
  const titleId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    setCopyState('idle');
  }, [copyValue]);

  const copy = async () => {
    if (!copyValue) return;
    const copied = await copyText(copyValue);
    setCopyState(copied ? 'copied' : 'failed');
    setMenuOpen(false);
  };

  const showHeader = Boolean(title || description || copyValue);
  return (
    <section
      className="intui-surface-shell"
      data-display-mode="inline"
      data-has-title={Boolean(title)}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : i18n('intui.surface', 'Interactive result')}
    >
      {showHeader ? (
        <header
          className={`intui-surface-header${!title && !description ? ' is-actions-only' : ''}`}
        >
          <div className="intui-surface-heading">
            {eyebrow && title ? (
              <div className="intui-surface-eyebrow">
                <MathText text={eyebrow} />
              </div>
            ) : null}
            {title ? (
              <h3 id={titleId} className="intui-panel-title intui-surface-title">
                <MathText text={title} />
              </h3>
            ) : null}
            {description ? (
              <div className="intui-panel-description intui-surface-description">
                <MathText text={description} />
              </div>
            ) : null}
          </div>
          {copyValue ? (
            <div className="intui-surface-actions">
              <DeferredMenu
                open={menuOpen}
                onOpenChange={setMenuOpen}
                className="intui-surface-menu"
                label={i18n('intui.more', 'More actions')}
                trigger={
                  <BaseButton
                    type="button"
                    className="intui-surface-more"
                    aria-label={i18n('intui.more', 'More actions')}
                  >
                    <Icon name="more" size={18} />
                  </BaseButton>
                }
              >
                {({ FoundationMenuItem }) => (
                  <FoundationMenuItem onClick={() => void copy()}>
                    {copyState === 'copied'
                      ? i18n('intui.copied', 'Copied')
                      : copyState === 'failed'
                        ? i18n('intui.copyFailed', 'Copy failed')
                        : i18n('intui.copy', 'Copy content')}
                  </FoundationMenuItem>
                )}
              </DeferredMenu>
              <span className="sr-only" role="status" aria-live="polite">
                {copyState === 'copied'
                  ? i18n('intui.copied', 'Copied')
                  : copyState === 'failed'
                    ? i18n('intui.copyFailed', 'Copy failed')
                    : ''}
              </span>
            </div>
          ) : null}
        </header>
      ) : null}
      <div className="intui-surface-document">{children}</div>
    </section>
  );
}
