import { i18n } from '../legacy/gateway';
import { Button } from '../ui/Button';
import { openSourcesPanel } from '../sources/mount';
import { useSourcesPanel } from '../sources/sourcesStore';
import type { SourcesPanelItem } from '../sources/sourcesStore';

/**
 * The compact "Sources · n" pill under an answer. It opens the reader in the
 * transcript's second column instead of expanding a list in place.
 */
export function TurnSources({ entryId, items }: { entryId: string; items: SourcesPanelItem[] }) {
  const panel = useSourcesPanel();
  const isOpen = panel.isOpen && panel.entry?.key === entryId;
  if (!items.length) return null;
  return (
    <Button
      type="button"
      className={`turn-sources${isOpen ? ' is-active' : ''}`}
      data-source-count={items.length}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-label={i18n('citation.sourcesCount', 'Sources, {n}').replace(
        '{n}',
        String(items.length),
      )}
      onClick={(event) =>
        openSourcesPanel(
          {
            key: entryId,
            title: i18n('sources.title', 'Sources'),
            items,
          },
          event.currentTarget,
        )
      }
    >
      <svg
        className="turn-sources-icon"
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 2.5h5.5L12 5v8.5H4z" />
        <path d="M9.5 2.5V5H12M6 8h4M6 10.5h4" />
      </svg>
      <span className="turn-sources-label">{i18n('citation.sources', 'Sources')}</span>
      <span className="turn-sources-count" aria-hidden="true">
        {items.length}
      </span>
      <svg
        className="turn-sources-chevron"
        viewBox="0 0 16 16"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m4 6 4 4 4-4" />
      </svg>
    </Button>
  );
}
