import type { LinkPreviewItem } from '../../ui/linkPreviews.ts';

function LinkIcon() {
  return (
    <svg className="icon-inline" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H9q-.13 0-.25.031A2 2 0 0 1 7 10.5H4a2 2 0 1 1 0-4h1.535c.218-.376.495-.714.82-1z" />
      <path d="M9 5.5a3 3 0 0 0-2.83 4h1.098A2 2 0 0 1 9 6.5h3a2 2 0 1 1 0 4h-1.535a4 4 0 0 1-.82 1H12a3 3 0 1 0 0-6z" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="icon-inline" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
    </svg>
  );
}

export function LinkPreviews({ items, showMissingUrlHint = false }: { items: readonly LinkPreviewItem[]; showMissingUrlHint?: boolean }) {
  if (!items.length && !showMissingUrlHint) return null;
  return (
    <div className="link-previews">
      {showMissingUrlHint ? (
        <div className="link-card err no-url-hint">
          <div className="link-card-head">
            <div className="link-card-host"><LinkIcon /> No URL detected</div>
            <div className="link-card-status err">awaiting full link</div>
          </div>
          <div className="link-card-excerpt">
            You mentioned a site but the URL is missing or not in a form I can fetch. On your next turn, paste the full address including the <code>https://</code> prefix (for example, <code>https://www.topodrive.top/pricing</code>) and I&apos;ll read it for you.
          </div>
        </div>
      ) : items.map((item, index) => (
        <div className={`link-card ${item.failed ? 'err' : 'ok'}`} key={`${item.url}-${index}`}>
          <div className="link-card-head">
            <div className="link-card-host"><LinkIcon /> {item.host}</div>
            <div className={`link-card-status${item.failed ? ' err' : ''}`}>
              {item.failed && <ErrorIcon />} {item.status}
            </div>
          </div>
          <a className="link-card-title" href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
          {item.excerpt && <div className="link-card-excerpt">{item.excerpt}</div>}
        </div>
      ))}
    </div>
  );
}
