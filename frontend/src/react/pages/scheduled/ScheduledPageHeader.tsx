import { scheduledText } from './scheduled.copy';

interface ScheduledPageHeaderProps {
  query: string;
  onQueryChange: (query: string) => void;
  onCreate: () => void;
}

function SearchGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}

function PlusGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

export function ScheduledPageHeader({ query, onQueryChange, onCreate }: ScheduledPageHeaderProps) {
  const searchLabel = scheduledText('scheduled.search', 'Search tasks');
  return (
    <div className="workspace-page-head">
      <div>
        <h1 id="scheduled-directory-title">{scheduledText('scheduled.title', 'Scheduled')}</h1>
        <p>{scheduledText('scheduled.subtitle', 'Let Socrates plan follow-ups, reminders, and recurring updates for you.')}</p>
      </div>
      <div className="workspace-head-actions">
        <label className="workspace-search-field">
          <SearchGlyph />
          <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={searchLabel} aria-label={searchLabel} />
        </label>
        <button type="button" className="workspace-create-button" onClick={onCreate}>
          <PlusGlyph />
          <span>{scheduledText('scheduled.new', 'New')}</span>
        </button>
      </div>
    </div>
  );
}
